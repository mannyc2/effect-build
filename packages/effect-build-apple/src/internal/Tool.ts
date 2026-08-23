import { Cause, Clock, Effect, Exit, FileSystem, Option, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleToolChanged,
  AppleToolFailed,
  AppleToolUnavailable,
  type Digest,
  type OutputObservation,
  type ToolError,
  type ToolInvocation,
  type ToolReference,
} from "../Artifact.js";
import * as Sha256 from "./Sha256.js";

export type { ToolError } from "../Artifact.js";

declare const SelectedToolTypeId: unique symbol;

export interface SelectedTool extends ToolReference {
  readonly [SelectedToolTypeId]: typeof SelectedToolTypeId;
}

export interface SelectOptions {
  readonly name: string;
  readonly path: string;
}

export interface RunOptions {
  readonly tool: SelectedTool;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
}

export type ToolServices = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

export interface RunCompletion {
  readonly invocation: ToolInvocation;
  readonly postAuthentication: Exit.Exit<void, AppleToolChanged>;
}

const selected = new WeakSet<object>();
const outputLimit = 1024 * 1024;
const digest = (value: string): Digest => Object.freeze({ algorithm: "sha256" as const, value });
const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const collect = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<OutputObservation, unknown> =>
  Stream.runFold(
    stream,
    () => ({ chunks: [] as Uint8Array[], bytes: 0, truncated: false }),
    (state, chunk) => {
      const remaining = outputLimit - state.bytes;
      if (remaining <= 0) return { ...state, truncated: true };
      const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
      return {
        chunks: [...state.chunks, retained],
        bytes: state.bytes + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Object.freeze({ text: new TextDecoder().decode(bytes), truncated: state.truncated });
    }),
  );

const unavailable = (options: SelectOptions, reason: string): AppleToolUnavailable =>
  new AppleToolUnavailable({ tool: options.name, path: options.path, reason });

export const select = (
  options: SelectOptions,
): Effect.Effect<SelectedTool, AppleToolUnavailable, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!path.isAbsolute(options.path)) return yield* unavailable(options, "an exact absolute path is required");
    const canonical = yield* fileSystem.realPath(options.path).pipe(
      Effect.mapError((error) => unavailable(options, describe(error))),
    );
    const normalized = path.normalize(canonical);
    const information = yield* fileSystem.stat(normalized).pipe(
      Effect.mapError((error) => unavailable(options, describe(error))),
    );
    if (information.type !== "File") return yield* unavailable(options, "expected a regular file");
    if (path.sep !== "\\" && (Number(information.mode) & 0o111) === 0) {
      return yield* unavailable(options, "file is not executable");
    }
    const hashed = yield* Sha256.file(normalized).pipe(
      Effect.mapError((error) => unavailable(options, describe(error))),
    );
    if (hashed.bytes !== Number(information.size)) {
      return yield* unavailable(options, "file size changed during hashing");
    }
    const tool = Object.freeze({ name: options.name, path: normalized, sha256: digest(hashed.value) }) as SelectedTool;
    selected.add(tool);
    return tool;
  });

export const reauthenticate = (
  tool: SelectedTool,
): Effect.Effect<void, AppleToolChanged, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!selected.has(tool)) {
      return yield* new AppleToolChanged({
        tool: tool.name,
        path: tool.path,
        expected: tool.sha256.value,
        observed: "unauthenticated descriptor",
      });
    }
    const observed = yield* Effect.option(
      Effect.gen(function*() {
        const canonical = path.normalize(yield* fileSystem.realPath(tool.path));
        const information = yield* fileSystem.stat(canonical);
        if (canonical !== tool.path || information.type !== "File") return undefined;
        if (path.sep !== "\\" && (Number(information.mode) & 0o111) === 0) return undefined;
        return (yield* Sha256.file(canonical)).value;
      }),
    );
    const value = Option.isSome(observed) ? observed.value : undefined;
    if (value !== tool.sha256.value) {
      return yield* new AppleToolChanged({
        tool: tool.name,
        path: tool.path,
        expected: tool.sha256.value,
        observed: value ?? "unavailable",
      });
    }
  });

const processFailure = (
  tool: SelectedTool,
  error: unknown,
): AppleToolFailed =>
  new AppleToolFailed({
    tool: tool.name,
    path: tool.path,
    exitCode: -1,
    stdout: "",
    stderr: describe(error),
    stdoutTruncated: false,
    stderrTruncated: false,
  });

export const runWithCompletion = <A, E, R>(
  options: RunOptions,
  onComplete: (completion: RunCompletion) => Effect.Effect<A, E, R>,
): Effect.Effect<A, ToolError | E, ToolServices | R> =>
  Effect.gen(function*() {
    yield* reauthenticate(options.tool);
    const startedAtEpochMillis = yield* Clock.currentTimeMillis;
    return yield* Effect.uninterruptible(
      Effect.gen(function*() {
        const completion = yield* Effect.interruptible(
          Effect.catchCause(
            Effect.scoped(
              Effect.gen(function*() {
                const handle = yield* ChildProcess.make(options.tool.path, options.args, {
                  shell: false,
                  forceKillAfter: "2 seconds",
                  ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
                });
                const [stdout, stderr, exitCode] = yield* Effect.all(
                  [collect(handle.stdout), collect(handle.stderr), handle.exitCode] as const,
                  { concurrency: "unbounded" },
                );
                return { stdout, stderr, exitCode: Number(exitCode) };
              }),
            ),
            (cause) => Effect.failCause(Cause.map(cause, (error) => processFailure(options.tool, error))),
          ),
        );
        const completedAtEpochMillis = yield* Clock.currentTimeMillis;
        const invocation = Object.freeze({
          tool: options.tool,
          args: Object.freeze([...options.args]),
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          startedAtEpochMillis,
          completedAtEpochMillis,
          exitCode: completion.exitCode,
          stdout: completion.stdout,
          stderr: completion.stderr,
        });
        const postAuthentication = yield* Effect.exit(reauthenticate(options.tool));
        return yield* onComplete({ invocation, postAuthentication });
      }),
    );
  });

export const run = (
  options: RunOptions,
): Effect.Effect<ToolInvocation, ToolError, ToolServices> =>
  runWithCompletion(
    options,
    ({ invocation, postAuthentication }) =>
      Exit.isSuccess(postAuthentication) ? Effect.succeed(invocation) : Effect.failCause(postAuthentication.cause),
  );

export const runOrFail = (
  options: RunOptions,
): Effect.Effect<ToolInvocation, ToolError, ToolServices> =>
  Effect.flatMap(run(options), (invocation) =>
    invocation.exitCode === 0
      ? Effect.succeed(invocation)
      : Effect.fail(
        new AppleToolFailed({
          tool: invocation.tool.name,
          path: invocation.tool.path,
          exitCode: invocation.exitCode,
          stdout: invocation.stdout.text,
          stderr: invocation.stderr.text,
          stdoutTruncated: invocation.stdout.truncated,
          stderrTruncated: invocation.stderr.truncated,
        }),
      ));

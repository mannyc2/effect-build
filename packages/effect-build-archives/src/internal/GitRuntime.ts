import { Cause, Context, Crypto, Effect, FileSystem, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  GitCommandFailed,
  GitOutputTruncated,
  GitToolChanged,
  GitToolUnavailable,
  GitTransportFailed,
} from "../ArchiveError.js";

export type Operation = "probe" | "cat-file" | "ls-tree" | "archive";

export interface Options {
  readonly executable?: string;
  readonly outputLimitBytes?: number;
}

export interface CapturedOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly truncated: boolean;
}

export interface Completion {
  readonly exitCode: number;
  readonly stdout: CapturedOutput;
  readonly stderr: CapturedOutput;
}

export type Failure = GitToolChanged | GitTransportFailed | GitCommandFailed | GitOutputTruncated;
export type SelectionFailure =
  | GitToolUnavailable
  | GitToolChanged
  | GitTransportFailed
  | GitCommandFailed
  | GitOutputTruncated;

export interface Runtime {
  readonly tool: Tool.Observation<"git">;
  readonly version: string;
  readonly run: (
    operation: Exclude<Operation, "probe">,
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<Completion, Failure>;
  /** Exact protocol stdout; stderr remains bounded as diagnostic data. */
  readonly runExactProtocol: (
    operation: "ls-tree",
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<Completion, Failure>;
}

interface Accumulator {
  readonly chunks: readonly Uint8Array[];
  readonly retained: number;
  readonly truncated: boolean;
}

const collect = (
  stream: Stream.Stream<Uint8Array, unknown>,
  limit: number | undefined,
): Effect.Effect<CapturedOutput, unknown> =>
  Stream.runFold(
    stream,
    (): Accumulator => ({ chunks: [], retained: 0, truncated: false }),
    (state, chunk) => {
      const available = limit === undefined ? chunk.byteLength : Math.max(0, limit - state.retained);
      const retained = chunk.byteLength <= available ? chunk : chunk.subarray(0, available);
      return {
        chunks: retained.byteLength === 0 ? state.chunks : [...state.chunks, retained],
        retained: state.retained + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.retained);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

const execute = (
  command: ChildProcess.Command,
  operation: Operation,
  stdoutLimit: number | undefined,
  stderrLimit: number,
): Effect.Effect<Completion, GitTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new GitTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, stdoutLimit), collect(handle.stderr, stderrLimit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new GitTransportFailed({ operation, cause: error })))
        ),
      );
      return { exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const checked = (
  operation: Operation,
  completion: Completion,
  limit: number,
): Effect.Effect<Completion, GitCommandFailed | GitOutputTruncated> => {
  if (completion.exitCode !== 0) {
    return Effect.fail(
      new GitCommandFailed({
        operation,
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      }),
    );
  }
  if (completion.stdout.truncated || completion.stderr.truncated) {
    return Effect.fail(new GitOutputTruncated({ operation, outputLimitBytes: limit }));
  }
  return Effect.succeed(completion);
};

const observe = (
  candidate: Tool.Candidate<"git">,
): Effect.Effect<
  Tool.Observation<"git">,
  GitTransportFailed | GitCommandFailed | GitOutputTruncated,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const completion = yield* execute(candidate.command(["--version"]), "probe", 64 * 1024, 64 * 1024).pipe(
      Effect.flatMap((completion) => checked("probe", completion, 64 * 1024)),
    );
    const version = /^git version\s+(\S+)/u.exec(completion.stdout.text.trim())?.[1];
    if (version === undefined) {
      return yield* new GitCommandFailed({
        operation: "probe",
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    }
    return Object.freeze({
      name: "git" as const,
      participants: Object.freeze([Object.freeze({
        role: "selected-command",
        name: "git",
        version,
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "git-exact-tree-archive", evidence: "git-cat-file-ls-tree-archive" },
      ]),
    });
  });

const supported = (version: string): boolean => {
  const match = /^(\d+)\.(\d+)(?:\.|$)/u.exec(version);
  return match !== null && Number(match[1]) === 2 && Number(match[2]) >= 40;
};

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const selectionFailure = (error: unknown): SelectionFailure => {
  if (
    error instanceof GitTransportFailed || error instanceof GitCommandFailed || error instanceof GitOutputTruncated
  ) return error;
  if (typeof error === "object" && error !== null && "_tag" in error && error._tag === "SelectedToolChanged") {
    const changed = error as unknown as { readonly path: string; readonly expected: string; readonly observed: string };
    return new GitToolChanged({
      path: changed.path,
      reason: `expected ${changed.expected}, observed ${changed.observed}`,
    });
  }
  return new GitToolUnavailable({ reason: describe(error) });
};

const changedFailure = (path: Artifact.AbsolutePath, error: unknown): GitToolChanged =>
  new GitToolChanged({ path, reason: describe(error) });

export const make = (
  rawOptions?: Options,
): Effect.Effect<
  Runtime,
  SelectionFailure,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const outputLimitBytes = rawOptions?.outputLimitBytes ?? 16 * 1024 * 1024;
    if (!Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0) {
      return yield* new GitToolUnavailable({ reason: "outputLimitBytes must be a positive safe integer" });
    }
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const services = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(FileSystem.FileSystem, fileSystem),
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    const selected = yield* ToolAuthor.select({
      name: "git",
      ...(rawOptions?.executable === undefined ? {} : { executable: rawOptions.executable }),
      observe,
    }).pipe(Effect.mapError(selectionFailure));
    const version = selected.observation.participants[0].version;
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (request: { readonly operation: Exclude<Operation, "probe"> }) =>
        Effect.succeed(
          supported(version)
            ? { _tag: "ReviewedAdmission" as const, admissionKey: `git@${version}:${request.operation}` }
            : {
              _tag: "UntestedOverride" as const,
              admissionKey: `git@${version}:${request.operation}`,
              warningCode: "EFFECT_BUILD_UNTESTED_VERSION" as const,
            },
        ),
    });
    if (!supported(version)) yield* Effect.logWarning(`git ${version} is outside the reviewed >=2.40.0 <3 line`);

    const launch = (
      operation: Exclude<Operation, "probe">,
      argv: readonly string[],
      cwd: string | undefined,
      exactProtocolStdout: boolean,
    ) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ operation });
        yield* selected.reauthenticate.pipe(
          Effect.mapError((error) => changedFailure(selected.executablePath, error)),
        );
        const completion = yield* execute(
          selected.command(argv, { ...(cwd === undefined ? {} : { cwd }), forceKillAfter: "2 seconds" }),
          operation,
          exactProtocolStdout ? undefined : outputLimitBytes,
          outputLimitBytes,
        );
        return yield* checked(operation, completion, outputLimitBytes);
      }).pipe(Effect.provide(services));
    const run: Runtime["run"] = (operation, argv, cwd) => launch(operation, argv, cwd, false);
    const runExactProtocol: Runtime["runExactProtocol"] = (operation, argv, cwd) => launch(operation, argv, cwd, true);
    return { tool: selected.observation, version, run, runExactProtocol };
  });

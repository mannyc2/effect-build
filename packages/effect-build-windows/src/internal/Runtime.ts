import { Cause, Context, Crypto, Effect, FileSystem, Path, Schema, Stream } from "effect";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export class SignToolUnavailable extends Schema.TaggedError<SignToolUnavailable>()(
  "SignToolUnavailable",
  { reason: Schema.String },
) {}

export class SignToolChanged extends Schema.TaggedError<SignToolChanged>()(
  "SignToolChanged",
  { path: Schema.String, reason: Schema.String },
) {}

export class SignToolFailed extends Schema.TaggedError<SignToolFailed>()(
  "SignToolFailed",
  { exitCode: Schema.Number, stdout: Schema.String, stderr: Schema.String },
) {
  override get message(): string {
    return `SignTool exited with code ${this.exitCode}: ${this.stderr || this.stdout}`;
  }
}

export interface Options {
  readonly executable?: string;
  readonly version?: string;
}

export interface Runtime {
  readonly tool: Tool.Observation<"signtool">;
  readonly version: string;
  readonly run: (
    args: readonly string[],
    options?: { readonly cwd?: string; readonly redact?: readonly string[] },
  ) => Effect.Effect<void, SignToolChanged | SignToolFailed>;
}

interface Captured {
  readonly bytes: Uint8Array;
  readonly truncated: boolean;
}

interface Accumulator {
  readonly chunks: readonly Uint8Array[];
  readonly retained: number;
  readonly truncated: boolean;
}

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const collect = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<Captured, unknown> =>
  Stream.runFold(
    stream,
    (): Accumulator => ({ chunks: [], retained: 0, truncated: false }),
    (state, chunk) => {
      const available = Math.max(0, 1024 * 1024 - state.retained);
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
      return { bytes, truncated: state.truncated };
    }),
  );

const runCommand = (
  command: ChildProcess.Command,
): Effect.Effect<
  { readonly exitCode: number; readonly stdout: string; readonly stderr: string },
  SignToolFailed,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((error) => new SignToolFailed({ exitCode: -1, stdout: "", stderr: describe(error) })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout), collect(handle.stderr), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.map(cause, (error) => new SignToolFailed({ exitCode: -1, stdout: "", stderr: describe(error) })),
          )
        ),
      );
      const stdoutText = new TextDecoder().decode(stdout.bytes);
      const stderrText = new TextDecoder().decode(stderr.bytes);
      if (stdout.truncated || stderr.truncated) {
        return yield* new SignToolFailed({
          exitCode: Number(exitCode),
          stdout: stdoutText,
          stderr: `${stderrText}${stderrText.length === 0 ? "" : "\n"}captured output exceeded 1048576 bytes`,
        });
      }
      return { exitCode: Number(exitCode), stdout: stdoutText, stderr: stderrText };
    }),
  );

const parseVersion = (text: string): string | undefined =>
  /^Version\s*:?\s*([0-9]+(?:\.[0-9]+){2,3})\s*$/miu.exec(text)?.[1];

const scrub = (text: string, values: readonly string[]): string =>
  values.reduce((redacted, value) => value.length === 0 ? redacted : redacted.split(value).join("<redacted>"), text);

export const make = (
  options: Options = {},
): Effect.Effect<
  Runtime,
  SignToolUnavailable | SignToolFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
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
      name: "signtool" as const,
      ...(options.executable === undefined ? {} : { executable: options.executable }),
      observe: (candidate) => {
        const provisional: Tool.Observation<"signtool"> = {
          name: "signtool",
          participants: [{
            role: "selected-command",
            name: "signtool",
            version: options.version ?? "unobserved",
            revision: "windows-sdk",
            channel: "sdk",
            content: candidate.content,
          }],
          capabilities: [{ _tag: "Present", id: "authenticode-msix", evidence: "native help probe completed" }],
        };
        return runCommand(candidate.command(["/?"])).pipe(
          Effect.flatMap((completion) => {
            if (completion.exitCode !== 0) {
              return Effect.fail(new SignToolFailed(completion));
            }
            const version = options.version ?? parseVersion(`${completion.stdout}\n${completion.stderr}`);
            if (version === undefined || version.length === 0) {
              return Effect.fail(
                new SignToolFailed({
                  exitCode: completion.exitCode,
                  stdout: completion.stdout,
                  stderr: "SignTool version was absent from the native probe and no version was supplied",
                }),
              );
            }
            return Effect.succeed(Object.freeze({
              ...provisional,
              participants: Object.freeze([Object.freeze({ ...provisional.participants[0], version })]) as readonly [
                Tool.ParticipantIdentity,
              ],
              capabilities: Object.freeze(provisional.capabilities),
            }));
          }),
        );
      },
    }).pipe(
      Effect.mapError((error) =>
        error instanceof SignToolFailed
          ? error
          : new SignToolUnavailable({ reason: describe(error) })
      ),
    );
    const version = selected.observation.participants[0].version;
    const run: Runtime["run"] = (args, invocation) =>
      Effect.gen(function*() {
        yield* selected.reauthenticate.pipe(
          Effect.mapError((error) => new SignToolChanged({ path: selected.executablePath, reason: describe(error) })),
        );
        const completion = yield* runCommand(selected.command(args, {
          ...(invocation?.cwd === undefined ? {} : { cwd: invocation.cwd }),
          forceKillAfter: "2 seconds",
        }));
        if (completion.exitCode !== 0) {
          return yield* new SignToolFailed({
            exitCode: completion.exitCode,
            stdout: scrub(completion.stdout, invocation?.redact ?? []),
            stderr: scrub(completion.stderr, invocation?.redact ?? []),
          });
        }
      }).pipe(Effect.provide(services));
    return { tool: selected.observation, version, run };
  });

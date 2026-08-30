import { Cause, Context, Crypto, Effect, FileSystem, Option, Path, Schema, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type { AppleToolOptions } from "./Model.js";

export type PlatformServices =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

export class AppleToolUnavailable extends Schema.TaggedError<AppleToolUnavailable>()(
  "AppleToolUnavailable",
  { tool: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return `${this.tool} is unavailable: ${this.reason}`;
  }
}

export class AppleToolChanged extends Schema.TaggedError<AppleToolChanged>()(
  "AppleToolChanged",
  { tool: Schema.String, path: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return `${this.tool} changed before launch at ${this.path}: ${this.reason}`;
  }
}

export class AppleToolFailed extends Schema.TaggedError<AppleToolFailed>()(
  "AppleToolFailed",
  {
    tool: Schema.String,
    exitCode: Schema.Number,
    stdout: Schema.String,
    stderr: Schema.String,
  },
) {
  override get message(): string {
    return `${this.tool} exited with code ${this.exitCode}: ${this.stderr || this.stdout}`;
  }
}

export class AppleOperationInvalid extends Schema.TaggedError<AppleOperationInvalid>()(
  "AppleOperationInvalid",
  { operation: Schema.String, path: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return `${this.operation} rejected ${this.path}: ${this.reason}`;
  }
}

export interface AppleCompletion<Name extends string> {
  readonly tool: Tool.Observation<Name>;
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly stdoutText: string;
  readonly stderrText: string;
}

/** Retains every selected tool identity involved in one finalized artifact. */
export const combineToolObservations = <Name extends string>(
  primary: Tool.Observation<Name>,
  ...supporting: readonly Tool.Observation<string>[]
): Tool.Observation<Name> =>
  Object.freeze({
    name: primary.name,
    participants: Object.freeze([
      ...primary.participants,
      ...supporting.flatMap((observation) => observation.participants),
    ]) as readonly [Tool.ParticipantIdentity, ...Tool.ParticipantIdentity[]],
    capabilities: Object.freeze([
      ...primary.capabilities,
      ...supporting.flatMap((observation) => observation.capabilities),
    ]),
  });

export interface SelectedAppleTool<Name extends string> {
  readonly selected: Tool.SelectedTool<Name>;
  readonly observation: Tool.Observation<Name>;
  readonly version: string;
  readonly run: (
    argv: readonly string[],
    options?: { readonly cwd?: string; readonly redact?: readonly string[] },
  ) => Effect.Effect<AppleCompletion<Name>, AppleToolChanged | AppleToolFailed>;
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

const outputLimit = 4 * 1024 * 1024;

const collect = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<Captured, unknown> =>
  Stream.runFold(
    stream,
    (): Accumulator => ({ chunks: [], retained: 0, truncated: false }),
    (state, chunk) => {
      const available = Math.max(0, outputLimit - state.retained);
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

const runCommand = <Name extends string>(
  command: ChildProcess.Command,
  tool: Tool.Observation<Name>,
): Effect.Effect<AppleCompletion<Name>, AppleToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((error) =>
          new AppleToolFailed({ tool: tool.name, exitCode: -1, stdout: "", stderr: describe(error) })
        ),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout), collect(handle.stderr), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) =>
            new AppleToolFailed({ tool: tool.name, exitCode: -1, stdout: "", stderr: describe(error) })))
        ),
      );
      const stdoutText = new TextDecoder().decode(stdout.bytes);
      const stderrText = new TextDecoder().decode(stderr.bytes);
      const code = Number(exitCode);
      if (stdout.truncated || stderr.truncated) {
        return yield* new AppleToolFailed({
          tool: tool.name,
          exitCode: code,
          stdout: stdoutText,
          stderr: `${stderrText}${stderrText.length === 0 ? "" : "\n"}captured output exceeded 4194304 bytes`,
        });
      }
      return { tool, exitCode: code, stdout: stdout.bytes, stderr: stderr.bytes, stdoutText, stderrText };
    }),
  );

const scrub = (text: string, values: readonly string[]): string =>
  values.reduce((redacted, value) => value.length === 0 ? redacted : redacted.split(value).join("<redacted>"), text);

const scrubFailure = (failure: AppleToolFailed, values: readonly string[]): AppleToolFailed =>
  new AppleToolFailed({
    tool: failure.tool,
    exitCode: failure.exitCode,
    stdout: scrub(failure.stdout, values),
    stderr: scrub(failure.stderr, values),
  });

const selectionFailure = (tool: string, error: unknown): AppleToolUnavailable | AppleToolFailed =>
  error instanceof AppleToolFailed ? error : new AppleToolUnavailable({ tool, reason: describe(error) });

export const selectAppleTool = <const Name extends string>(
  name: Name,
  options: AppleToolOptions,
  probeArgs: readonly string[],
  capability = `${name}-command`,
): Effect.Effect<SelectedAppleTool<Name>, AppleToolUnavailable | AppleToolFailed, PlatformServices> =>
  Effect.gen(function*() {
    if (options.version.length === 0 || options.version.includes("\0")) {
      return yield* new AppleToolUnavailable({ tool: name, reason: "version fact must be non-empty" });
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
      name,
      ...(options.executable === undefined ? {} : { executable: options.executable }),
      observe: (candidate) => {
        const provisional: Tool.Observation<Name> = Object.freeze({
          name,
          participants: Object.freeze([Object.freeze({
            role: "selected-command",
            name,
            version: options.version,
            revision: "caller-adjudicated-system-build",
            channel: "system",
            content: candidate.content,
          })]) as readonly [Tool.ParticipantIdentity],
          capabilities: Object.freeze([{
            _tag: "Present" as const,
            id: capability,
            evidence: "native probe completed",
          }]),
        });
        return runCommand(candidate.command(probeArgs), provisional).pipe(
          Effect.flatMap((completion) =>
            completion.exitCode === 0
              ? Effect.succeed(provisional)
              : Effect.fail(
                new AppleToolFailed({
                  tool: name,
                  exitCode: completion.exitCode,
                  stdout: completion.stdoutText,
                  stderr: completion.stderrText,
                }),
              )
          ),
        );
      },
    }).pipe(Effect.mapError((error) => selectionFailure(name, error)));
    const run: SelectedAppleTool<Name>["run"] = (argv, invocation) =>
      Effect.gen(function*() {
        yield* selected.reauthenticate.pipe(
          Effect.mapError((error) =>
            new AppleToolChanged({
              tool: name,
              path: selected.executablePath,
              reason: describe(error),
            })
          ),
        );
        const completion = yield* runCommand(
          selected.command(argv, {
            ...(invocation?.cwd === undefined ? {} : { cwd: invocation.cwd }),
            forceKillAfter: "2 seconds",
          }),
          selected.observation,
        );
        if (completion.exitCode !== 0) {
          const failure = new AppleToolFailed({
            tool: name,
            exitCode: completion.exitCode,
            stdout: completion.stdoutText,
            stderr: completion.stderrText,
          });
          return yield* scrubFailure(failure, invocation?.redact ?? []);
        }
        return completion;
      }).pipe(Effect.provide(services));
    return { selected, observation: selected.observation, version: options.version, run };
  });

export const capturePlatformServices = Effect.gen(function*() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
    Context.add(Path.Path, path),
    Context.add(Crypto.Crypto, crypto),
    Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );
  return { fileSystem, path, services } as const;
});

export const copyVerifiedFile = (
  artifact: Artifact.HashedFile | Artifact.HashedExecutable,
  destination: string,
): Effect.Effect<
  void,
  File.FileVerificationFailed | AppleOperationInvalid,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  File.withVerifiedBytes(
    artifact,
    (contents) =>
      FileSystem.FileSystem.use((fileSystem) => fileSystem.writeFile(destination, contents)).pipe(
        Effect.mapError((error) =>
          new AppleOperationInvalid({
            operation: "copy verified file",
            path: destination,
            reason: describe(error),
          })
        ),
      ),
  );

/** Copies a core-verified private tree snapshot without resolving its relative links. */
export const copyTreeSnapshot = (
  source: Artifact.AbsolutePath,
  destination: Artifact.AbsolutePath | string,
): Effect.Effect<void, AppleOperationInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fail = (target: string, error: unknown) =>
      new AppleOperationInvalid({ operation: "copy verified tree snapshot", path: target, reason: describe(error) });
    yield* fileSystem.remove(destination, { recursive: true, force: true }).pipe(
      Effect.mapError((error) => fail(destination, error)),
    );
    yield* fileSystem.makeDirectory(destination, { recursive: true }).pipe(
      Effect.mapError((error) => fail(destination, error)),
    );
    yield* fileSystem.chmod(destination, 0o700).pipe(Effect.mapError((error) => fail(destination, error)));
    const pending: Array<{ readonly source: string; readonly destination: string }> = [{ source, destination }];
    const directoryModes: Array<{ readonly destination: string; readonly mode: number }> = [];
    while (pending.length > 0) {
      const current = pending.shift();
      if (current === undefined) continue;
      const information = yield* fileSystem.stat(current.source).pipe(
        Effect.mapError((error) => fail(current.source, error)),
      );
      directoryModes.push({ destination: current.destination, mode: Number(information.mode) & 0o7777 });
      for (
        const name of yield* fileSystem.readDirectory(current.source).pipe(
          Effect.mapError((error) => fail(current.source, error)),
        )
      ) {
        const from = path.join(current.source, name);
        const to = path.join(current.destination, name);
        const link = yield* Effect.option(fileSystem.readLink(from));
        if (Option.isSome(link)) {
          yield* fileSystem.symlink(link.value, to).pipe(Effect.mapError((error) => fail(to, error)));
          continue;
        }
        const child = yield* fileSystem.stat(from).pipe(Effect.mapError((error) => fail(from, error)));
        if (child.type === "Directory") {
          yield* fileSystem.makeDirectory(to).pipe(Effect.mapError((error) => fail(to, error)));
          yield* fileSystem.chmod(to, 0o700).pipe(Effect.mapError((error) => fail(to, error)));
          pending.push({ source: from, destination: to });
        } else if (child.type === "File") {
          const contents = yield* fileSystem.readFile(from).pipe(Effect.mapError((error) => fail(from, error)));
          yield* fileSystem.writeFile(to, contents).pipe(Effect.mapError((error) => fail(to, error)));
          yield* fileSystem.chmod(to, Number(child.mode) & 0o7777).pipe(Effect.mapError((error) => fail(to, error)));
        } else {
          return yield* fail(from, `unsupported snapshot entry type ${child.type}`);
        }
      }
    }
    for (const directory of directoryModes.sort((left, right) => right.destination.length - left.destination.length)) {
      yield* fileSystem.chmod(directory.destination, directory.mode).pipe(
        Effect.mapError((error) => fail(directory.destination, error)),
      );
    }
  });

export const ensureNewDestination = (
  destination: string,
): Effect.Effect<void, AppleOperationInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved = path.resolve(destination);
    const link = yield* Effect.option(fileSystem.readLink(resolved));
    const exists = Option.isSome(link)
      ? true
      : yield* fileSystem.exists(resolved).pipe(
        Effect.mapError((error) =>
          new AppleOperationInvalid({ operation: "inspect destination", path: resolved, reason: describe(error) })
        ),
      );
    if (exists) {
      return yield* new AppleOperationInvalid({
        operation: "exact pair publication",
        path: resolved,
        reason: "destination already exists",
      });
    }
  });

export const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const isSafeRelative = (value: string): boolean => {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) return false;
  return value.split(/[\\/]/u).every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

export const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

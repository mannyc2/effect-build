import { Cause, Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  BunCommandFailed,
  BunCommandInputInvalid,
  BunCommandOutputTruncated,
  BunCommandTransportFailed,
  BunCommandUnsupported,
  type CommandOperation,
} from "./CommandError.js";

export {
  BunCommandFailed,
  BunCommandInputInvalid,
  BunCommandOutputTruncated,
  BunCommandTransportFailed,
  BunCommandUnsupported,
} from "./CommandError.js";

export interface CapturedOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly truncated: boolean;
}

export interface Completion {
  readonly tool: Tool.Observation<"bun">;
  readonly exitCode: number;
  readonly stdout: CapturedOutput;
  readonly stderr: CapturedOutput;
}

export interface Environment {
  readonly values: Readonly<Record<string, string | undefined>>;
  /** Defaults to true, matching ordinary command inheritance. */
  readonly inherit?: boolean;
}

export interface InvocationOptions {
  readonly cwd?: string;
  readonly environment?: Environment;
}

export interface LayerOptions {
  readonly executable?: Artifact.AbsolutePath;
  /** Per-stream retained byte limit. Defaults to 1 MiB. */
  readonly outputLimitBytes?: number;
}

type ReauthenticationError = Effect.Error<Tool.SelectedTool<"bun">["reauthenticate"]>;
export type RunError =
  | ReauthenticationError
  | BunCommandTransportFailed
  | BunCommandFailed
  | BunCommandOutputTruncated
  | BunCommandUnsupported;
export type WatchError = ReauthenticationError | BunCommandTransportFailed | BunCommandUnsupported;

interface AdmissionRequest {
  readonly operation: Exclude<CommandOperation, "probe">;
}

interface Service {
  readonly tool: Tool.SelectedTool<"bun">;
  readonly version: string;
  readonly run: (
    operation: Exclude<CommandOperation, "probe">,
    publication: "none" | "provider-direct-durable",
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<Completion, RunError>;
  readonly watch: (
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, WatchError, import("effect").Scope.Scope>;
}

export class Runtime extends Context.Service<Runtime, Service>()("effect-build-bun/Command/Runtime") {}

interface Accumulator {
  readonly chunks: readonly Uint8Array[];
  readonly retained: number;
  readonly truncated: boolean;
}

const collect = (stream: Stream.Stream<Uint8Array, unknown>, limit: number): Effect.Effect<CapturedOutput, unknown> =>
  Stream.runFold(
    stream,
    (): Accumulator => ({ chunks: [], retained: 0, truncated: false }),
    (state, chunk) => {
      const available = Math.max(0, limit - state.retained);
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

const commandOptions = (options: InvocationOptions | undefined): Tool.CommandOptions => ({
  ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
  ...(options?.environment === undefined
    ? {}
    : {
      env: { ...options.environment.values },
      extendEnv: options.environment.inherit !== false,
    }),
  forceKillAfter: "2 seconds",
});

const runCommand = (
  command: ChildProcess.Command,
  operation: CommandOperation,
  tool: Tool.Observation<"bun">,
  limit: number,
): Effect.Effect<Completion, BunCommandTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new BunCommandTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, limit), collect(handle.stderr, limit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new BunCommandTransportFailed({ operation, cause: error })))
        ),
      );
      return { tool, exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const parseLayerOptions = (
  options: LayerOptions | undefined,
): Effect.Effect<
  Required<Pick<LayerOptions, "outputLimitBytes">> & Pick<LayerOptions, "executable">,
  BunCommandInputInvalid
> => {
  const limit = options?.outputLimitBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return Effect.fail(
      new BunCommandInputInvalid({ operation: "layer", reason: "outputLimitBytes must be a positive safe integer" }),
    );
  }
  return Effect.succeed({
    outputLimitBytes: limit,
    ...(options?.executable === undefined ? {} : { executable: options.executable }),
  });
};

const observe = (
  candidate: Tool.Candidate<"bun">,
  outputLimit: number,
): Effect.Effect<
  Tool.Observation<"bun">,
  BunCommandTransportFailed | BunCommandFailed,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const provisional: Tool.Observation<"bun"> = {
      name: "bun",
      participants: [{
        role: "selected-command",
        name: "bun",
        version: "unobserved",
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      }],
      capabilities: [],
    };
    const completion = yield* runCommand(candidate.command(["--version"]), "probe", provisional, outputLimit);
    if (completion.exitCode !== 0) {
      return yield* new BunCommandFailed({
        operation: "probe",
        publication: "none",
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      });
    }
    const version = completion.stdout.text.trim().split(/\s+/u)[0];
    if (version === undefined || version.length === 0) {
      return yield* new BunCommandFailed({
        operation: "probe",
        publication: "none",
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      });
    }
    return Object.freeze({
      name: "bun" as const,
      participants: Object.freeze([Object.freeze({
        role: "selected-command",
        name: "bun",
        version,
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "bun-build-command", evidence: "source-exact:bun-v1.3.14" },
        { _tag: "Present" as const, id: "bun-build-watch-command", evidence: "source-exact:bun-v1.3.14" },
        { _tag: "Present" as const, id: "bun-compile-command", evidence: "source-exact:bun-v1.3.14" },
      ]),
    });
  });

const makeService = (
  rawOptions?: LayerOptions,
) =>
  Effect.gen(function*() {
    const options = yield* parseLayerOptions(rawOptions);
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
      name: "bun",
      ...(options.executable === undefined ? {} : { executable: options.executable }),
      observe: (candidate) => observe(candidate, Math.min(options.outputLimitBytes, 64 * 1024)),
    });
    const version = selected.observation.participants[0].version;
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (request: AdmissionRequest) =>
        version === "1.3.14"
          ? Effect.succeed({
            _tag: "ReviewedAdmission" as const,
            admissionKey: `bun@1.3.14:${request.operation}`,
          })
          : Effect.fail(
            new BunCommandUnsupported({
              operation: request.operation,
              version,
              reason: "only the exact Bun 1.3.14 command contract is admitted",
            }),
          ),
    });
    const run: Service["run"] = (operation, publication, argv, invocation) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ operation });
        yield* selected.reauthenticate;
        const completion = yield* runCommand(
          selected.command(argv, commandOptions(invocation)),
          operation,
          selected.observation,
          options.outputLimitBytes,
        );
        if (completion.exitCode !== 0) {
          return yield* new BunCommandFailed({
            operation,
            publication,
            exitCode: completion.exitCode,
            stdout: completion.stdout.bytes,
            stderr: completion.stderr.bytes,
            stdoutTruncated: completion.stdout.truncated,
            stderrTruncated: completion.stderr.truncated,
          });
        }
        if (operation === "buildStdout" && completion.stdout.truncated) {
          return yield* new BunCommandOutputTruncated({
            operation,
            publication: "none",
            exitCode: completion.exitCode,
            stdout: completion.stdout.bytes,
            stderr: completion.stderr.bytes,
            stdoutTruncated: true,
            stderrTruncated: completion.stderr.truncated,
            outputLimitBytes: options.outputLimitBytes,
          });
        }
        return completion;
      }).pipe(Effect.provide(services));
    const watch: Service["watch"] = (argv, invocation) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ operation: "buildWatch" });
        yield* selected.reauthenticate;
        return yield* selected.command(argv, commandOptions(invocation)).pipe(
          Effect.mapError((cause) => new BunCommandTransportFailed({ operation: "buildWatch", cause })),
        );
      }).pipe(Effect.provide(services));
    return { tool: selected, version, run, watch };
  });

export type LayerError = Effect.Error<ReturnType<typeof makeService>>;

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Runtime,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Runtime, makeService(options));

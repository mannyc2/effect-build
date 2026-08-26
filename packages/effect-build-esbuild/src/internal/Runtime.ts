import { Cause, Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { ArtifactInvalid } from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import type {
  SelectedToolChanged,
  ToolNotFound,
  ToolSelectionAmbiguous,
  ToolSelectionInvalid,
} from "effect-build/Author/Tool";
import { type ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  type CommandOperation,
  EsbuildCommandFailed,
  EsbuildCommandInputInvalid,
  EsbuildCommandOutputTruncated,
  EsbuildCommandTransportFailed,
  EsbuildCommandUnsupported,
} from "./CommandError.js";

export {
  EsbuildCommandFailed,
  EsbuildCommandInputInvalid,
  EsbuildCommandOutputTruncated,
  EsbuildCommandTransportFailed,
  EsbuildCommandUnsupported,
} from "./CommandError.js";

export interface CapturedOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly truncated: boolean;
}

export interface Completion {
  readonly tool: Tool.Observation<"esbuild">;
  readonly exitCode: number;
  readonly stdout: CapturedOutput;
  readonly stderr: CapturedOutput;
}

export interface Environment {
  readonly values: Readonly<Record<string, string | undefined>>;
  readonly inherit?: boolean;
}

export interface InvocationOptions {
  readonly cwd?: string;
  readonly environment?: Environment;
}

export interface LayerOptions {
  readonly executable?: Artifact.AbsolutePath;
  readonly outputLimitBytes?: number;
}

export type LayerError =
  | ToolNotFound
  | ToolSelectionAmbiguous
  | ToolSelectionInvalid
  | ArtifactInvalid
  | SelectedToolChanged
  | EsbuildCommandInputInvalid
  | EsbuildCommandUnsupported
  | EsbuildCommandTransportFailed
  | EsbuildCommandFailed;

export type RunError =
  | ArtifactInvalid
  | SelectedToolChanged
  | EsbuildCommandUnsupported
  | EsbuildCommandTransportFailed
  | EsbuildCommandFailed
  | EsbuildCommandOutputTruncated;
export type ProcessError =
  | ArtifactInvalid
  | SelectedToolChanged
  | EsbuildCommandUnsupported
  | EsbuildCommandTransportFailed;

interface Service {
  readonly tool: Tool.SelectedTool<"esbuild">;
  readonly version: string;
  readonly run: (
    operation: Exclude<CommandOperation, "probe" | "buildWatch" | "serve">,
    publication: "none" | "provider-direct-durable",
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<Completion, RunError>;
  readonly process: (
    operation: "buildWatch" | "serve",
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, ProcessError, import("effect").Scope.Scope>;
}

export class Runtime extends Context.Service<Runtime, Service>()("effect-build-esbuild/Command/Runtime") {}

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

const commandOptions = (options?: InvocationOptions): Tool.CommandOptions => ({
  ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
  ...(options?.environment === undefined
    ? {}
    : { env: { ...options.environment.values }, extendEnv: options.environment.inherit !== false }),
  forceKillAfter: "2 seconds",
});

const invoke = (
  command: ChildProcess.Command,
  operation: CommandOperation,
  tool: Tool.Observation<"esbuild">,
  limit: number,
): Effect.Effect<Completion, EsbuildCommandTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new EsbuildCommandTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, limit), collect(handle.stderr, limit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new EsbuildCommandTransportFailed({ operation, cause: error })))
        ),
      );
      return { tool, exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const parseOptions = (raw?: LayerOptions) => {
  const outputLimitBytes = raw?.outputLimitBytes ?? 1024 * 1024;
  return Number.isSafeInteger(outputLimitBytes) && outputLimitBytes > 0
    ? Effect.succeed({ outputLimitBytes, ...(raw?.executable === undefined ? {} : { executable: raw.executable }) })
    : Effect.fail(
      new EsbuildCommandInputInvalid({
        operation: "layer",
        reason: "outputLimitBytes must be a positive safe integer",
      }),
    );
};

const observe = (
  candidate: Tool.Candidate<"esbuild">,
  limit: number,
): Effect.Effect<
  Tool.Observation<"esbuild">,
  EsbuildCommandTransportFailed | EsbuildCommandFailed,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const provisional: Tool.Observation<"esbuild"> = {
      name: "esbuild",
      participants: [{
        role: "selected-command",
        name: "esbuild",
        version: "unobserved",
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      }],
      capabilities: [],
    };
    const completion = yield* invoke(candidate.command(["--version"]), "probe", provisional, limit);
    const version = completion.stdout.text.trim();
    if (completion.exitCode !== 0 || version.length === 0) {
      return yield* new EsbuildCommandFailed({
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
      name: "esbuild" as const,
      participants: Object.freeze([Object.freeze({
        role: "selected-command",
        name: "esbuild",
        version,
        revision: "unreported",
        channel: "release",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "esbuild-build-command", evidence: "source-exact:esbuild-0.28.2" },
        { _tag: "Present" as const, id: "esbuild-watch-command", evidence: "source-exact:esbuild-0.28.2" },
        { _tag: "Present" as const, id: "esbuild-serve-command", evidence: "source-exact:esbuild-0.28.2" },
      ]),
    });
  });

const makeService = (raw?: LayerOptions): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const options = yield* parseOptions(raw);
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
      name: "esbuild",
      ...(options.executable === undefined ? {} : { executable: options.executable }),
      observe: (candidate) => observe(candidate, Math.min(options.outputLimitBytes, 64 * 1024)),
    });
    const version = selected.observation.participants[0].version;
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (operation: Exclude<CommandOperation, "probe">) =>
        version === "0.28.2"
          ? Effect.succeed({ _tag: "ReviewedAdmission" as const, admissionKey: `esbuild@0.28.2:${operation}` })
          : Effect.fail(
            new EsbuildCommandUnsupported({
              operation,
              version,
              reason: "only the exact esbuild 0.28.2 command contract is admitted",
            }),
          ),
    });
    const run: Service["run"] = (operation, publication, argv, invocationOptions) =>
      Effect.gen(function*() {
        yield* definition.evaluate(operation);
        yield* selected.reauthenticate;
        const completion = yield* invoke(
          selected.command(argv, commandOptions(invocationOptions)),
          operation,
          selected.observation,
          options.outputLimitBytes,
        );
        if (completion.exitCode !== 0) {
          return yield* new EsbuildCommandFailed({
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
          return yield* new EsbuildCommandOutputTruncated({
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
    const process: Service["process"] = (operation, argv, invocationOptions) =>
      Effect.gen(function*() {
        yield* definition.evaluate(operation);
        yield* selected.reauthenticate;
        return yield* selected.command(argv, commandOptions(invocationOptions)).pipe(
          Effect.mapError((cause) => new EsbuildCommandTransportFailed({ operation, cause })),
        );
      }).pipe(Effect.provide(services));
    return { tool: selected, version, run, process };
  });

export const layer = (options?: LayerOptions): Layer.Layer<
  Runtime,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Runtime, makeService(options));

import { Cause, Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  type CommandOperation,
  DenoCommandFailed,
  DenoCommandInputInvalid,
  DenoCommandTransportFailed,
  DenoCommandUnsupported,
} from "./CommandError.js";

export {
  DenoCommandFailed,
  DenoCommandInputInvalid,
  DenoCommandTransportFailed,
  DenoCommandUnsupported,
} from "./CommandError.js";

export interface CapturedOutput {
  readonly bytes: Uint8Array;
  readonly text: string;
  readonly truncated: boolean;
}

export interface Completion {
  readonly tool: Tool.Observation<"deno">;
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
  /** Explicit cache/configuration authority; inherited DENO_DIR remains untouched when absent. */
  readonly denoDir?: Artifact.AbsolutePath;
  /** Exact runtime override authority for compile; never auto-discovered or substituted. */
  readonly denort?: Artifact.AbsolutePath;
}

type ReauthenticationError =
  | Effect.Error<Tool.SelectedTool<"deno">["reauthenticate"]>
  | Effect.Error<Tool.SelectedTool<"denort">["reauthenticate"]>;
export type RunError =
  | ReauthenticationError
  | DenoCommandTransportFailed
  | DenoCommandFailed
  | DenoCommandUnsupported;
export type WatchError = ReauthenticationError | DenoCommandTransportFailed | DenoCommandUnsupported;

interface AdmissionRequest {
  readonly operation: Exclude<CommandOperation, "probe">;
}

interface Service {
  readonly tool: Tool.SelectedTool<"deno">;
  readonly version: string;
  readonly denort: Tool.SelectedTool<"denort"> | undefined;
  readonly denoDir: Artifact.AbsolutePath | undefined;
  readonly run: (
    operation: Exclude<CommandOperation, "probe">,
    publication: "none" | "provider-direct-durable",
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<Completion, RunError>;
  readonly watch: (
    operation: "bundleWatch" | "compileWatch",
    argv: readonly string[],
    options?: InvocationOptions,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, WatchError, import("effect").Scope.Scope>;
}

export class Runtime extends Context.Service<Runtime, Service>()("effect-build-deno/Command/Runtime") {}

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

const invocationOptions = (
  options: InvocationOptions | undefined,
  denoDir: Artifact.AbsolutePath | undefined,
  denort: Tool.SelectedTool<"denort"> | undefined,
): Tool.CommandOptions => {
  const authority = {
    ...options?.environment?.values,
    ...(denoDir === undefined ? {} : { DENO_DIR: denoDir }),
    ...(denort === undefined ? {} : { DENORT_BIN: denort.executablePath }),
  };
  const hasAuthority = Object.keys(authority).length > 0;
  return {
    ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(hasAuthority
      ? {
        env: authority,
        extendEnv: options?.environment?.inherit !== false,
      }
      : {}),
    forceKillAfter: "2 seconds",
  };
};

const runCommand = (
  command: ChildProcess.Command,
  operation: CommandOperation,
  tool: Tool.Observation<"deno">,
  limit: number,
): Effect.Effect<Completion, DenoCommandTransportFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.mapError((cause) => new DenoCommandTransportFailed({ operation, cause })),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collect(handle.stdout, limit), collect(handle.stderr, limit), handle.exitCode] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, (error) => new DenoCommandTransportFailed({ operation, cause: error })))
        ),
      );
      return { tool, exitCode: Number(exitCode), stdout, stderr };
    }),
  );

interface ParsedLayerOptions {
  readonly executable?: Artifact.AbsolutePath;
  readonly outputLimitBytes: number;
  readonly denoDir?: Artifact.AbsolutePath;
  readonly denort?: Artifact.AbsolutePath;
}

const parseLayerOptions = (
  options: LayerOptions | undefined,
): Effect.Effect<ParsedLayerOptions, DenoCommandInputInvalid> => {
  const limit = options?.outputLimitBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return Effect.fail(
      new DenoCommandInputInvalid({ operation: "layer", reason: "outputLimitBytes must be a positive safe integer" }),
    );
  }
  return Effect.succeed({
    outputLimitBytes: limit,
    ...(options?.executable === undefined ? {} : { executable: options.executable }),
    ...(options?.denoDir === undefined ? {} : { denoDir: options.denoDir }),
    ...(options?.denort === undefined ? {} : { denort: options.denort }),
  });
};

const provisional = <Name extends "deno" | "denort">(
  name: Name,
  content: Tool.ContentIdentity,
): Tool.Observation<Name> => ({
  name,
  participants: [{
    role: name === "deno" ? "selected-command" : "compile-runtime-override",
    name,
    version: "unobserved",
    revision: "unreported",
    channel: "unreported",
    content,
  }],
  capabilities: [],
});

const observeDeno = (
  candidate: Tool.Candidate<"deno">,
  outputLimit: number,
): Effect.Effect<
  Tool.Observation<"deno">,
  DenoCommandTransportFailed | DenoCommandFailed,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const completion = yield* runCommand(
      candidate.command(["--version"]),
      "probe",
      provisional("deno", candidate.content),
      outputLimit,
    );
    if (completion.exitCode !== 0) {
      return yield* new DenoCommandFailed({
        operation: "probe",
        publication: "none",
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      });
    }
    const match = /^deno\s+(\S+)/u.exec(completion.stdout.text.trim());
    const version = match?.[1];
    if (version === undefined) {
      return yield* new DenoCommandFailed({
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
      name: "deno" as const,
      participants: Object.freeze([Object.freeze({
        role: "selected-command",
        name: "deno",
        version,
        revision: "unreported",
        channel: "stable",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "deno-bundle-command", evidence: "source-exact:deno-v2.9.5" },
        { _tag: "Present" as const, id: "deno-transpile-command", evidence: "source-exact:deno-v2.9.5" },
        { _tag: "Present" as const, id: "deno-compile-command", evidence: "source-exact:deno-v2.9.5" },
      ]),
    });
  });

const observeDenort = (
  candidate: Tool.Candidate<"denort">,
  outputLimit: number,
): Effect.Effect<
  Tool.Observation<"denort">,
  DenoCommandTransportFailed | DenoCommandFailed,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const denoObservation = provisional("deno", candidate.content);
    const completion = yield* runCommand(candidate.command(["--version"]), "probe", denoObservation, outputLimit);
    if (completion.exitCode !== 0) {
      return yield* new DenoCommandFailed({
        operation: "probe",
        publication: "none",
        exitCode: completion.exitCode,
        stdout: completion.stdout.bytes,
        stderr: completion.stderr.bytes,
        stdoutTruncated: completion.stdout.truncated,
        stderrTruncated: completion.stderr.truncated,
      });
    }
    const version = /^deno\s+(\S+)/u.exec(completion.stdout.text.trim())?.[1] ?? "unreported";
    return Object.freeze({
      name: "denort" as const,
      participants: Object.freeze([Object.freeze({
        role: "compile-runtime-override",
        name: "denort",
        version,
        revision: "unreported",
        channel: "unreported",
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        { _tag: "Present" as const, id: "denort-runtime-override", evidence: "executed:--version" },
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
    const probeLimit = Math.min(options.outputLimitBytes, 64 * 1024);
    const selected = yield* ToolAuthor.select({
      name: "deno",
      ...(options.executable === undefined ? {} : { executable: options.executable }),
      observe: (candidate) => observeDeno(candidate, probeLimit),
    });
    const denort = options.denort === undefined
      ? undefined
      : yield* ToolAuthor.select({
        name: "denort",
        executable: options.denort,
        observe: (candidate) => observeDenort(candidate, probeLimit),
      });
    const version = selected.observation.participants[0].version;
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (request: AdmissionRequest) => {
        if (version !== "2.9.5") {
          return Effect.fail(
            new DenoCommandUnsupported({
              operation: request.operation,
              version,
              reason: "only the exact Deno 2.9.5 command contract is admitted",
            }),
          );
        }
        if (
          denort !== undefined
          && (request.operation === "compileExecutable" || request.operation === "compileWatch")
          && denort.observation.participants[0].version !== "2.9.5"
        ) {
          return Effect.fail(
            new DenoCommandUnsupported({
              operation: request.operation,
              version: denort.observation.participants[0].version,
              reason: "the explicit denort override does not report Deno 2.9.5 identity",
            }),
          );
        }
        return Effect.succeed({
          _tag: "ReviewedAdmission" as const,
          admissionKey: `deno@2.9.5:${request.operation}`,
        });
      },
    });
    const reauthenticate = (operation: Exclude<CommandOperation, "probe">) =>
      selected.reauthenticate.pipe(
        Effect.andThen(
          denort !== undefined && (operation === "compileExecutable" || operation === "compileWatch")
            ? denort.reauthenticate
            : Effect.void,
        ),
      );
    const run: Service["run"] = (operation, publication, argv, invocation) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ operation });
        yield* reauthenticate(operation);
        const compileRuntime = operation === "compileExecutable" ? denort : undefined;
        const completion = yield* runCommand(
          selected.command(argv, invocationOptions(invocation, options.denoDir, compileRuntime)),
          operation,
          selected.observation,
          options.outputLimitBytes,
        );
        if (completion.exitCode !== 0) {
          return yield* new DenoCommandFailed({
            operation,
            publication,
            exitCode: completion.exitCode,
            stdout: completion.stdout.bytes,
            stderr: completion.stderr.bytes,
            stdoutTruncated: completion.stdout.truncated,
            stderrTruncated: completion.stderr.truncated,
          });
        }
        return completion;
      }).pipe(Effect.provide(services));
    const watch: Service["watch"] = (operation, argv, invocation) =>
      Effect.gen(function*() {
        yield* definition.evaluate({ operation });
        yield* reauthenticate(operation);
        const compileRuntime = operation === "compileWatch" ? denort : undefined;
        return yield* selected.command(argv, invocationOptions(invocation, options.denoDir, compileRuntime)).pipe(
          Effect.mapError((cause) => new DenoCommandTransportFailed({ operation, cause })),
        );
      }).pipe(Effect.provide(services));
    return { tool: selected, version, denort, denoDir: options.denoDir, run, watch };
  });

export type LayerError = Effect.Error<ReturnType<typeof makeService>>;

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Runtime,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Runtime, makeService(options));

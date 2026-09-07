import { Cause, Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import * as ToolAuthor from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  type CommandOperation,
  DenoCommandFailed,
  DenoCommandInputInvalid,
  DenoCommandOutputTruncated,
  DenoCommandTransportFailed,
  DenoCommandUnsupported,
} from "./CommandError.js";
import {
  acceptsRelease,
  compatibilityByOperation,
  explainRefusal,
  parseReleaseVersion,
} from "./Compatibility.generated.js";

export {
  DenoCommandFailed,
  DenoCommandInputInvalid,
  DenoCommandOutputTruncated,
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
  | DenoCommandInputInvalid
  | DenoCommandTransportFailed
  | DenoCommandFailed
  | DenoCommandOutputTruncated
  | DenoCommandUnsupported;
export type WatchError =
  | ReauthenticationError
  | DenoCommandInputInvalid
  | DenoCommandTransportFailed
  | DenoCommandUnsupported;

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
    DENORT_BIN: denort?.executablePath,
  };
  return {
    ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
    env: authority,
    extendEnv: options?.environment?.inherit !== false,
    forceKillAfter: "2 seconds",
  };
};

const validateInvocationOptions = (
  operation: Exclude<CommandOperation, "probe">,
  options: InvocationOptions | undefined,
): Effect.Effect<void, DenoCommandInputInvalid> =>
  Object.hasOwn(options?.environment?.values ?? {}, "DENORT_BIN")
    ? Effect.fail(
      new DenoCommandInputInvalid({
        operation,
        reason: "environment.values.DENORT_BIN is reserved for authenticated layer selection",
      }),
    )
    : Effect.void;

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

const decodeIdentity = (banner: string): { readonly version: string; readonly channel: string } | undefined => {
  const [header, ...components] = banner.trim().split(/\r?\n/u);
  const identity = /^deno (\S+)(?: \(([a-z][a-z0-9-]*), release, [a-z0-9_]+(?:-[a-z0-9_]+)+\))?$/u.exec(
    header ?? "",
  );
  if (
    identity?.[1] === undefined
    || (components.length !== 0
      && (components.length !== 2 || !/^v8 \S+$/u.test(components[0] ?? "")
        || !/^typescript \S+$/u.test(components[1] ?? "")))
  ) return undefined;
  return { version: identity[1], channel: identity[2] ?? "unreported" };
};

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
    const identity = decodeIdentity(completion.stdout.text);
    if (
      completion.exitCode !== 0 || completion.stdout.truncated || completion.stderr.truncated || identity === undefined
    ) {
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
        version: identity.version,
        revision: "unreported",
        channel: identity.channel,
        content: candidate.content,
      })]) as readonly [Tool.ParticipantIdentity],
      capabilities: Object.freeze([
        {
          _tag: "Indeterminate" as const,
          id: "deno-bundle-command",
          reason: "only command identity was probed with --version",
        },
        {
          _tag: "Indeterminate" as const,
          id: "deno-transpile-command",
          reason: "only command identity was probed with --version",
        },
        {
          _tag: "Indeterminate" as const,
          id: "deno-compile-command",
          reason: "only command identity was probed with --version",
        },
      ]),
    });
  });

const probeFailure = (completion: Completion): DenoCommandFailed =>
  new DenoCommandFailed({
    operation: "probe",
    publication: "none",
    exitCode: completion.exitCode,
    stdout: completion.stdout.bytes,
    stderr: completion.stderr.bytes,
    stdoutTruncated: completion.stdout.truncated,
    stderrTruncated: completion.stderr.truncated,
  });

const observeDenort = (
  candidate: Tool.Candidate<"denort">,
  compiler: Tool.SelectedTool<"deno">,
  outputLimit: number,
): Effect.Effect<
  Tool.Observation<"denort">,
  ReauthenticationError | DenoCommandTransportFailed | DenoCommandFailed | DenoCommandUnsupported,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function*() {
      // Bare denort has no CLI: it requires an embedded standalone program.
      // Deno.version comes from that runtime, including its canary/prerelease suffix.
      const { version, channel } = compiler.observation.participants[0];
      const policy = compatibilityByOperation.compileExecutable;
      if (!acceptsRelease(policy, parseReleaseVersion(version), channel)) {
        return yield* new DenoCommandUnsupported({
          operation: "probe",
          version,
          reason: explainRefusal(policy, version, channel),
        });
      }
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { directory, source, output } = yield* Effect.gen(function*() {
        const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-denort-identity-" });
        const source = path.join(directory, "identity.ts");
        const output = path.join(directory, "identity.exe");
        yield* fileSystem.writeFileString(source, "console.log(Deno.version.deno);\n");
        return { directory, source, output };
      }).pipe(Effect.mapError((cause) => new DenoCommandTransportFailed({ operation: "probe", cause })));
      yield* compiler.reauthenticate;
      const compiled = yield* runCommand(
        compiler.command([
          "compile",
          "--no-check",
          "--no-config",
          "--no-lock",
          "--no-npm",
          "--no-remote",
          "--no-code-cache",
          "--output",
          output,
          source,
        ], {
          cwd: directory,
          env: { DENORT_BIN: candidate.executablePath, DENO_DIR: path.join(directory, "cache") },
          extendEnv: true,
          forceKillAfter: "2 seconds",
        }),
        "probe",
        compiler.observation,
        outputLimit,
      );
      if (compiled.exitCode !== 0 || compiled.stdout.truncated || compiled.stderr.truncated) {
        return yield* probeFailure(compiled);
      }
      const completion = yield* runCommand(
        ChildProcess.make(output, [], { cwd: directory, shell: false, forceKillAfter: "2 seconds" }),
        "probe",
        provisional("deno", candidate.content),
        outputLimit,
      );
      const runtimeVersion = completion.stdout.text.trim();
      if (
        completion.exitCode !== 0 || completion.stdout.truncated || completion.stderr.truncated
        || runtimeVersion.length === 0
      ) return yield* probeFailure(completion);
      return Object.freeze({
        name: "denort" as const,
        participants: Object.freeze([Object.freeze({
          role: "compile-runtime-override",
          name: "denort",
          version: runtimeVersion,
          revision: "unreported",
          channel: "unreported",
          content: candidate.content,
        })]) as readonly [Tool.ParticipantIdentity],
        capabilities: Object.freeze([
          {
            _tag: "Indeterminate" as const,
            id: "denort-runtime-override",
            reason: "only a scoped runtime identity program was compiled and executed",
          },
        ]),
      });
    }),
  );

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
    const probeLimit = 64 * 1024;
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
        observe: (candidate) => observeDenort(candidate, selected, probeLimit),
      });
    const { version, channel } = selected.observation.participants[0];
    const release = parseReleaseVersion(version);
    const runtimeIdentity = denort?.observation.participants[0];
    const runtimeRelease = runtimeIdentity === undefined ? undefined : parseReleaseVersion(runtimeIdentity.version);
    const definition = ToolAuthor.define({
      tool: selected,
      evaluate: (request: AdmissionRequest) => {
        const policy = compatibilityByOperation[request.operation];
        if (!acceptsRelease(policy, release, channel)) {
          return Effect.fail(
            new DenoCommandUnsupported({
              operation: request.operation,
              version,
              reason: explainRefusal(policy, version, channel),
            }),
          );
        }
        if (
          runtimeIdentity !== undefined
          && (request.operation === "compileExecutable" || request.operation === "compileWatch")
        ) {
          if (!acceptsRelease(policy, runtimeRelease, runtimeIdentity.channel) || runtimeIdentity.version !== version) {
            return Effect.fail(
              new DenoCommandUnsupported({
                operation: request.operation,
                version: runtimeIdentity.version,
                reason: `the explicit denort override must report release identity matching selected Deno ${version}; `
                  + (runtimeIdentity.version !== version
                    ? `observed denort ${runtimeIdentity.version} (${runtimeIdentity.channel})`
                    : explainRefusal(policy, runtimeIdentity.version, runtimeIdentity.channel)),
              }),
            );
          }
        }
        return Effect.succeed({
          _tag: "ReviewedAdmission" as const,
          admissionKey: `${policy.key}:${version}:${request.operation}`,
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
        yield* validateInvocationOptions(operation, invocation);
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
        if (
          (operation === "bundleStdout" || operation === "transpileStdout")
          && completion.stdout.truncated
        ) {
          return yield* new DenoCommandOutputTruncated({
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
    const watch: Service["watch"] = (operation, argv, invocation) =>
      Effect.gen(function*() {
        yield* validateInvocationOptions(operation, invocation);
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

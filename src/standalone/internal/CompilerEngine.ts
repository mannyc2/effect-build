import { Crypto, Effect, FileSystem, Path, Stream } from "effect";
import type { ToolName } from "../Artifact.js";
import { InvalidDriverOptions, OutputInvalid, OutputMissing, TargetUnsupported, ToolFailed } from "../BuildError.js";
import type { CompilerService } from "../Driver.js";
import type { Target } from "../Target.js";
import { acquireAtomicOutput } from "./AtomicOutput.js";
import type { CompilerAdapter, DiscoveredCompiler, InternalCompileInput, ProviderArtifact } from "./CompilerAdapter.js";
import {
  inspectNativeExecutableChunks,
  type NativeExecutableObservation,
  NativeExecutableRangeRequired,
} from "./NativeExecutable.js";
import { ChildProcessSpawner, runProcess } from "./Process.js";
import { descriptorOf, matchesObservation, targetFromObservation } from "./TargetCatalog.js";

const inferTarget = <SupportedTarget extends Target>(
  observation: NativeExecutableObservation,
  requested: SupportedTarget | undefined,
  fallback: SupportedTarget | undefined,
  resolve: (value: unknown) => SupportedTarget | undefined,
): SupportedTarget => {
  if (requested !== undefined) {
    if (!matchesObservation(requested, observation)) throw new Error("native target does not match requested target");
    return requested;
  }
  const canonical = targetFromObservation(observation, fallback);
  if (canonical === undefined) throw new Error("native target is ambiguous");
  const providerTarget = resolve(canonical);
  if (providerTarget === undefined) throw new Error("native target is unsupported by the selected compiler");
  return providerTarget;
};

const describeUnknownTarget = (value: unknown): string => {
  if (value === null) return "<non-string:null>";
  if (Array.isArray(value)) return "<non-string:array>";
  return `<non-string:${typeof value}>`;
};

const collectRange = (fileSystem: FileSystem.FileSystem, file: string, offset: number, bytesToRead: number) =>
  fileSystem.stream(file, { offset, bytesToRead }).pipe(
    Stream.runFold(() => new Uint8Array(0), (current, chunk) => {
      const combined = new Uint8Array(current.byteLength + chunk.byteLength);
      combined.set(current);
      combined.set(chunk, current.byteLength);
      return combined;
    }),
  );

const inspectNativeExecutableFile = (
  fileSystem: FileSystem.FileSystem,
  file: string,
  size: number,
): Effect.Effect<NativeExecutableObservation, unknown> =>
  Effect.gen(function*() {
    const initialLength = Math.min(size, 1024 * 1024);
    const initial = initialLength === 0
      ? new Uint8Array(0)
      : yield* collectRange(fileSystem, file, 0, initialLength);
    if (initial.byteLength !== initialLength) return yield* Effect.fail(new Error("truncated-header"));
    const chunks = [{ offset: 0, bytes: initial }];

    for (let reads = 0;; reads++) {
      const step = yield* Effect.sync(() => {
        try {
          return { _tag: "Done", value: inspectNativeExecutableChunks(size, chunks) } as const;
        } catch (error) {
          return error instanceof NativeExecutableRangeRequired
            ? { _tag: "Read", request: error } as const
            : { _tag: "Failed", error } as const;
        }
      });
      if (step._tag === "Done") return step.value;
      if (step._tag === "Failed") return yield* Effect.fail(step.error);
      if (reads === 4) return yield* Effect.fail(new Error("too-many-header-ranges"));
      const bytes = yield* collectRange(fileSystem, file, step.request.offset, step.request.length);
      if (bytes.byteLength !== step.request.length) return yield* Effect.fail(new Error("truncated-header"));
      chunks.push({ offset: step.request.offset, bytes });
    }
  });

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const makeCompilerService = <
  Options,
  const Name extends ToolName,
  SupportedTarget extends Target,
>(
  adapter: CompilerAdapter<Options, Name, SupportedTarget>,
  tool: DiscoveredCompiler<Name>,
): Effect.Effect<
  CompilerService<Options>,
  never,
  ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const compileExecutable: CompilerService<Options>["compileExecutable"] = (input) => {
      const unsafeTarget: unknown = input.target;
      const requestedTarget = unsafeTarget === undefined ? undefined : adapter.targetTable.resolve(unsafeTarget);
      if (unsafeTarget !== undefined && requestedTarget === undefined) {
        return Effect.fail(
          new TargetUnsupported({
            tool: adapter.toolName,
            requested: typeof unsafeTarget === "string" ? unsafeTarget : describeUnknownTarget(unsafeTarget),
            available: [...adapter.targetTable.Target.literals],
          }),
        );
      }
      const internalInput: InternalCompileInput<Options, SupportedTarget> = {
        entrypoint: input.entrypoint,
        outfile: input.outfile,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        ...(requestedTarget === undefined ? {} : { target: requestedTarget }),
        ...(input.digest === undefined ? {} : { digest: input.digest }),
        ...(input.options === undefined ? {} : { options: input.options }),
      };
      const executableSuffix = requestedTarget === undefined
        ? tool.hostOs === "windows" ? ".exe" : ""
        : descriptorOf(requestedTarget).executableSuffix;
      return Effect.scoped(
        Effect.gen(function*() {
          const output = yield* acquireAtomicOutput(fileSystem, path, {
            outfile: internalInput.outfile,
            ...(internalInput.cwd === undefined ? {} : { cwd: internalInput.cwd }),
            executableSuffix,
          });
          const argv = yield* Effect.try({
            try: () =>
              adapter.renderArgv({
                input: internalInput,
                stagedOutfile: output.staged,
              }),
            catch: (error) =>
              error instanceof InvalidDriverOptions
                ? error
                : new InvalidDriverOptions({ tool: adapter.toolName, reason: String(error) }),
          });
          const completion = yield* runProcess(tool.artifactTool.path, argv, internalInput.cwd).pipe(
            Effect.provideService(ChildProcessSpawner, spawner),
            Effect.mapError((error) =>
              new ToolFailed({
                tool: adapter.toolName,
                exitCode: 1,
                diagnostics: [{ channel: "stderr", text: error.message, truncated: false }],
              })
            ),
          );
          if (completion.exitCode !== 0) return yield* adapter.interpretFailure(completion);

          const exists = yield* fileSystem.exists(output.staged).pipe(
            Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
          );
          if (!exists) return yield* new OutputMissing({ path: output.staged });
          const information = yield* fileSystem.stat(output.staged).pipe(
            Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
          );
          if (information.type !== "File") {
            return yield* new OutputInvalid({ path: output.staged, reason: "not-regular" });
          }
          if (executableSuffix !== ".exe" && (information.mode & 0o111) === 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "not-executable" });
          }
          const bytes = Number(information.size);
          if (!Number.isSafeInteger(bytes) || bytes < 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "invalid-byte-count" });
          }
          const target = yield* inspectNativeExecutableFile(fileSystem, output.staged, bytes).pipe(
            Effect.flatMap((observation) =>
              Effect.try({
                try: () =>
                  inferTarget(observation, requestedTarget, adapter.defaultTarget, adapter.targetTable.resolve),
                catch: (error) => new OutputInvalid({ path: output.staged, reason: String(error) }),
              })
            ),
            Effect.mapError((error) =>
              error instanceof OutputInvalid
                ? error
                : new OutputInvalid({ path: output.staged, reason: String(error) })
            ),
          );
          const digest = internalInput.digest === true
            ? yield* fileSystem.readFile(output.staged).pipe(
              Effect.flatMap((bytes) => crypto.digest("SHA-256", bytes)),
              Effect.map((bytes) => `sha256:${hex(bytes)}` as const),
              Effect.mapError((error) => new OutputInvalid({ path: output.staged, reason: error.message })),
            )
            : undefined;
          yield* output.commit;
          return {
            path: output.destination,
            bytes,
            ...(digest === undefined ? {} : { digest }),
            target,
            tool: tool.artifactTool,
          } satisfies ProviderArtifact<Name, SupportedTarget>;
        }),
      );
    };
    return { compileExecutable };
  });

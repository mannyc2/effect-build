import { Crypto, Effect, FileSystem, Path, Stream } from "effect";
import type { Artifact } from "../Artifact.js";
import { InvalidDriverOptions, OutputInvalid, OutputMissing, TargetUnsupported, ToolFailed } from "../BuildError.js";
import type { BuildError } from "../BuildError.js";
import type { CompilerService } from "../Driver.js";
import type { Target } from "../Target.js";
import { acquireAtomicOutput } from "./AtomicOutput.js";
import type { CompilerAdapter, ObservedTool } from "./CompilerAdapter.js";
import {
  inspectNativeExecutableChunks,
  type NativeExecutableObservation,
  NativeExecutableRangeRequired,
} from "./NativeExecutable.js";
import { ChildProcessSpawner, runProcess } from "./Process.js";

const targetParts = (target: Target) => {
  const [os, architecture, abi] = target.split("-") as ["macos" | "linux" | "windows", "x64" | "aarch64", string?];
  return { os, architecture, abi };
};

const inferTarget = (
  observation: NativeExecutableObservation,
  requested: Target | undefined,
  fallback: Target | undefined,
): Target => {
  if (requested !== undefined) {
    const expected = targetParts(requested);
    if (
      expected.os !== observation.os || expected.architecture !== observation.architecture
      || (observation.abi !== undefined && expected.abi !== observation.abi)
    ) throw new Error("native target does not match requested target");
    return requested;
  }
  if (observation.os === "macos") return `macos-${observation.architecture}`;
  if (observation.os === "windows") return `windows-${observation.architecture}`;
  if (observation.abi !== undefined) return `linux-${observation.architecture}-${observation.abi}`;
  if (fallback !== undefined) {
    const expected = targetParts(fallback);
    if (expected.os === observation.os && expected.architecture === observation.architecture) return fallback;
  }
  throw new Error("abi-unrecognized");
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

export const makeCompilerService = <Options>(
  adapter: CompilerAdapter<Options>,
  tool: ObservedTool,
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
      if (input.target !== undefined && !adapter.supportedTargets.includes(input.target)) {
        return Effect.fail(
          new TargetUnsupported({
            tool: adapter.toolName,
            requested: input.target,
            available: [...adapter.supportedTargets],
          }),
        );
      }
      return Effect.scoped(
        Effect.gen(function*() {
          const output = yield* acquireAtomicOutput(fileSystem, path, input);
          const argv = yield* Effect.try({
            try: () => adapter.renderArgv({ input, stagedOutfile: output.staged }),
            catch: (error) =>
              error instanceof InvalidDriverOptions
                ? error
                : new InvalidDriverOptions({ tool: adapter.toolName, reason: String(error) }),
          });
          const completion = yield* runProcess(tool.path, argv, input.cwd).pipe(
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
          if (input.target?.startsWith("windows-") !== true && (information.mode & 0o111) === 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "not-executable" });
          }
          const bytes = Number(information.size);
          if (!Number.isSafeInteger(bytes) || bytes < 0) {
            return yield* new OutputInvalid({ path: output.staged, reason: "invalid-byte-count" });
          }
          const target = yield* inspectNativeExecutableFile(fileSystem, output.staged, bytes).pipe(
            Effect.flatMap((observation) =>
              Effect.try({
                try: () => inferTarget(observation, input.target, adapter.defaultTarget),
                catch: (error) => new OutputInvalid({ path: output.staged, reason: String(error) }),
              })
            ),
            Effect.mapError((error) =>
              error instanceof OutputInvalid
                ? error
                : new OutputInvalid({ path: output.staged, reason: String(error) })
            ),
          );
          const digest = input.digest === true
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
            tool,
          } satisfies Artifact;
        }),
      ) as Effect.Effect<Artifact, BuildError, never>;
    };
    return { compileExecutable };
  });

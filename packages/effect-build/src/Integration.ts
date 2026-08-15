import {
  Crypto,
  Effect,
  FileSystem,
  HashMap,
  HashSet,
  Path,
  type PlatformError,
  Result,
  type Scope,
  Stream,
  SynchronizedRef,
} from "effect";
import { ChildProcess, ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import * as JavaScriptBundle from "./JavaScriptBundle.js";
import type { ExecutableArtifact, StageObservation } from "./standalone/Artifact.js";
import { OutputInvalid } from "./standalone/BuildError.js";
import type { OutputLocked, OutputMissing, PublicationFailed } from "./standalone/BuildError.js";
import {
  acquireExecutableCandidate,
  makePublicationFailed,
  resolveExecutableDestination,
  validateAndPublishExecutable,
} from "./standalone/internal/ExecutableLifecycle.js";
import type { NativeExecutableObservation as InternalNativeExecutableObservation } from "./standalone/internal/NativeExecutable.js";
import type { SystemTarget } from "./standalone/Target.js";

export interface CommandOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface CommandCompletion {
  readonly exitCode: number;
  readonly stdout: CommandOutput;
  readonly stderr: CommandOutput;
}

export type ExecuteCommand = (
  executable: string,
  argv: readonly string[],
  cwd?: string,
) => Effect.Effect<
  CommandCompletion,
  PlatformError.PlatformError,
  EffectChildProcessSpawner.ChildProcessSpawner
>;

interface OutputAccumulator {
  readonly bytes: Uint8Array;
  readonly truncated: boolean;
}

const commandOutputLimit = 1024 * 1024;

const appendCommandOutput = (state: OutputAccumulator, chunk: Uint8Array): OutputAccumulator => {
  const remaining = commandOutputLimit - state.bytes.byteLength;
  if (remaining <= 0) return { bytes: state.bytes, truncated: true };
  const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
  const bytes = new Uint8Array(state.bytes.byteLength + retained.byteLength);
  bytes.set(state.bytes);
  bytes.set(retained, state.bytes.byteLength);
  return { bytes, truncated: state.truncated || retained.byteLength !== chunk.byteLength };
};

const collectCommandOutput = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  Stream.runFold(
    stream,
    (): OutputAccumulator => ({ bytes: new Uint8Array(0), truncated: false }),
    appendCommandOutput,
  ).pipe(
    Effect.map((output): CommandOutput => ({
      text: new TextDecoder().decode(output.bytes),
      truncated: output.truncated,
    })),
  );

export const executeCommand: ExecuteCommand = Effect.fn("effect-build/Integration.executeCommand")(
  (executable: string, argv: readonly string[], cwd?: string) =>
    Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* ChildProcess.make(executable, argv, {
          ...(cwd === undefined ? {} : { cwd }),
          shell: false,
          forceKillAfter: "2 seconds",
        });
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [collectCommandOutput(handle.stdout), collectCommandOutput(handle.stderr), handle.exitCode] as const,
          { concurrency: "unbounded" },
        );
        return { exitCode: Number(exitCode), stdout, stderr };
      }),
    ),
);

export interface NativeExecutableObservation {
  readonly format: "elf" | "macho" | "pe";
  readonly os: "linux" | "macos" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly abi?: "gnu" | "musl";
}

export type PublishedExecutable<Stages extends readonly [...StageObservation[], StageObservation]> = Readonly<
  Omit<ExecutableArtifact, "stages"> & { readonly stages: Stages }
>;

export const inspectLiveJavaScriptBundle: <const Stages extends readonly StageObservation[]>(
  value: JavaScriptBundle.Artifact<Stages>,
) => Effect.Effect<
  JavaScriptBundle.Artifact<Stages>,
  JavaScriptBundle.InvalidJavaScriptBundle | JavaScriptBundle.JavaScriptBundleAccessFailed,
  FileSystem.FileSystem | Crypto.Crypto
> = Effect.fn("effect-build/Integration.inspectLiveJavaScriptBundle")((value) =>
  JavaScriptBundle._inspectLiveJavaScriptBundle(value)
);

interface ClaimState {
  readonly cleanupRoots: HashSet.HashSet<string>;
  readonly publicationDestinations: HashMap.HashMap<string, number>;
}

const initialClaimState = (): ClaimState => ({
  cleanupRoots: HashSet.empty(),
  publicationDestinations: HashMap.empty(),
});

const claims = SynchronizedRef.makeUnsafe(initialClaimState());

const isNotFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound";

const containsPath = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const rootsOverlap = (path: Path.Path, left: string, right: string): boolean =>
  containsPath(path, left, right) || containsPath(path, right, left);

type DestinationResolutionFailure =
  | {
    readonly _tag: "Access";
    readonly path: string;
    readonly operation: "stat" | "realpath";
    readonly error: PlatformError.PlatformError;
  }
  | { readonly _tag: "Unresolvable" };

const resolveProspectiveDestination = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  destination: string,
): Effect.Effect<string, DestinationResolutionFailure> =>
  Effect.gen(function*() {
    let current = path.dirname(destination);
    const suffix = [path.basename(destination)];
    for (;;) {
      const observed = yield* fileSystem.stat(current).pipe(
        Effect.match({
          onFailure: (error) => ({ _tag: "Failure" as const, error }),
          onSuccess: (information) => ({ _tag: "Success" as const, information }),
        }),
      );
      if (observed._tag === "Failure") {
        if (!isNotFound(observed.error)) {
          return yield* Effect.fail({
            _tag: "Access" as const,
            path: current,
            operation: "stat" as const,
            error: observed.error,
          });
        }
        const parent = path.dirname(current);
        const segment = path.basename(current);
        if (parent === current || segment === "" || segment === "." || segment === "..") {
          return yield* Effect.fail({ _tag: "Unresolvable" as const });
        }
        suffix.unshift(segment);
        current = parent;
        continue;
      }
      if (observed.information.type !== "Directory") {
        return yield* Effect.fail({ _tag: "Unresolvable" as const });
      }
      const canonical = yield* fileSystem.realPath(current).pipe(
        Effect.mapError((error): DestinationResolutionFailure => ({
          _tag: "Access" as const,
          path: current,
          operation: "realpath",
          error,
        })),
      );
      return path.normalize(path.resolve(canonical, ...suffix));
    }
  });

const rootResolutionError = (failure: DestinationResolutionFailure): JavaScriptBundle.JavaScriptBundleError =>
  failure._tag === "Unresolvable"
    ? new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "active-publication-destination-unresolvable" })
    : new JavaScriptBundle.JavaScriptBundleAccessFailed({
      path: failure.path,
      operation: failure.operation,
      reason: failure.error.message,
    });

const registerOwnedRoot = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  prefix: string,
): Effect.Effect<string, JavaScriptBundle.JavaScriptBundleError> =>
  SynchronizedRef.modifyEffect(claims, (state) =>
    Effect.gen(function*() {
      const generated = yield* fileSystem.makeTempDirectory({ prefix }).pipe(
        Effect.mapError((error) =>
          new JavaScriptBundle.JavaScriptBundleTemporaryDirectoryFailed({
            prefix,
            reason: error.message,
          })
        ),
      );
      if (!path.isAbsolute(generated)) {
        return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-absolute" });
      }
      const cleanupRoot = yield* fileSystem.realPath(generated).pipe(
        Effect.mapError((error) =>
          isNotFound(error)
            ? new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-directory" })
            : new JavaScriptBundle.JavaScriptBundleAccessFailed({
              path: generated,
              operation: "realpath",
              reason: error.message,
            })
        ),
      );
      if (!path.isAbsolute(cleanupRoot)) {
        return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-absolute" });
      }
      const information = yield* fileSystem.stat(cleanupRoot).pipe(
        Effect.mapError((error) =>
          isNotFound(error)
            ? new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-directory" })
            : new JavaScriptBundle.JavaScriptBundleAccessFailed({
              path: cleanupRoot,
              operation: "stat",
              reason: error.message,
            })
        ),
      );
      if (information.type !== "Directory") {
        return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-directory" });
      }
      const entries = yield* fileSystem.readDirectory(cleanupRoot).pipe(
        Effect.mapError((error) =>
          new JavaScriptBundle.JavaScriptBundleAccessFailed({
            path: cleanupRoot,
            operation: "read",
            reason: error.message,
          })
        ),
      );
      if (entries.length !== 0) {
        return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-not-empty" });
      }
      for (const activeRoot of state.cleanupRoots) {
        if (rootsOverlap(path, cleanupRoot, activeRoot)) {
          return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "cleanup-root-overlaps-active-root" });
        }
      }
      for (const [destination] of state.publicationDestinations) {
        const physical = yield* resolveProspectiveDestination(fileSystem, path, destination).pipe(
          Effect.mapError(rootResolutionError),
        );
        if (containsPath(path, cleanupRoot, physical)) {
          return yield* new JavaScriptBundle.InvalidJavaScriptBundle({
            reason: "cleanup-root-contains-active-publication",
          });
        }
      }
      const next: ClaimState = {
        cleanupRoots: HashSet.add(state.cleanupRoots, cleanupRoot),
        publicationDestinations: state.publicationDestinations,
      };
      return [cleanupRoot, next] as const;
    }));

const unregisterOwnedRoot = (cleanupRoot: string): Effect.Effect<void> =>
  SynchronizedRef.modify(claims, (state) =>
    [undefined, {
      cleanupRoots: HashSet.remove(state.cleanupRoots, cleanupRoot),
      publicationDestinations: state.publicationDestinations,
    }] as const);

const validateTemporaryPrefix = (prefix: string): boolean =>
  prefix.length > 0
  && prefix !== "."
  && prefix !== ".."
  && !prefix.includes("\0")
  && !prefix.includes("/")
  && !prefix.includes("\\");

const withOwnedJavaScriptBundleImplementation: <
  const Stages extends readonly StageObservation[],
  A,
  ProduceError,
  E,
  R1,
  R2,
>(
  source: {
    readonly temporaryPrefix: string;
    readonly produce: (cleanupRoot: string) => Effect.Effect<JavaScriptBundle.Input<Stages>, ProduceError, R1>;
  },
  use: (artifact: JavaScriptBundle.Artifact<Stages>) => Effect.Effect<A, E, R2>,
) => Effect.Effect<
  A,
  ProduceError | JavaScriptBundle.JavaScriptBundleError | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R1 | R2, Scope.Scope>
> = Effect.fn("effect-build/Integration.withOwnedJavaScriptBundle")(<
  const Stages extends readonly StageObservation[],
  A,
  ProduceError,
  E,
  R1,
  R2,
>(
  source: {
    readonly temporaryPrefix: string;
    readonly produce: (cleanupRoot: string) => Effect.Effect<JavaScriptBundle.Input<Stages>, ProduceError, R1>;
  },
  use: (artifact: JavaScriptBundle.Artifact<Stages>) => Effect.Effect<A, E, R2>,
): Effect.Effect<
  A,
  ProduceError | JavaScriptBundle.JavaScriptBundleError | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R1 | R2, Scope.Scope>
> =>
  Effect.gen(function*() {
    if (!validateTemporaryPrefix(source.temporaryPrefix)) {
      return yield* new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "temporary-prefix-invalid" });
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* Effect.acquireUseRelease(
      registerOwnedRoot(fileSystem, path, source.temporaryPrefix),
      (cleanupRoot) =>
        Effect.scoped(
          Effect.gen(function*() {
            const input = yield* source.produce(cleanupRoot);
            return yield* JavaScriptBundle.withFile(
              input,
              (artifact): Effect.Effect<A, JavaScriptBundle.InvalidJavaScriptBundle | E, R2> =>
                Effect.gen(function*() {
                  if (!containsPath(path, cleanupRoot, artifact.path)) {
                    return yield* new JavaScriptBundle.InvalidJavaScriptBundle({
                      reason: "file-outside-cleanup-root",
                    });
                  }
                  return yield* use(artifact);
                }),
            );
          }),
        ),
      (cleanupRoot) =>
        fileSystem.remove(cleanupRoot, { recursive: true }).pipe(
          Effect.orDie,
          Effect.ensuring(unregisterOwnedRoot(cleanupRoot)),
        ),
    );
  })
);

const registerDestination = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  destination: string,
): Effect.Effect<void, OutputInvalid | PublicationFailed> =>
  SynchronizedRef.modifyEffect(claims, (state) =>
    Effect.gen(function*() {
      if (HashSet.size(state.cleanupRoots) > 0) {
        const physical = yield* resolveProspectiveDestination(fileSystem, path, destination).pipe(
          Effect.mapError((failure) =>
            failure._tag === "Unresolvable"
              ? makePublicationFailed(destination, "resolve-destination-parent")({
                message: "no existing directory ancestor for executable destination",
              })
              : makePublicationFailed(destination, "resolve-destination-parent")(failure.error)
          ),
        );
        for (const cleanupRoot of state.cleanupRoots) {
          if (containsPath(path, cleanupRoot, physical)) {
            return yield* new OutputInvalid({
              path: destination,
              reason: "destination-under-active-bundle-cleanup-root",
            });
          }
        }
      }
      const count = HashMap.has(state.publicationDestinations, destination)
        ? HashMap.getUnsafe(state.publicationDestinations, destination)
        : 0;
      const next: ClaimState = {
        cleanupRoots: state.cleanupRoots,
        publicationDestinations: HashMap.set(state.publicationDestinations, destination, count + 1),
      };
      return [undefined, next] as const;
    }));

const unregisterDestination = (destination: string): Effect.Effect<void> =>
  SynchronizedRef.modify(claims, (state) => {
    const count = HashMap.has(state.publicationDestinations, destination)
      ? HashMap.getUnsafe(state.publicationDestinations, destination)
      : 0;
    const publicationDestinations = count <= 1
      ? HashMap.remove(state.publicationDestinations, destination)
      : HashMap.set(state.publicationDestinations, destination, count - 1);
    return [undefined, { cleanupRoots: state.cleanupRoots, publicationDestinations }] as const;
  });

export const produceExecutable: <
  Prepared,
  Stages extends readonly [...StageObservation[], StageObservation],
  PrepareError,
  ProduceError,
  InvalidStagesError,
  R1,
  R2,
>(input: {
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly executableSuffix?: "" | ".exe";
  readonly prepare: (context: { readonly resolvedDestination: string }) => Effect.Effect<Prepared, PrepareError, R1>;
  readonly produce: (context: {
    readonly prepared: Prepared;
    readonly stagedOutfile: string;
    readonly resolvedDestination: string;
  }) => Effect.Effect<unknown, ProduceError, R2>;
  readonly decodeStages: (
    prepared: Prepared,
    value: unknown,
  ) => Result.Result<Stages, InvalidStagesError>;
  readonly resolveTarget: (observation: NativeExecutableObservation) => Result.Result<SystemTarget, string>;
}) => Effect.Effect<
  PublishedExecutable<Stages>,
  | PrepareError
  | ProduceError
  | InvalidStagesError
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R1 | R2, Scope.Scope>
> = Effect.fn("effect-build/Integration.produceExecutable")(<
  Prepared,
  Stages extends readonly [...StageObservation[], StageObservation],
  PrepareError,
  ProduceError,
  InvalidStagesError,
  R1,
  R2,
>(input: {
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly executableSuffix?: "" | ".exe";
  readonly prepare: (context: { readonly resolvedDestination: string }) => Effect.Effect<Prepared, PrepareError, R1>;
  readonly produce: (context: {
    readonly prepared: Prepared;
    readonly stagedOutfile: string;
    readonly resolvedDestination: string;
  }) => Effect.Effect<unknown, ProduceError, R2>;
  readonly decodeStages: (prepared: Prepared, value: unknown) => Result.Result<Stages, InvalidStagesError>;
  readonly resolveTarget: (observation: NativeExecutableObservation) => Result.Result<SystemTarget, string>;
}): Effect.Effect<
  PublishedExecutable<Stages>,
  | PrepareError
  | ProduceError
  | InvalidStagesError
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R1 | R2, Scope.Scope>
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const destination = resolveExecutableDestination(path, {
      outfile: input.outfile,
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    });
    return yield* Effect.acquireUseRelease(
      registerDestination(fileSystem, path, destination),
      () =>
        Effect.scoped(
          Effect.gen(function*() {
            const prepared = yield* input.prepare({ resolvedDestination: destination });
            const candidate = yield* acquireExecutableCandidate(fileSystem, path, {
              destination,
              ...(input.executableSuffix === undefined ? {} : { executableSuffix: input.executableSuffix }),
            });
            const rawStages = yield* input.produce({
              prepared,
              stagedOutfile: candidate.staged,
              resolvedDestination: destination,
            });
            const decoded = input.decodeStages(prepared, rawStages);
            if (Result.isFailure(decoded)) return yield* Effect.fail(decoded.failure);
            const published = yield* validateAndPublishExecutable(fileSystem, path, crypto, candidate, {
              digest: input.digest === true,
              resolveTarget: (observation: InternalNativeExecutableObservation) => input.resolveTarget(observation),
            });
            return Object.freeze({ ...published, stages: decoded.success }) as PublishedExecutable<Stages>;
          }),
        ),
      () => unregisterDestination(destination),
    );
  })
);

export const withOwnedJavaScriptBundle: <
  const Stages extends readonly StageObservation[],
  A,
  ProduceError,
  E,
  R1,
  R2,
>(
  source: {
    readonly temporaryPrefix: string;
    readonly produce: (cleanupRoot: string) => Effect.Effect<JavaScriptBundle.Input<Stages>, ProduceError, R1>;
  },
  use: (artifact: JavaScriptBundle.Artifact<Stages>) => Effect.Effect<A, E, R2>,
) => Effect.Effect<
  A,
  ProduceError | JavaScriptBundle.JavaScriptBundleError | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Exclude<R1 | R2, Scope.Scope>
> = withOwnedJavaScriptBundleImplementation;

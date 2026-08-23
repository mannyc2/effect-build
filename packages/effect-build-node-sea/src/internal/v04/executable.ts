import { Cause, Crypto, Effect, FileSystem, Path, Semaphore } from "effect";
import type { AbsolutePath, Digest, ObservationMode } from "effect-build/Artifact";
import type * as CoreExecutable from "effect-build/Author/Executable";
import type { DecimalBytes } from "effect-build/Author/Tool";
import { nodeSeaTarget } from "./compatibility.js";
import { inspectSelectedNodeExecutable } from "./selectedNodeExecutable.js";

export interface ExecutableCandidateMissing {
  readonly _tag: "ExecutableCandidateMissing";
  readonly stagedPath: AbsolutePath;
}

export interface ExecutableCandidateChanged {
  readonly _tag: "ExecutableCandidateChanged";
  readonly stagedPath: AbsolutePath;
}

export interface ExecutableInspectionFailed {
  readonly _tag: "ExecutableInspectionFailed";
  readonly stagedPath: AbsolutePath;
  readonly reason: string;
}

export interface ExecutableDestinationLocked {
  readonly _tag: "ExecutableDestinationLocked";
  readonly destination: AbsolutePath;
}

export interface ExecutableCommitFailed {
  readonly _tag: "ExecutableCommitFailed";
  readonly destination: AbsolutePath;
  readonly reason: string;
}

export type ExecutableFailure =
  | ExecutableCandidateMissing
  | ExecutableCandidateChanged
  | ExecutableInspectionFailed
  | ExecutableDestinationLocked
  | ExecutableCommitFailed;

export interface PrivateCandidate {
  readonly directory: AbsolutePath;
  readonly candidate: AbsolutePath;
  readonly destination: AbsolutePath;
}

interface ContentObservation {
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
}

const publicationSemaphore = Semaphore.makeUnsafe(1);
const lockedReasons = new Set(["Busy", "PermissionDenied", "WouldBlock"]);
const lockedErrnoCodes = new Set(["EACCES", "EBUSY", "EPERM"]);

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const decimalBytes = (value: bigint): DecimalBytes => String(value) as DecimalBytes;

const sha256Digest = (value: string): Digest => ({ algorithm: "sha256", value: value as Digest["value"] });

const failureReason = (error: { readonly reason: { readonly _tag: string } }): string => {
  const reason = error.reason;
  if ("cause" in reason && typeof reason.cause === "object" && reason.cause !== null && "code" in reason.cause) {
    const code = (reason.cause as { readonly code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return reason._tag;
};

const isNotFound = (error: { readonly reason: { readonly _tag: string } }): boolean => error.reason._tag === "NotFound";

const isLocked = (error: { readonly reason: { readonly _tag: string } }): boolean => {
  const reason = failureReason(error);
  return lockedReasons.has(error.reason._tag) || lockedErrnoCodes.has(reason);
};

const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const observe = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  stagedPath: AbsolutePath,
): Effect.Effect<ContentObservation, ExecutableCandidateMissing | ExecutableInspectionFailed> =>
  Effect.gen(function*() {
    const information = yield* fileSystem.stat(stagedPath).pipe(
      Effect.mapError((error): ExecutableCandidateMissing | ExecutableInspectionFailed =>
        isNotFound(error)
          ? { _tag: "ExecutableCandidateMissing", stagedPath }
          : { _tag: "ExecutableInspectionFailed", stagedPath, reason: `stat:${failureReason(error)}` }
      ),
    );
    if (information.type !== "File") {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "not-regular-file",
      });
    }
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "not-executable",
      });
    }
    if (information.size < 0n) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "invalid-byte-count",
      });
    }
    yield* inspectSelectedNodeExecutable(fileSystem, stagedPath, information.size).pipe(
      Effect.mapError((error): ExecutableInspectionFailed => ({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: `native-inspection:${error.reason}`,
      })),
    );
    const contents = yield* fileSystem.readFile(stagedPath).pipe(
      Effect.mapError((error): ExecutableInspectionFailed => ({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: `read:${failureReason(error)}`,
      })),
    );
    if (BigInt(contents.byteLength) !== information.size) {
      return yield* Effect.fail<ExecutableInspectionFailed>({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "size-changed-during-read",
      });
    }
    const hash = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((): ExecutableInspectionFailed => ({
        _tag: "ExecutableInspectionFailed",
        stagedPath,
        reason: "sha256-digest-unavailable",
      })),
    );
    return { bytes: decimalBytes(information.size), digest: sha256Digest(hex(hash)) };
  });

const sameContent = (left: ContentObservation, right: ContentObservation): boolean =>
  left.bytes === right.bytes
  && left.digest.algorithm === right.digest.algorithm
  && left.digest.value === right.digest.value;

export const resolveDestination = (
  path: Path.Path,
  outfile: string,
  cwd?: string,
): AbsolutePath => path.normalize(path.resolve(cwd ?? "", outfile)) as AbsolutePath;

/** Provider-local implementation of the frozen Author/Executable publication law. */
export const publishExecutable = <Mode extends ObservationMode, ProviderFailure>(
  input: {
    readonly outfile: string;
    readonly cwd?: string;
    readonly observation: Mode;
    readonly runtimeVersion: string;
    /** Runs after destination resolution but before any filesystem mutation. */
    readonly beforeMutation?: Effect.Effect<void, ProviderFailure>;
    readonly produce: (candidate: PrivateCandidate) => Effect.Effect<void, ProviderFailure>;
  },
): Effect.Effect<
  CoreExecutable.Artifact<Mode>,
  CoreExecutable.Failure<ProviderFailure>,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const destination = resolveDestination(path, input.outfile, input.cwd);
      const parent = path.dirname(destination);
      if (input.beforeMutation !== undefined) yield* input.beforeMutation;
      yield* mapFailureCause(
        fileSystem.makeDirectory(parent, { recursive: true }),
        (error): ExecutableCommitFailed => ({
          _tag: "ExecutableCommitFailed",
          destination,
          reason: `make-directory:${failureReason(error)}`,
        }),
      );
      const staging = yield* mapFailureCause(
        fileSystem.makeTempDirectoryScoped({ directory: parent, prefix: ".effect-build-" }),
        (error): ExecutableCommitFailed => ({
          _tag: "ExecutableCommitFailed",
          destination,
          reason: `make-staging:${failureReason(error)}`,
        }),
      );
      const directory = path.normalize(staging) as AbsolutePath;
      const candidate = path.join(directory, path.basename(destination)) as AbsolutePath;
      yield* input.produce({ directory, candidate, destination });
      const first = yield* observe(fileSystem, crypto, path, candidate);
      const second = yield* observe(fileSystem, crypto, path, candidate).pipe(
        Effect.mapError((error): ExecutableCandidateChanged | ExecutableInspectionFailed =>
          error._tag === "ExecutableCandidateMissing"
            ? { _tag: "ExecutableCandidateChanged", stagedPath: candidate }
            : error
        ),
      );
      if (!sameContent(first, second)) {
        return yield* Effect.fail<ExecutableCandidateChanged>({
          _tag: "ExecutableCandidateChanged",
          stagedPath: candidate,
        });
      }
      yield* publicationSemaphore.withPermit(fileSystem.rename(candidate, destination)).pipe(
        Effect.mapError((error): ExecutableDestinationLocked | ExecutableCommitFailed =>
          isLocked(error)
            ? { _tag: "ExecutableDestinationLocked", destination }
            : { _tag: "ExecutableCommitFailed", destination, reason: `rename:${failureReason(error)}` }
        ),
      );
      const artifact = {
        _tag: input.observation === "hashed" ? "HashedExecutable" : "UnhashedExecutable",
        path: destination,
        bytes: first.bytes,
        nativeFormat: "elf" as const,
        runtime: { name: "node", version: input.runtimeVersion },
        target: nodeSeaTarget,
        publication: { commit: "same-parent-rename" as const, committed: true as const },
        ...(input.observation === "hashed" ? { digest: first.digest } : {}),
      };
      return artifact as CoreExecutable.Artifact<Mode>;
    }),
  );

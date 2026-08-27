import { Crypto, Effect, FileSystem, Path, Schema } from "effect";
import type { AbsolutePath, Digest, HashedFile, ObservationMode } from "../../Artifact.js";
import { decimalBytes, sha256Digest } from "../../Artifact.js";
import { claimDurableDestination, releaseDurableDestination } from "./Claims.js";

export class DurableFileDestinationInvalid extends Schema.TaggedError<DurableFileDestinationInvalid>()(
  "DurableFileDestinationInvalid",
  { destination: Schema.String, reason: Schema.String },
) {}

export class DurableFileCandidateMissing extends Schema.TaggedError<DurableFileCandidateMissing>()(
  "DurableFileCandidateMissing",
  { stagedPath: Schema.String },
) {}

export class DurableFileCandidateChanged extends Schema.TaggedError<DurableFileCandidateChanged>()(
  "DurableFileCandidateChanged",
  { stagedPath: Schema.String },
) {}

export class DurableFileDestinationLocked extends Schema.TaggedError<DurableFileDestinationLocked>()(
  "DurableFileDestinationLocked",
  { destination: Schema.String, reason: Schema.String },
) {}

export class DurableFileCommitFailed extends Schema.TaggedError<DurableFileCommitFailed>()(
  "DurableFileCommitFailed",
  { destination: Schema.String, reason: Schema.String },
) {}

export type Failure =
  | DurableFileDestinationInvalid
  | DurableFileCandidateMissing
  | DurableFileCandidateChanged
  | DurableFileDestinationLocked
  | DurableFileCommitFailed;

export interface Request<Mode extends ObservationMode> {
  readonly destination: string;
  readonly cwd?: string | undefined;
  readonly observation: Mode;
}

export interface Publication<Mode extends ObservationMode, Inspection> {
  readonly file: Mode extends "hashed" ? HashedDurableFile : UnhashedDurableFile;
  readonly inspection: Inspection;
}

interface UnhashedDurableFile {
  readonly path: AbsolutePath;
  readonly bytes: ReturnType<typeof decimalBytes>;
  readonly publication: {
    readonly commit: "same-parent-rename";
    readonly committed: true;
  };
}

interface HashedDurableFile extends UnhashedDurableFile {
  readonly digest: Digest;
}

const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const observeCandidate = (
  stagedPath: AbsolutePath,
): Effect.Effect<
  { readonly bytes: ReturnType<typeof decimalBytes>; readonly digest: Digest },
  DurableFileCandidateMissing | DurableFileCandidateChanged,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const path = yield* Path.Path;
    const canonical = yield* fileSystem.realPath(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateMissing({ stagedPath })),
    );
    if (path.normalize(canonical) !== stagedPath) {
      return yield* new DurableFileCandidateChanged({ stagedPath });
    }
    const information = yield* fileSystem.stat(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateMissing({ stagedPath })),
    );
    if (information.type !== "File") return yield* new DurableFileCandidateMissing({ stagedPath });
    const contents = yield* fileSystem.readFile(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateChanged({ stagedPath })),
    );
    if (`${information.size}` !== `${contents.byteLength}`) {
      return yield* new DurableFileCandidateChanged({ stagedPath });
    }
    const digest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => new DurableFileCandidateChanged({ stagedPath })),
    );
    return {
      bytes: decimalBytes(`${contents.byteLength}`),
      digest: sha256Digest(hex(new Uint8Array(digest))),
    };
  });

/**
 * Publishes one ordinary file through same-parent staging and one rename.
 * It deliberately establishes no executable, runtime, or target facts.
 */
export const publish = <
  Mode extends ObservationMode,
  ProduceFailure,
  InspectFailure,
  ProduceRequirements,
  InspectRequirements,
  Inspection,
>(
  request: Request<Mode>,
  produce: (privateSameParentCandidate: AbsolutePath) => Effect.Effect<void, ProduceFailure, ProduceRequirements>,
  inspect: (candidate: HashedFile) => Effect.Effect<Inspection, InspectFailure, InspectRequirements>,
): Effect.Effect<
  Publication<Mode, Inspection>,
  Failure | ProduceFailure | InspectFailure,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProduceRequirements | InspectRequirements
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      if (request.destination.length === 0) {
        return yield* new DurableFileDestinationInvalid({
          destination: request.destination,
          reason: "destination must not be empty",
        });
      }
      if (request.observation !== "hashed" && request.observation !== "unhashed") {
        return yield* new DurableFileDestinationInvalid({
          destination: request.destination,
          reason: "observation must be hashed or unhashed",
        });
      }
      const requested = path.normalize(path.resolve(request.cwd ?? "", request.destination));
      if (!path.isAbsolute(requested) || path.basename(requested).length === 0) {
        return yield* new DurableFileDestinationInvalid({
          destination: request.destination,
          reason: "destination must resolve to an absolute file path",
        });
      }
      yield* fileSystem.makeDirectory(path.dirname(requested), { recursive: true }).pipe(
        Effect.mapError((error) =>
          new DurableFileDestinationInvalid({ destination: requested, reason: describe(error) })
        ),
      );
      const parent = path.normalize(
        yield* fileSystem.realPath(path.dirname(requested)).pipe(
          Effect.mapError((error) =>
            new DurableFileDestinationInvalid({ destination: requested, reason: describe(error) })
          ),
        ),
      );
      const destination = path.join(parent, path.basename(requested)) as AbsolutePath;
      const conflict = claimDurableDestination(path, destination);
      if (conflict !== undefined) {
        return yield* new DurableFileDestinationLocked({ destination, reason: conflict });
      }
      yield* Effect.addFinalizer(() => Effect.sync(() => releaseDurableDestination(path, destination)));
      const stagingRoot = yield* fileSystem.makeTempDirectoryScoped({
        directory: parent,
        prefix: ".effect-build-file-",
      }).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      const stagedPath = path.join(stagingRoot, path.basename(destination)) as AbsolutePath;
      yield* produce(stagedPath);
      const before = yield* observeCandidate(stagedPath);
      const inspection = yield* inspect(Object.freeze({
        path: stagedPath,
        bytes: before.bytes,
        digest: before.digest,
      }));
      const after = yield* observeCandidate(stagedPath);
      if (before.bytes !== after.bytes || before.digest.value !== after.digest.value) {
        return yield* new DurableFileCandidateChanged({ stagedPath });
      }
      yield* Effect.uninterruptible(fileSystem.rename(stagedPath, destination)).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      const base = {
        path: destination,
        bytes: before.bytes,
        publication: Object.freeze({ commit: "same-parent-rename" as const, committed: true as const }),
      };
      const file = Object.freeze(
        request.observation === "hashed"
          ? { ...base, digest: before.digest }
          : base,
      ) as Mode extends "hashed" ? HashedDurableFile : UnhashedDurableFile;
      return Object.freeze({ file, inspection });
    }),
  );

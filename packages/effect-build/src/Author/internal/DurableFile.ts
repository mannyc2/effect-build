import { Cause, Crypto, Effect, Exit, FileSystem, Option, Path, Schema } from "effect";
import type { AbsolutePath, File, HashedFileObservation, ObservationMode, Provenance } from "../../Artifact.js";
import { decimalBytes, fileMode, sha256Digest } from "../../Artifact.js";
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
  readonly provenance: Provenance;
}

export interface Result<Mode extends ObservationMode, Inspection> {
  readonly file: File<Mode>;
  readonly inspection: Inspection;
}

interface CapturedCandidate {
  readonly observation: HashedFileObservation;
  readonly contents: Uint8Array;
  readonly mode: ReturnType<typeof fileMode>;
}

interface NodeIdentity {
  readonly dev: number;
  readonly ino: number;
}

const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const observeCandidate = (
  stagedPath: AbsolutePath,
): Effect.Effect<
  CapturedCandidate,
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
    const before = yield* fileSystem.stat(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateMissing({ stagedPath })),
    );
    if (before.type !== "File") return yield* new DurableFileCandidateMissing({ stagedPath });
    const contents = yield* fileSystem.readFile(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateChanged({ stagedPath })),
    );
    const after = yield* fileSystem.stat(stagedPath).pipe(
      Effect.mapError(() => new DurableFileCandidateChanged({ stagedPath })),
    );
    if (
      after.type !== "File"
      || `${before.size}` !== `${contents.byteLength}`
      || `${after.size}` !== `${contents.byteLength}`
      || `${before.mtime}` !== `${after.mtime}`
    ) return yield* new DurableFileCandidateChanged({ stagedPath });
    const digest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => new DurableFileCandidateChanged({ stagedPath })),
    );
    return Object.freeze({
      observation: Object.freeze({
        _tag: "HashedFileObservation" as const,
        kind: "file" as const,
        path: stagedPath,
        bytes: decimalBytes(`${contents.byteLength}`),
        digest: sha256Digest(hex(new Uint8Array(digest))),
      }),
      contents,
      mode: fileMode(Number(before.mode) & 0o7777),
    });
  });

/**
 * Publishes one ordinary file through same-parent staging and an atomic,
 * no-replace hard link of independently rebuilt verified bytes.
 * Inspection runs against authenticated private bytes; the committed file is
 * rebuilt from held bytes after recapture, so the inspector cannot select the
 * bytes that eventually commit.
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
  inspect: (candidate: HashedFileObservation) => Effect.Effect<Inspection, InspectFailure, InspectRequirements>,
): Effect.Effect<
  Result<Mode, Inspection>,
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
      const exists = Option.isSome(yield* Effect.option(fileSystem.readLink(destination)))
        || (yield* fileSystem.exists(destination).pipe(
          Effect.mapError((error) => new DurableFileDestinationInvalid({ destination, reason: describe(error) })),
        ));
      if (exists) {
        return yield* new DurableFileDestinationLocked({
          destination,
          reason: "durable files never overlay an existing path",
        });
      }
      const conflict = claimDurableDestination(path, destination);
      if (conflict !== undefined) {
        return yield* new DurableFileDestinationLocked({ destination, reason: conflict });
      }
      yield* Effect.addFinalizer(() => Effect.sync(() => releaseDurableDestination(path, destination)));
      let committed = false;
      let committedNode: NodeIdentity | undefined;
      yield* Effect.addFinalizer((exit) => {
        if (Exit.isSuccess(exit) || !committed || committedNode === undefined) return Effect.void;
        return fileSystem.stat(destination).pipe(
          Effect.flatMap((information) => {
            const ino = Option.getOrUndefined(information.ino);
            return information.dev === committedNode?.dev && ino === committedNode?.ino
              ? fileSystem.remove(destination, { force: true })
              : Effect.void;
          }),
          Effect.ignore,
        );
      });
      const stagingRoot = yield* fileSystem.makeTempDirectoryScoped({
        directory: parent,
        prefix: ".effect-build-file-",
      }).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      const stagedPath = path.join(stagingRoot, path.basename(destination)) as AbsolutePath;
      yield* produce(stagedPath);
      const before = yield* observeCandidate(stagedPath);
      const inspection = yield* inspect(before.observation);
      const after = yield* observeCandidate(stagedPath);
      if (
        before.observation.bytes !== after.observation.bytes
        || before.observation.digest.value !== after.observation.digest.value
        || before.mode !== after.mode
      ) return yield* new DurableFileCandidateChanged({ stagedPath });

      const verified = yield* fileSystem.makeTempFile({ directory: stagingRoot, prefix: ".verified-" }).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      yield* fileSystem.writeFile(verified, before.contents).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      yield* fileSystem.chmod(verified, before.mode).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      const verifiedInformation = yield* fileSystem.stat(verified).pipe(
        Effect.mapError((error) => new DurableFileCommitFailed({ destination, reason: describe(error) })),
      );
      const verifiedIno = Option.getOrUndefined(verifiedInformation.ino);
      const commit = yield* Effect.exit(Effect.uninterruptible(
        fileSystem.link(verified, destination).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              committed = true;
              committedNode = verifiedIno === undefined
                ? undefined
                : { dev: verifiedInformation.dev, ino: verifiedIno };
            })
          ),
        ),
      ));
      if (Exit.isFailure(commit)) {
        if (committed) return yield* Effect.failCause(commit.cause as Cause.Cause<never>);
        const destinationExists = Option.isSome(yield* Effect.option(fileSystem.readLink(destination)))
          || (yield* fileSystem.exists(destination).pipe(Effect.orElseSucceed(() => false)));
        if (destinationExists) {
          return yield* new DurableFileDestinationLocked({
            destination,
            reason: "destination appeared before the atomic no-replace commit",
          });
        }
        return yield* new DurableFileCommitFailed({ destination, reason: Cause.pretty(commit.cause) });
      }

      const base = {
        path: destination,
        bytes: before.observation.bytes,
        provenance: request.provenance,
        publication: Object.freeze({
          scope: "file" as const,
          commit: "same-parent-no-replace-link" as const,
          committed: true as const,
        }),
      };
      const file = Object.freeze(
        request.observation === "hashed"
          ? { ...base, _tag: "HashedFile" as const, digest: before.observation.digest }
          : { ...base, _tag: "UnhashedFile" as const },
      ) as File<Mode>;
      return Object.freeze({ file, inspection });
    }),
  );

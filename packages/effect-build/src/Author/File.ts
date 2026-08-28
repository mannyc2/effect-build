import { Crypto, Effect, FileSystem, Path, Schema } from "effect";
import type {
  AbsolutePath,
  HashedExecutable,
  HashedFile,
  HashedFileObservation,
  Provenance,
  Publication,
} from "../Artifact.js";
import { decimalBytes, sha256Digest } from "../Artifact.js";
import * as DurableFile from "./internal/DurableFile.js";

export type Artifact = HashedFile & {
  readonly publication: Extract<Publication, { readonly scope: "file" }>;
};
export type VerifiedInput = HashedFile | HashedExecutable;

export interface Request {
  readonly destination: string;
  readonly cwd?: string | undefined;
  readonly observation: "hashed";
  readonly provenance: Provenance;
}

export class FileDestinationInvalid extends Schema.TaggedError<FileDestinationInvalid>()(
  "FileDestinationInvalid",
  { destination: Schema.String, reason: Schema.String },
) {}

export class FileCandidateMissing extends Schema.TaggedError<FileCandidateMissing>()(
  "FileCandidateMissing",
  { stagedPath: Schema.String },
) {}

export class FileCandidateChanged extends Schema.TaggedError<FileCandidateChanged>()(
  "FileCandidateChanged",
  { stagedPath: Schema.String },
) {}

export class FileDestinationLocked extends Schema.TaggedError<FileDestinationLocked>()(
  "FileDestinationLocked",
  { destination: Schema.String, reason: Schema.String },
) {}

export class FileCommitFailed extends Schema.TaggedError<FileCommitFailed>()(
  "FileCommitFailed",
  { destination: Schema.String, reason: Schema.String },
) {}

export class FileVerificationFailed extends Schema.TaggedError<FileVerificationFailed>()(
  "FileVerificationFailed",
  { path: Schema.String, reason: Schema.String },
) {}

export type PublicationFailure =
  | FileDestinationInvalid
  | FileCandidateMissing
  | FileCandidateChanged
  | FileDestinationLocked
  | FileCommitFailed;

export type Failure<ProduceFailure, InspectFailure = never> =
  | ProduceFailure
  | InspectFailure
  | PublicationFailure;

const mapInternalFailure = <ProduceFailure, InspectFailure>(
  error: DurableFile.Failure | ProduceFailure | InspectFailure,
): Failure<ProduceFailure, InspectFailure> => {
  if (error instanceof DurableFile.DurableFileDestinationInvalid) {
    return new FileDestinationInvalid({ destination: error.destination, reason: error.reason });
  }
  if (error instanceof DurableFile.DurableFileCandidateMissing) {
    return new FileCandidateMissing({ stagedPath: error.stagedPath });
  }
  if (error instanceof DurableFile.DurableFileCandidateChanged) {
    return new FileCandidateChanged({ stagedPath: error.stagedPath });
  }
  if (error instanceof DurableFile.DurableFileDestinationLocked) {
    return new FileDestinationLocked({ destination: error.destination, reason: error.reason });
  }
  if (error instanceof DurableFile.DurableFileCommitFailed) {
    return new FileCommitFailed({ destination: error.destination, reason: error.reason });
  }
  return error as ProduceFailure | InspectFailure;
};

/**
 * Finalizes one ordinary file. The optional inspector runs between two exact
 * observations of the private candidate; held bytes, not the inspected path,
 * are committed with one same-parent atomic no-replace link.
 */
export const publish = <
  ProduceFailure,
  ProduceRequirements,
  InspectFailure = never,
  InspectRequirements = never,
>(
  request: Request,
  produce: (privateSameParentCandidate: AbsolutePath) => Effect.Effect<void, ProduceFailure, ProduceRequirements>,
  inspect?:
    | ((candidate: HashedFileObservation) => Effect.Effect<void, InspectFailure, InspectRequirements>)
    | undefined,
): Effect.Effect<
  Artifact,
  Failure<ProduceFailure, InspectFailure>,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProduceRequirements | InspectRequirements
> =>
  DurableFile.publish(
    request,
    produce,
    inspect ?? (() => Effect.void),
  ).pipe(
    Effect.map(({ file }) => file as Artifact),
    Effect.mapError(mapInternalFailure<ProduceFailure, InspectFailure>),
  );

const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);
const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Re-observes a durable file and lends a defensive byte copy only inside the
 * supplied continuation. No mutable path is promoted into downstream trust.
 */
export const withVerifiedBytes = <A, UseFailure, UseRequirements>(
  artifact: VerifiedInput,
  use: (contents: Uint8Array) => Effect.Effect<A, UseFailure, UseRequirements>,
): Effect.Effect<
  A,
  FileVerificationFailed | UseFailure,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | UseRequirements
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const fail = (reason: string): FileVerificationFailed =>
      new FileVerificationFailed({ path: artifact.path, reason });
    const canonical = yield* fileSystem.realPath(artifact.path).pipe(
      Effect.mapError((error) => fail(`resolve: ${describe(error)}`)),
    );
    if (path.normalize(canonical) !== artifact.path) return yield* fail("artifact path is a symbolic-link alias");
    const before = yield* fileSystem.stat(artifact.path).pipe(
      Effect.mapError((error) => fail(`inspect: ${describe(error)}`)),
    );
    if (before.type !== "File") return yield* fail("artifact is not a regular file");
    const contents = yield* fileSystem.readFile(artifact.path).pipe(
      Effect.mapError((error) => fail(`read: ${describe(error)}`)),
    );
    const after = yield* fileSystem.stat(artifact.path).pipe(
      Effect.mapError((error) => fail(`reinspect: ${describe(error)}`)),
    );
    if (
      after.type !== "File"
      || `${before.size}` !== `${contents.byteLength}`
      || `${after.size}` !== `${contents.byteLength}`
      || `${before.mtime}` !== `${after.mtime}`
    ) return yield* fail("artifact changed while read");
    if (decimalBytes(`${contents.byteLength}`) !== artifact.bytes) {
      return yield* fail(`byte count mismatch: expected ${artifact.bytes}, observed ${contents.byteLength}`);
    }
    const observed = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((error) => fail(`sha-256: ${describe(error)}`)),
    );
    const digest = sha256Digest(hex(new Uint8Array(observed)));
    if (digest.value !== artifact.digest.value) {
      return yield* fail(`digest mismatch: expected ${artifact.digest.value}, observed ${digest.value}`);
    }
    return yield* use(Uint8Array.from(contents));
  });

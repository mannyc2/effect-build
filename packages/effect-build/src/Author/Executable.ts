import { Crypto, Effect, FileSystem, Path, Schema } from "effect";
import type {
  AbsolutePath,
  Executable,
  HashedFileObservation,
  ObservationMode,
  Provenance,
  RuntimeObservation,
} from "../Artifact.js";
import type { SystemTarget } from "../SystemTarget.js";
import { describe as describeTarget, SystemTarget as SystemTargetSchema } from "../SystemTarget.js";
import * as DurableFile from "./internal/DurableFile.js";

export type Artifact<Mode extends ObservationMode> = Executable<Mode>;
export type HashedArtifact = Executable<"hashed">;
export type UnhashedArtifact = Executable<"unhashed">;

export interface Inspection {
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly runtime: RuntimeObservation;
  readonly target: SystemTarget;
}

export interface Request<Mode extends ObservationMode> {
  readonly destination: string;
  readonly cwd?: string | undefined;
  readonly observation: Mode;
  readonly provenance: Provenance;
}

export class ExecutableDestinationInvalid extends Schema.TaggedError<ExecutableDestinationInvalid>()(
  "ExecutableDestinationInvalid",
  { destination: Schema.String, reason: Schema.String },
) {}

export class ExecutableCandidateMissing extends Schema.TaggedError<ExecutableCandidateMissing>()(
  "ExecutableCandidateMissing",
  { stagedPath: Schema.String },
) {}

export class ExecutableCandidateChanged extends Schema.TaggedError<ExecutableCandidateChanged>()(
  "ExecutableCandidateChanged",
  { stagedPath: Schema.String },
) {}

export class ExecutableInspectionFailed extends Schema.TaggedError<ExecutableInspectionFailed>()(
  "ExecutableInspectionFailed",
  { stagedPath: Schema.String, reason: Schema.String },
) {}

export class ExecutableDestinationLocked extends Schema.TaggedError<ExecutableDestinationLocked>()(
  "ExecutableDestinationLocked",
  { destination: Schema.String, reason: Schema.String },
) {}

export class ExecutableCommitFailed extends Schema.TaggedError<ExecutableCommitFailed>()(
  "ExecutableCommitFailed",
  { destination: Schema.String, reason: Schema.String },
) {}

export type Failure<ProduceFailure, InspectFailure = never> =
  | ProduceFailure
  | InspectFailure
  | ExecutableDestinationInvalid
  | ExecutableCandidateMissing
  | ExecutableCandidateChanged
  | ExecutableInspectionFailed
  | ExecutableDestinationLocked
  | ExecutableCommitFailed;

const knownTarget = (target: string): target is SystemTarget =>
  (SystemTargetSchema.literals as readonly string[]).includes(target);

const validateInspection = (
  candidate: HashedFileObservation,
  inspection: Inspection,
): Effect.Effect<Inspection, ExecutableInspectionFailed> => {
  if (!knownTarget(inspection.target)) {
    return Effect.fail(
      new ExecutableInspectionFailed({
        stagedPath: candidate.path,
        reason: `inspector returned unknown system target ${String(inspection.target)}`,
      }),
    );
  }
  if (inspection.runtime.name.length === 0 || inspection.runtime.version.length === 0) {
    return Effect.fail(
      new ExecutableInspectionFailed({
        stagedPath: candidate.path,
        reason: "runtime name and version must be non-empty",
      }),
    );
  }
  const expectedFormat = describeTarget(inspection.target).nativeFormat;
  if (inspection.nativeFormat !== expectedFormat) {
    return Effect.fail(
      new ExecutableInspectionFailed({
        stagedPath: candidate.path,
        reason: `native format mismatch: expected ${expectedFormat}, observed ${inspection.nativeFormat}`,
      }),
    );
  }
  return Effect.succeed(Object.freeze({
    nativeFormat: inspection.nativeFormat,
    runtime: Object.freeze({ ...inspection.runtime }),
    target: inspection.target,
  }));
};

const mapInternalFailure = <ProduceFailure, InspectFailure>(
  error: DurableFile.Failure | ProduceFailure | InspectFailure | ExecutableInspectionFailed,
): Failure<ProduceFailure, InspectFailure> => {
  if (error instanceof DurableFile.DurableFileDestinationInvalid) {
    return new ExecutableDestinationInvalid({ destination: error.destination, reason: error.reason });
  }
  if (error instanceof DurableFile.DurableFileCandidateMissing) {
    return new ExecutableCandidateMissing({ stagedPath: error.stagedPath });
  }
  if (error instanceof DurableFile.DurableFileCandidateChanged) {
    return new ExecutableCandidateChanged({ stagedPath: error.stagedPath });
  }
  if (error instanceof DurableFile.DurableFileDestinationLocked) {
    return new ExecutableDestinationLocked({ destination: error.destination, reason: error.reason });
  }
  if (error instanceof DurableFile.DurableFileCommitFailed) {
    return new ExecutableCommitFailed({ destination: error.destination, reason: error.reason });
  }
  return error as ProduceFailure | InspectFailure | ExecutableInspectionFailed;
};

/**
 * Inspects authenticated private candidate bytes before one same-parent commit.
 * Publication itself never invents runtime or target facts.
 */
export const publish = <
  Mode extends ObservationMode,
  ProduceFailure,
  InspectFailure,
  ProduceRequirements,
  InspectRequirements,
>(
  request: Request<Mode>,
  produce: (privateSameParentCandidate: AbsolutePath) => Effect.Effect<void, ProduceFailure, ProduceRequirements>,
  inspectCandidate: (
    candidate: HashedFileObservation,
  ) => Effect.Effect<Inspection, InspectFailure, InspectRequirements>,
): Effect.Effect<
  Artifact<Mode>,
  Failure<ProduceFailure, InspectFailure>,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProduceRequirements | InspectRequirements
> =>
  DurableFile.publish(
    request,
    produce,
    (candidate) =>
      inspectCandidate(candidate).pipe(
        Effect.flatMap((inspection) => validateInspection(candidate, inspection)),
      ),
  ).pipe(
    Effect.mapError(mapInternalFailure<ProduceFailure, InspectFailure>),
    Effect.map(({ file, inspection }) =>
      Object.freeze({
        ...file,
        _tag: ("digest" in file ? "HashedExecutable" : "UnhashedExecutable") as
          | "HashedExecutable"
          | "UnhashedExecutable",
        nativeFormat: inspection.nativeFormat,
        runtime: inspection.runtime,
        target: inspection.target,
      }) as unknown as Artifact<Mode>
    ),
  );

import { type Crypto, Effect, type FileSystem, type Path, type Scope } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as BorrowedOutput from "../packages/effect-build/src/Author/BorrowedOutput.js";
import * as Executable from "../packages/effect-build/src/Author/Executable.js";
import * as Matrix from "../packages/effect-build/src/Matrix.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

interface ProducerRequirement {
  readonly _producerRequirement: unique symbol;
}

interface ConsumerRequirement {
  readonly _consumerRequirement: unique symbol;
}

declare const producer: BorrowedOutput.Producer<"produce-failed", Scope.Scope | ProducerRequirement>;
const borrowed = BorrowedOutput.withFile(
  producer,
  "hashed",
  (file): Effect.Effect<Artifact.Digest, "use-failed", Scope.Scope | ConsumerRequirement> =>
    Effect.succeed(file.initial.digest),
);
export type _BorrowedLease = Assert<
  Same<
    typeof borrowed,
    Effect.Effect<
      Artifact.Digest,
      "produce-failed" | "use-failed" | BorrowedOutput.Failure | BorrowedOutput.CleanupFailedAfterSuccessfulUse,
      | BorrowedOutput.CleanupReporter
      | Crypto.Crypto
      | FileSystem.FileSystem
      | Path.Path
      | ProducerRequirement
      | ConsumerRequirement
    >
  >
>;

declare const borrowedFile: BorrowedOutput.File<"hashed">;
export type _ContinuationOwnedObservation = Assert<
  Same<
    typeof borrowedFile.observe,
    Effect.Effect<BorrowedOutput.HashedFileObservation, BorrowedOutput.Failure>
  >
>;

interface InspectorRequirement {
  readonly _inspectorRequirement: unique symbol;
}

declare const produceExecutable: (
  candidate: Artifact.AbsolutePath,
) => Effect.Effect<void, "produce-failed", ProducerRequirement>;
declare const inspectExecutable: (
  candidate: Artifact.HashedFile,
) => Effect.Effect<Executable.Inspection, "inspect-failed", InspectorRequirement>;

const executable = Executable.publish(
  { destination: "dist/app", observation: "hashed" },
  produceExecutable,
  inspectExecutable,
);
export type _ExecutablePublication = Assert<
  Same<
    typeof executable,
    Effect.Effect<
      Artifact.HashedExecutable,
      Executable.Failure<"produce-failed", "inspect-failed">,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProducerRequirement | InspectorRequirement
    >
  >
>;

interface ScalarRequirement {
  readonly _scalarRequirement: unique symbol;
}

declare const scalar: (
  input: number,
  identity: Matrix.CellIdentity<"bun">,
) => Effect.Effect<string, "cell-failed", ScalarRequirement>;
const report = Matrix.run({ provider: "bun", inputs: [1], concurrency: 1 }, scalar);
export type _MatrixReport = Assert<
  Same<
    typeof report,
    Effect.Effect<Matrix.Report<string, "cell-failed", "bun">, Matrix.InvalidInput, ScalarRequirement>
  >
>;

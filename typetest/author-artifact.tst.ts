import { type Crypto, Effect, type FileSystem, type Path } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as File from "../packages/effect-build/src/Author/File.js";
import * as Tree from "../packages/effect-build/src/Author/Tree.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

interface ProducerFailed {
  readonly _tag: "ProducerFailed";
}

interface ProducerRequirement {
  readonly ProducerRequirement: unique symbol;
}

declare const provenance: Artifact.Provenance;
declare const produceFile: (
  path: Artifact.AbsolutePath,
) => Effect.Effect<void, ProducerFailed, ProducerRequirement>;

const file = File.publish(
  { destination: "dist/app.bin", observation: "hashed", provenance },
  produceFile,
);
export type _FilePublish = Assert<
  Same<
    typeof file,
    Effect.Effect<
      File.Artifact,
      ProducerFailed | File.PublicationFailure,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProducerRequirement
    >
  >
>;

declare const produceTree: (
  root: Artifact.AbsolutePath,
) => Effect.Effect<void, ProducerFailed, ProducerRequirement>;
const tree = Tree.publish(
  { outdir: "dist/tree", observation: "hashed", provenance },
  produceTree,
);
export type _TreePublish = Assert<
  Same<
    typeof tree,
    Effect.Effect<
      Artifact.HashedTree,
      ProducerFailed | Tree.PublicationFailure,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProducerRequirement
    >
  >
>;

declare const durableFile: Artifact.HashedFile;
const verified = File.withVerifiedBytes(durableFile, (bytes) => Effect.succeed(bytes.byteLength));
export type _VerifiedFile = Assert<
  Same<
    typeof verified,
    Effect.Effect<
      number,
      File.FileVerificationFailed,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

declare const durableTree: Artifact.HashedTree;
const snapshot = Tree.withVerifiedSnapshot(durableTree, (root) => Effect.succeed(root));
export type _VerifiedTree = Assert<
  Same<
    typeof snapshot,
    Effect.Effect<
      Artifact.AbsolutePath,
      Tree.TreeVerificationFailed,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

export type _FileAdoption = Assert<
  Same<ReturnType<typeof Artifact.adoptFile>, Artifact.FileAdoption>
>;
export type _TreeAdoption = Assert<
  Same<ReturnType<typeof Artifact.adoptTree>, Artifact.TreeAdoption>
>;

declare const candidate: Artifact.HashedFileObservation;
// @ts-expect-error! Candidate observation is not a durable finalized artifact.
candidate.publication;
// @ts-expect-error! Candidate observation carries no producer provenance.
candidate.provenance;

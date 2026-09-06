import { type Crypto, Effect, type FileSystem, type Path, type Scope } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as Executable from "../packages/effect-build/src/Author/Executable.js";
import * as File from "../packages/effect-build/src/Author/File.js";
import * as Tree from "../packages/effect-build/src/Author/Tree.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
interface ProducerService {
  readonly ProducerService: unique symbol;
}
interface InspectorService {
  readonly InspectorService: unique symbol;
}
interface ProducerFailure {
  readonly _tag: "ProducerFailure";
}
interface InspectorFailure {
  readonly _tag: "InspectorFailure";
}
type Services = Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProducerService | InspectorService;
declare const provenance: Artifact.Provenance;
declare const produce: (
  path: Artifact.AbsolutePath,
) => Effect.Effect<void, ProducerFailure, ProducerService | Scope.Scope>;
declare const inspect: (
  candidate: Artifact.HashedFileObservation | Artifact.HashedTreeObservation,
) => Effect.Effect<void, InspectorFailure, InspectorService | Scope.Scope>;
declare const inspectExecutable: (
  candidate: Artifact.HashedFileObservation,
) => Effect.Effect<Executable.Inspection, InspectorFailure, InspectorService | Scope.Scope>;

const request = { destination: "dist/app", observation: "hashed", provenance } as const;
const file = File.publish(request, produce, inspect);
const executable = Executable.publish(request, produce, inspectExecutable);
const tree = Tree.publish({ outdir: "dist/tree", observation: "hashed", provenance }, produce, inspect);
export type _File = Assert<
  Same<typeof file, Effect.Effect<File.Artifact, File.Failure<ProducerFailure, InspectorFailure>, Services>>
>;
export type _Executable = Assert<
  Same<
    typeof executable,
    Effect.Effect<Executable.HashedArtifact, Executable.Failure<ProducerFailure, InspectorFailure>, Services>
  >
>;
export type _Tree = Assert<
  Same<typeof tree, Effect.Effect<Tree.Artifact, Tree.Failure<ProducerFailure, InspectorFailure>, Services>>
>;

declare const artifact: Artifact.HashedExecutable;
const use = File.withVerifiedBytes(artifact, () => Effect.addFinalizer(() => Effect.void));
// A verified read does not own the continuation's lifetime.
export type _VerifiedReadRetainsScope = Assert<
  Same<Effect.Services<typeof use>, Crypto.Crypto | FileSystem.FileSystem | Path.Path | Scope.Scope>
>;

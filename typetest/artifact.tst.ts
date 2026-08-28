import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as SystemTarget from "../packages/effect-build/src/SystemTarget.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _DecimalBytes = Assert<Same<ReturnType<typeof Artifact.decimalBytes>, Artifact.DecimalBytes>>;
export type _Sha256Digest = Assert<Same<ReturnType<typeof Artifact.sha256Digest>, Artifact.Digest>>;
export type _FileModeSchema = Assert<Same<typeof Artifact.FileModeSchema.Type, Artifact.FileMode>>;

declare const hashed: Artifact.Executable<"hashed">;
export type _Hashed = Assert<Same<typeof hashed, Artifact.HashedExecutable>>;
export type _HashedDigest = Assert<Same<typeof hashed.digest, Artifact.Digest>>;
export type _HashedTarget = Assert<Same<typeof hashed.target, SystemTarget.SystemTarget>>;
export type _ExecutablePublication = Assert<
  Same<typeof hashed.publication.commit, "same-parent-no-replace-link">
>;

declare const file: Artifact.HashedFile;
export type _FilePublication = Assert<
  & Same<typeof file.publication.scope, "file" | "tree-file-projection">
  & Same<typeof file.publication.commit, "same-parent-no-replace-link" | "same-parent-rename">
>;

declare const tree: Artifact.HashedTree;
export type _TreePublication = Assert<
  Same<typeof tree.publication.scope, "tree"> & Same<typeof tree.publication.commit, "same-parent-rename">
>;

declare const unhashed: Artifact.Executable<"unhashed">;
export type _Unhashed = Assert<Same<typeof unhashed, Artifact.UnhashedExecutable>>;
// @ts-expect-error! Unhashed executable observations do not claim a public digest.
unhashed.digest;

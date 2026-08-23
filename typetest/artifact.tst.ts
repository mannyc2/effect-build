import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as Tool from "../packages/effect-build/src/Author/Tool.js";
import type * as SystemTarget from "../packages/effect-build/src/SystemTarget.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _AbsolutePathIsAString = Assert<Artifact.AbsolutePath extends string ? true : false>;
export type _AbsolutePathIsBranded = Assert<Same<string extends Artifact.AbsolutePath ? true : false, false>>;
export type _DecimalBytesIsToolScalar = Assert<Same<Artifact.DecimalBytes, Tool.DecimalBytes>>;
export type _DigestIsToolScalar = Assert<Same<Artifact.Digest, Tool.Digest>>;
export type _Sha256ValueIsToolScalar = Assert<Same<Artifact.Sha256Value, Tool.Sha256Value>>;
export type _ObservationMode = Assert<Same<Artifact.ObservationMode, "hashed" | "unhashed">>;

export type _UnhashedFilePath = Assert<Same<Artifact.UnhashedFile["path"], Artifact.AbsolutePath>>;
export type _UnhashedFileBytes = Assert<Same<Artifact.UnhashedFile["bytes"], Tool.DecimalBytes>>;
export type _UnhashedFileHasNoDigest = Assert<Same<Extract<keyof Artifact.UnhashedFile, "digest">, never>>;
export type _HashedFileDigest = Assert<Same<Artifact.HashedFile["digest"], Tool.Digest>>;
export type _HashedFile = Assert<Same<Artifact.File<"hashed">, Artifact.HashedFile>>;
export type _UnhashedFile = Assert<Same<Artifact.File<"unhashed">, Artifact.UnhashedFile>>;

export type _HashedExecutable = Assert<Same<Artifact.Executable<"hashed">, Artifact.HashedExecutable>>;
export type _UnhashedExecutable = Assert<Same<Artifact.Executable<"unhashed">, Artifact.UnhashedExecutable>>;
export type _HashedExecutableTag = Assert<Same<Artifact.HashedExecutable["_tag"], "HashedExecutable">>;
export type _UnhashedExecutableTag = Assert<Same<Artifact.UnhashedExecutable["_tag"], "UnhashedExecutable">>;
export type _UnhashedExecutableHasNoDigest = Assert<
  Same<Extract<keyof Artifact.UnhashedExecutable, "digest">, never>
>;
export type _ExecutablePath = Assert<Same<Artifact.HashedExecutable["path"], Artifact.AbsolutePath>>;
export type _ExecutableBytes = Assert<Same<Artifact.HashedExecutable["bytes"], Tool.DecimalBytes>>;
export type _ExecutableNativeFormat = Assert<
  Same<Artifact.HashedExecutable["nativeFormat"], "elf" | "mach-o" | "pe">
>;
export type _ExecutableRuntime = Assert<
  Same<Artifact.HashedExecutable["runtime"], { readonly name: string; readonly version: string }>
>;
export type _ExecutableTarget = Assert<Same<Artifact.HashedExecutable["target"], SystemTarget.SystemTarget>>;
export type _ExecutablePublication = Assert<
  Same<
    Artifact.HashedExecutable["publication"],
    { readonly commit: "same-parent-rename"; readonly committed: true }
  >
>;

// @ts-expect-error!
export const _unbrandedAbsolutePath: Artifact.AbsolutePath = "/work/output";

declare const unhashedFile: Artifact.UnhashedFile;
// @ts-expect-error!
unhashedFile.digest;

declare const unhashedExecutable: Artifact.UnhashedExecutable;
// @ts-expect-error!
unhashedExecutable.digest;

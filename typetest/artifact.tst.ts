import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as SystemTarget from "../packages/effect-build/src/SystemTarget.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type _DecimalBytes = Assert<Same<ReturnType<typeof Artifact.decimalBytes>, Artifact.DecimalBytes>>;
export type _Sha256Digest = Assert<Same<ReturnType<typeof Artifact.sha256Digest>, Artifact.Digest>>;

declare const hashed: Artifact.Executable<"hashed">;
export type _Hashed = Assert<Same<typeof hashed, Artifact.HashedExecutable>>;
export type _HashedDigest = Assert<Same<typeof hashed.digest, Artifact.Digest>>;
export type _HashedTarget = Assert<Same<typeof hashed.target, SystemTarget.SystemTarget>>;

declare const unhashed: Artifact.Executable<"unhashed">;
export type _Unhashed = Assert<Same<typeof unhashed, Artifact.UnhashedExecutable>>;
// @ts-expect-error! Unhashed executable observations do not claim a public digest.
unhashed.digest;

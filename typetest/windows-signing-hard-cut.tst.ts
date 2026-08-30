import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as Sign from "../packages/effect-build-windows/src/SignMsix.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as File from "../packages/effect-build/src/Author/File.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

type ExpectedSignMsixError =
  | File.FileVerificationFailed
  | File.PublicationFailure
  | Sign.SignMsixInputRejected
  | Sign.MsixStagingFailed
  | Sign.SignToolChanged
  | Sign.SignToolFailed;
export type _ErrorNoWider = Assert<[Sign.SignMsixError] extends [ExpectedSignMsixError] ? true : false>;
export type _ErrorNoNarrower = Assert<[ExpectedSignMsixError] extends [Sign.SignMsixError] ? true : false>;

declare const input: Sign.SignMsixInput;
const signed = Sign.signMsix(input);
export type _Sign = Assert<
  Same<typeof signed, Effect.Effect<Artifact.HashedFile, Sign.SignMsixError, Sign.Signer>>
>;

const signerLayer = Sign.layer({ executable: "C:/Windows Kits/signtool.exe", version: "10.0.26100.8249" });
export type _LayerError = Assert<
  Same<LayerError<typeof signerLayer>, Sign.SignToolUnavailable | Sign.SignToolFailed>
>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof signerLayer>,
    | Crypto.Crypto
    | FileSystem.FileSystem
    | Path.Path
    | ChildProcessSpawner
    | Sign.SigningCredential
  >
>;

export type _PfxLayer = Assert<
  Same<ReturnType<typeof Sign.pfxCredentialLayer>, Layer.Layer<Sign.SigningCredential>>
>;
export type _Policy = Assert<Same<typeof Sign.policy, Sign.AuthenticodePolicy>>;

import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as FileAuthor from "effect-build/Author/File";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import type * as NfpmError from "../packages/effect-build-nfpm/src/NfpmConfigurationRejected.js";
import * as Nfpm from "../packages/effect-build-nfpm/src/Package.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Format = Assert<Same<Nfpm.Format, "deb" | "rpm" | "apk" | "archlinux" | "msix">>;
export type _Error = Assert<
  Same<
    Nfpm.PackageError,
    | FileAuthor.FileVerificationFailed
    | FileAuthor.PublicationFailure
    | NfpmError.NfpmToolChanged
    | NfpmError.NfpmTransportFailed
    | NfpmError.NfpmCommandFailed
    | NfpmError.NfpmOutputTruncated
    | NfpmError.NfpmPackageFailed
    | NfpmError.NfpmConfigurationRejected
  >
>;

declare const input: Nfpm.PackageInput;
const built = Nfpm.buildDeb(input);
export type _Build = Assert<
  Same<typeof built, Effect.Effect<Artifact.HashedFile, Nfpm.PackageError, Nfpm.Packager>>
>;

const packageLayer = Nfpm.layer({ executable: "/opt/nfpm/nfpm" });
export type _LayerError = Assert<
  Same<
    LayerError<typeof packageLayer>,
    | NfpmError.NfpmToolUnavailable
    | NfpmError.NfpmToolChanged
    | NfpmError.NfpmTransportFailed
    | NfpmError.NfpmCommandFailed
    | NfpmError.NfpmOutputTruncated
  >
>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof packageLayer>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;

const projection = Nfpm.formatProjection("msix");
export type _Projection = Assert<Same<typeof projection, Nfpm.FormatProjection>>;

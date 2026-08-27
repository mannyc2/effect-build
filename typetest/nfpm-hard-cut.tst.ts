import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as Nfpm from "../packages/effect-build-nfpm/src/Package.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Format = Assert<Same<Nfpm.Format, "deb" | "rpm" | "apk" | "archlinux" | "msix">>;
export type _Error = Assert<
  Same<
    Nfpm.PackageError,
    | BuildError.ArtifactVerificationFailed
    | BuildError.ToolFailed
    | BuildError.PublishFailed
    | Nfpm.NfpmConfigurationRejected
  >
>;

declare const input: Nfpm.PackageInput;
const built = Nfpm.buildDeb(input);
export type _Build = Assert<
  Same<typeof built, Effect.Effect<Artifact.FileArtifact, Nfpm.PackageError, Nfpm.Packager>>
>;

const packageLayer = Nfpm.layer({ executable: "/opt/nfpm/nfpm" });
export type _LayerError = Assert<
  Same<LayerError<typeof packageLayer>, BuildError.ToolNotFound | BuildError.ToolFailed>
>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof packageLayer>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;

const projection = Nfpm.formatProjection("msix");
export type _Projection = Assert<Same<typeof projection, Nfpm.FormatProjection>>;

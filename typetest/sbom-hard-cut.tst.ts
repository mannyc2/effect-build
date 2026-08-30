import type { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type * as FileAuthor from "effect-build/Author/File";
import type * as TreeAuthor from "effect-build/Author/Tree";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as Sbom from "../packages/effect-build-sbom/src/Generate.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type LayerError<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never;
type LayerServices<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;

export type _Subject = Assert<Same<Sbom.ScanSubject, Sbom.DirectorySubject | Sbom.FileSubject>>;
export type _Format = Assert<Same<Sbom.OutputFormat, "spdx-json" | "cyclonedx-json">>;
export type _Error = Assert<
  Same<
    Sbom.GenerateError,
    | TreeAuthor.TreeVerificationFailed
    | FileAuthor.FileVerificationFailed
    | FileAuthor.PublicationFailure
    | Sbom.SyftToolChanged
    | Sbom.SyftTransportFailed
    | Sbom.SyftCommandFailed
    | Sbom.SyftOutputTruncated
    | Sbom.SbomGenerationFailed
    | Sbom.SbomInvalid
  >
>;

declare const input: Sbom.GenerateInput;
const generated = Sbom.generateCycloneDxJson(input);
export type _Generate = Assert<
  Same<typeof generated, Effect.Effect<Artifact.HashedFile, Sbom.GenerateError, Sbom.Generator>>
>;

const generatorLayer = Sbom.layer({ executable: "/opt/syft/syft" });
export type _LayerError = Assert<
  Same<
    LayerError<typeof generatorLayer>,
    | Sbom.SyftToolUnavailable
    | Sbom.SyftToolChanged
    | Sbom.SyftTransportFailed
    | Sbom.SyftCommandFailed
    | Sbom.SyftOutputTruncated
  >
>;
export type _LayerServices = Assert<
  Same<
    LayerServices<typeof generatorLayer>,
    Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  >
>;

const projection = Sbom.formatProjection("spdx-json");
export type _Projection = Assert<Same<typeof projection, Sbom.FormatProjection>>;

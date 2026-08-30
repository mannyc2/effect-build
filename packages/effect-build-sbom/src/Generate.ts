import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as ArtifactSchema from "effect-build/Artifact";
import * as FileAuthor from "effect-build/Author/File";
import * as TreeAuthor from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  SbomGenerationFailed,
  type SyftCommandFailed,
  type SyftOutputTruncated,
  type SyftToolChanged,
  type SyftToolUnavailable,
  type SyftTransportFailed,
} from "./internal/SbomError.js";
import * as SyftRuntime from "./internal/SyftRuntime.js";

export * from "./internal/SbomError.js";

/** Directory sources are always passed to Syft with `--from dir`. */
export class DirectorySubject extends Schema.TaggedClass<DirectorySubject>()("Directory", {
  snapshot: ArtifactSchema.HashedTreeSchema,
}) {}

/** Final artifact sources are always passed to Syft with `--from file`. */
export class FileSubject extends Schema.TaggedClass<FileSubject>()("File", {
  artifact: ArtifactSchema.HashedFileSchema,
}) {}

/**
 * Exact scan-subject policy. No source auto-detection, daemon lookup, registry
 * fallback, or image pull is possible through this closed union.
 */
export const ScanSubject = Schema.Union([DirectorySubject, FileSubject]);
export type ScanSubject = typeof ScanSubject.Type;

export class GenerateInput extends Schema.Class<GenerateInput>("effect-build-sbom/GenerateInput")({
  subject: ScanSubject,
  outfile: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export const OutputFormat = Schema.Literals(["spdx-json", "cyclonedx-json"] as const);
export type OutputFormat = typeof OutputFormat.Type;

/** Stable output projection for publication and downstream schema selection. */
export class FormatProjection extends Schema.Class<FormatProjection>(
  "effect-build-sbom/FormatProjection",
)({
  format: OutputFormat,
  extension: Schema.NonEmptyString,
  mediaType: Schema.NonEmptyString,
  specification: Schema.NonEmptyString,
}) {}

const projections: Readonly<Record<OutputFormat, FormatProjection>> = {
  "spdx-json": new FormatProjection({
    format: "spdx-json",
    extension: ".spdx.json",
    mediaType: "application/spdx+json",
    specification: "SPDX-2.3",
  }),
  "cyclonedx-json": new FormatProjection({
    format: "cyclonedx-json",
    extension: ".cdx.json",
    mediaType: "application/vnd.cyclonedx+json",
    specification: "CycloneDX-1.6",
  }),
};

export const formatProjection = (candidate: OutputFormat): FormatProjection =>
  projections[Schema.decodeUnknownSync(OutputFormat)(candidate)];

export class SpdxCreationInfo extends Schema.Class<SpdxCreationInfo>(
  "effect-build-sbom/SpdxCreationInfo",
)({
  created: Schema.NonEmptyString,
  creators: Schema.NonEmptyArray(Schema.NonEmptyString),
}) {}

/** Package coordinates required for component assertions in SPDX output. */
export class SpdxPackage extends Schema.Class<SpdxPackage>("effect-build-sbom/SpdxPackage")({
  SPDXID: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  versionInfo: Schema.optionalKey(Schema.NonEmptyString),
  downloadLocation: Schema.NonEmptyString,
}) {}

/** Required top-level SPDX JSON 2.3 document projection. */
export class SpdxJsonDocument extends Schema.Class<SpdxJsonDocument>(
  "effect-build-sbom/SpdxJsonDocument",
)({
  spdxVersion: Schema.Literal("SPDX-2.3"),
  dataLicense: Schema.Literal("CC0-1.0"),
  SPDXID: Schema.Literal("SPDXRef-DOCUMENT"),
  name: Schema.NonEmptyString,
  documentNamespace: Schema.NonEmptyString,
  creationInfo: SpdxCreationInfo,
  packages: Schema.NonEmptyArray(SpdxPackage),
}) {}

/** CycloneDX 1.6 component classifications accepted by the official schema. */
export const CycloneDxComponentType = Schema.Literals(
  [
    "application",
    "framework",
    "library",
    "container",
    "platform",
    "operating-system",
    "device",
    "device-driver",
    "firmware",
    "file",
    "machine-learning-model",
    "data",
    "cryptographic-asset",
  ] as const,
);
export type CycloneDxComponentType = typeof CycloneDxComponentType.Type;

/** Component coordinates required for assertions in CycloneDX output. */
export class CycloneDxComponent extends Schema.Class<CycloneDxComponent>(
  "effect-build-sbom/CycloneDxComponent",
)({
  type: CycloneDxComponentType,
  name: Schema.NonEmptyString,
  version: Schema.optionalKey(Schema.NonEmptyString),
  "bom-ref": Schema.optionalKey(Schema.NonEmptyString),
}) {}

/** Required top-level CycloneDX JSON 1.6 document projection. */
export class CycloneDxJsonDocument extends Schema.Class<CycloneDxJsonDocument>(
  "effect-build-sbom/CycloneDxJsonDocument",
)({
  bomFormat: Schema.Literal("CycloneDX"),
  specVersion: Schema.Literal("1.6"),
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  serialNumber: Schema.optionalKey(Schema.NonEmptyString),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  components: Schema.NonEmptyArray(CycloneDxComponent),
}) {}

/** Syft produced bytes that do not satisfy the selected versioned document schema. */
export class SbomInvalid extends Schema.TaggedError<SbomInvalid>()("SbomInvalid", {
  format: Schema.String,
  reason: Schema.NonEmptyString,
}) {
  override get message(): string {
    return `invalid ${this.format} document: ${this.reason}`;
  }
}

export interface LayerOptions {
  /** Explicit Syft executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
  /** Maximum retained bytes for each Syft stdout/stderr stream. */
  readonly outputLimitBytes?: number;
}

export type GenerateError =
  | TreeAuthor.TreeVerificationFailed
  | FileAuthor.FileVerificationFailed
  | FileAuthor.PublicationFailure
  | SyftToolChanged
  | SyftTransportFailed
  | SyftCommandFailed
  | SyftOutputTruncated
  | SbomGenerationFailed
  | SbomInvalid;

interface Service {
  readonly generate: (
    format: OutputFormat,
    input: GenerateInput,
  ) => Effect.Effect<Artifact.HashedFile, GenerateError>;
}

export class Generator extends Context.Service<Generator, Service>()(
  "effect-build-sbom/Generate/Generator",
) {}

const nativeFormat: Readonly<Record<OutputFormat, string>> = {
  "spdx-json": "spdx-json@2.3",
  "cyclonedx-json": "cyclonedx-json@1.6",
};

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

const renderArgv = (
  format: OutputFormat,
  subject: string,
  kind: "dir" | "file",
  stagedPath: string,
): readonly string[] => [
  "scan",
  subject,
  "--from",
  kind,
  "--output",
  `${nativeFormat[format]}=${stagedPath}`,
  "--quiet",
];

export type LayerError =
  | SyftToolUnavailable
  | SyftToolChanged
  | SyftTransportFailed
  | SyftCommandFailed
  | SyftOutputTruncated;

const makeService = (
  options?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* SyftRuntime.make(options);
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const validate = (
      format: OutputFormat,
      bytes: Uint8Array,
    ): Effect.Effect<void, SbomInvalid> =>
      Effect.gen(function*() {
        const document = yield* Effect.try({
          try: () => JSON.parse(strictUtf8.decode(bytes)) as unknown,
          catch: (error) => new SbomInvalid({ format, reason: `parse JSON: ${String(error)}` }),
        });
        if (format === "spdx-json") {
          yield* Schema.decodeUnknownEffect(SpdxJsonDocument)(document).pipe(
            Effect.mapError((error) => new SbomInvalid({ format, reason: String(error) })),
          );
        } else {
          yield* Schema.decodeUnknownEffect(CycloneDxJsonDocument)(document).pipe(
            Effect.mapError((error) => new SbomInvalid({ format, reason: String(error) })),
          );
        }
      });

    const generate = Effect.fn("effect-build-sbom.generate")(
      function*(candidateFormat: OutputFormat, candidateInput: GenerateInput) {
        const format = yield* Schema.decodeUnknownEffect(OutputFormat)(candidateFormat).pipe(
          Effect.mapError((error) =>
            new SbomInvalid({
              format: typeof candidateFormat === "string" ? candidateFormat : "<invalid>",
              reason: `decode selected format: ${String(error)}`,
            })
          ),
        );
        const input = yield* Schema.decodeUnknownEffect(GenerateInput, { onExcessProperty: "error" })(candidateInput)
          .pipe(
            Effect.mapError((error) =>
              new SbomInvalid({ format, reason: `decode generation input: ${String(error)}` })
            ),
          );
        const extension = projections[format].extension;
        if (!input.outfile.endsWith(extension)) {
          return yield* Effect.fail(
            new SbomInvalid({ format, reason: `${format} output must end with ${extension}` }),
          );
        }
        const failWith = (operation: string, error: unknown) =>
          new SbomGenerationFailed({ operation, reason: error instanceof Error ? error.message : String(error) });
        type ProduceError =
          | TreeAuthor.TreeVerificationFailed
          | FileAuthor.FileVerificationFailed
          | SbomGenerationFailed
          | SyftRuntime.Failure;
        const subject = input.subject;
        const produce = (
          stagedPath: Artifact.AbsolutePath,
        ): Effect.Effect<void, ProduceError, Crypto.Crypto | FileSystem.FileSystem | Path.Path> => {
          const run = (source: string, kind: "dir" | "file") =>
            runtime.runScan(format, renderArgv(format, source, kind, stagedPath), input.cwd);
          if (subject._tag === "Directory") {
            return TreeAuthor.withVerifiedSnapshot(subject.snapshot, (source) => run(source, "dir"));
          }
          const artifact = subject.artifact;
          return FileAuthor.withVerifiedBytes(artifact, (contents) => {
            const subjectRoot = path.join(path.dirname(stagedPath), "effect-build-sbom-subject");
            const source = path.join(subjectRoot, path.basename(path.resolve(artifact.path)));
            return fileSystem.makeDirectory(subjectRoot).pipe(
              Effect.mapError((error) => failWith("create private file subject", error)),
              Effect.andThen(fileSystem.writeFile(source, contents)),
              Effect.mapError((error) => failWith("materialize private file subject", error)),
              Effect.andThen(run(source, "file")),
            );
          });
        };
        return yield* FileAuthor.publish(
          {
            destination: input.outfile,
            cwd: input.cwd,
            observation: "hashed",
            provenance: runtime.tool,
          },
          produce,
          (candidate) =>
            fileSystem.readFile(candidate.path).pipe(
              Effect.mapError((error) => failWith("read staged document for validation", error)),
              Effect.flatMap((bytes) => validate(format, bytes)),
            ),
        );
      },
    );

    return { generate: (format, input) => generate(format, input).pipe(Effect.provide(services)) };
  });

export const generate = (
  format: OutputFormat,
  input: GenerateInput,
): Effect.Effect<Artifact.HashedFile, GenerateError, Generator> =>
  Generator.use((service) => service.generate(format, input));

export const generateSpdxJson = (input: GenerateInput) => generate("spdx-json", input);
export const generateCycloneDxJson = (input: GenerateInput) => generate("cyclonedx-json", input);

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Generator,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Generator, makeService(options));

import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import { PublishFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { NfpmConfigurationRejected } from "./NfpmConfigurationRejected.js";

export { NfpmConfigurationRejected } from "./NfpmConfigurationRejected.js";

/** The five nFPM package implementations selected by the release contract. */
export const Format = Schema.Literals(["deb", "rpm", "apk", "archlinux", "msix"] as const);
export type Format = typeof Format.Type;

const NfpmLiteral = Schema.NonEmptyString.check(
  Schema.isPattern(/^[^$]+$/, { expected: "a non-empty literal with no ambient-environment expansion" }),
);

const PackagePath = NfpmLiteral.check(
  Schema.makeFilter(
    (value) => {
      const segments = value.startsWith("/") ? value.slice(1).split("/") : [];
      return segments.length > 0
          && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
          && !value.includes("\\")
          && !value.includes("\0")
        ? undefined
        : "package destination is not one canonical absolute file path";
    },
    { expected: "one canonical absolute package file path with no dot, empty, backslash, or NUL segments" },
  ),
);

const RelativePackagePath = NfpmLiteral.check(
  Schema.makeFilter(
    (value) => {
      const segments = value.startsWith("/") ? [] : value.split("/");
      return segments.length > 0
          && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
          && !value.includes("\\")
          && !value.includes("\0")
        ? undefined
        : "package-relative path is not canonical";
    },
    { expected: "one canonical relative package path with no dot, empty, backslash, or NUL segments" },
  ),
);

const utcTimestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

const CanonicalTimestamp = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      const match = utcTimestamp.exec(value);
      if (match === null) return "timestamp is not canonical UTC ISO-8601";
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6]);
      const parsed = new Date(0);
      parsed.setUTCFullYear(year, month - 1, day);
      parsed.setUTCHours(hour, minute, second, 0);
      return parsed.getUTCFullYear() === year
          && parsed.getUTCMonth() === month - 1
          && parsed.getUTCDate() === day
          && parsed.getUTCHours() === hour
          && parsed.getUTCMinutes() === minute
          && parsed.getUTCSeconds() === second
        ? undefined
        : "timestamp does not name a real UTC calendar instant";
    },
    { expected: "a real canonical UTC ISO-8601 timestamp with at most nanosecond precision" },
  ),
);

/** One explicit source-to-package filesystem projection. */
export class PackageContent extends Schema.Class<PackageContent>(
  "effect-build-nfpm/PackageContent",
)({
  artifact: Artifact.FinalizedFile,
  dst: PackagePath,
  /** Exact portable permission mode rendered as nFPM `file_info.mode`. */
  mode: Schema.optionalKey(Artifact.Mode),
}) {}

/** Required package identity and metadata shared by all five nFPM formats. */
export class PackageMetadata extends Schema.Class<PackageMetadata>(
  "effect-build-nfpm/PackageMetadata",
)({
  name: NfpmLiteral,
  version: NfpmLiteral,
  architecture: NfpmLiteral,
  maintainer: NfpmLiteral,
  description: NfpmLiteral,
  contents: Schema.NonEmptyArray(PackageContent),
  platform: Schema.optionalKey(NfpmLiteral),
  homepage: Schema.optionalKey(NfpmLiteral),
  license: Schema.optionalKey(NfpmLiteral),
  vendor: Schema.optionalKey(NfpmLiteral),
  dependencies: Schema.optionalKey(Schema.Array(NfpmLiteral)),
}) {}

export class MsixProperties extends Schema.Class<MsixProperties>(
  "effect-build-nfpm/MsixProperties",
)({
  display_name: NfpmLiteral,
  publisher_display_name: NfpmLiteral,
  logo: RelativePackagePath,
}) {}

export class MsixVisualElements extends Schema.Class<MsixVisualElements>(
  "effect-build-nfpm/MsixVisualElements",
)({
  display_name: NfpmLiteral,
  description: NfpmLiteral,
  background_color: NfpmLiteral,
  square150x150_logo: RelativePackagePath,
  square44x44_logo: RelativePackagePath,
}) {}

export class MsixApplication extends Schema.Class<MsixApplication>(
  "effect-build-nfpm/MsixApplication",
)({
  id: NfpmLiteral,
  executable: RelativePackagePath,
  entry_point: NfpmLiteral,
  visual_elements: MsixVisualElements,
}) {}

export class MsixTargetDeviceFamily extends Schema.Class<MsixTargetDeviceFamily>(
  "effect-build-nfpm/MsixTargetDeviceFamily",
)({
  name: NfpmLiteral,
  min_version: NfpmLiteral,
  max_version_tested: NfpmLiteral,
}) {}

export class MsixDependencies extends Schema.Class<MsixDependencies>(
  "effect-build-nfpm/MsixDependencies",
)({
  target_device_families: Schema.NonEmptyArray(MsixTargetDeviceFamily),
}) {}

/** Closed nFPM 2.47.x MSIX configuration selected by the launch contract. */
export class MsixOptions extends Schema.Class<MsixOptions>("effect-build-nfpm/MsixOptions")({
  publisher: NfpmLiteral,
  properties: MsixProperties,
  applications: Schema.NonEmptyArray(MsixApplication),
  dependencies: MsixDependencies,
}) {}

/** Closed, schema-checked package metadata and final output coordinates. */
export class PackageInput extends Schema.Class<PackageInput>("effect-build-nfpm/PackageInput")({
  metadata: PackageMetadata,
  release: NfpmLiteral,
  mtime: CanonicalTimestamp,
  msix: Schema.optionalKey(MsixOptions),
  outfile: Schema.NonEmptyString,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
}) {}

/** Stable format information for naming and HTTP publication projections. */
export class FormatProjection extends Schema.Class<FormatProjection>(
  "effect-build-nfpm/FormatProjection",
)({
  format: Format,
  extension: Schema.NonEmptyString,
  mediaType: Schema.NonEmptyString,
}) {}

const projections: Readonly<Record<Format, FormatProjection>> = {
  deb: new FormatProjection({
    format: "deb",
    extension: ".deb",
    mediaType: "application/vnd.debian.binary-package",
  }),
  rpm: new FormatProjection({
    format: "rpm",
    extension: ".rpm",
    mediaType: "application/x-rpm",
  }),
  apk: new FormatProjection({
    format: "apk",
    extension: ".apk",
    mediaType: "application/vnd.alpine.apk",
  }),
  archlinux: new FormatProjection({
    format: "archlinux",
    extension: ".pkg.tar.zst",
    mediaType: "application/zstd",
  }),
  msix: new FormatProjection({
    format: "msix",
    extension: ".msix",
    mediaType: "application/msix",
  }),
};

export const formatProjection = (candidate: Format): FormatProjection =>
  projections[Schema.decodeUnknownSync(Format)(candidate)];

export interface LayerOptions {
  /** Explicit nFPM executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type PackageError = ArtifactVerificationFailed | ToolFailed | PublishFailed | NfpmConfigurationRejected;

interface Service {
  readonly buildPackage: (
    format: Format,
    input: PackageInput,
  ) => Effect.Effect<Artifact.FileArtifact, PackageError>;
}

export class Packager extends Context.Service<Packager, Service>()(
  "effect-build-nfpm/Package/Packager",
) {}

/** nFPM releases exercised by this integration; other versions warn once. */
const tested: Toolchain.TestedRange = { minimum: "2.47.0", before: "2.48.0" };

const parseNfpmVersion = (stdout: string): string | undefined =>
  /(?:^|\s)(?:v)?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/m.exec(stdout)?.[1];

const renderArgv = (
  format: Format,
  configFile: string,
  stagedPath: string,
): readonly string[] => [
  "package",
  "--config",
  configFile,
  "--packager",
  format,
  "--target",
  stagedPath,
];

const renderContent = (content: PackageContent, source: string): Schema.Json => ({
  src: source,
  dst: content.dst,
  type: "file",
  expand: false,
  ...(content.mode === undefined ? {} : { file_info: { mode: content.mode } }),
});

const renderMsix = (input: MsixOptions): Schema.Json => ({
  publisher: input.publisher,
  properties: {
    display_name: input.properties.display_name,
    publisher_display_name: input.properties.publisher_display_name,
    logo: input.properties.logo,
  },
  applications: input.applications.map((application) => ({
    id: application.id,
    executable: application.executable,
    entry_point: application.entry_point,
    visual_elements: {
      display_name: application.visual_elements.display_name,
      description: application.visual_elements.description,
      background_color: application.visual_elements.background_color,
      square150x150_logo: application.visual_elements.square150x150_logo,
      square44x44_logo: application.visual_elements.square44x44_logo,
    },
  })),
  dependencies: {
    target_device_families: input.dependencies.target_device_families.map((family) => ({
      name: family.name,
      min_version: family.min_version,
      max_version_tested: family.max_version_tested,
    })),
  },
});

const renderConfiguration = (
  format: Format,
  input: PackageInput,
  sources: readonly string[],
): Schema.Json => ({
  disable_globbing: true,
  name: input.metadata.name,
  version: input.metadata.version,
  arch: input.metadata.architecture,
  maintainer: input.metadata.maintainer,
  description: input.metadata.description,
  release: input.release,
  mtime: input.mtime,
  contents: input.metadata.contents.map((content, index) => renderContent(content, sources[index] ?? "")),
  ...(input.metadata.platform === undefined ? {} : { platform: input.metadata.platform }),
  ...(input.metadata.homepage === undefined ? {} : { homepage: input.metadata.homepage }),
  ...(input.metadata.license === undefined ? {} : { license: input.metadata.license }),
  ...(input.metadata.vendor === undefined ? {} : { vendor: input.metadata.vendor }),
  ...(input.metadata.dependencies === undefined ? {} : { depends: input.metadata.dependencies }),
  ...(format === "msix" && input.msix !== undefined ? { msix: renderMsix(input.msix) } : {}),
});

type LayerError = ToolNotFound | ToolFailed;

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
    const executable = yield* Toolchain.resolveExecutable({ name: "nfpm", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({
      tool: "nfpm",
      executable,
      args: ["--version"],
      parse: parseNfpmVersion,
    });
    yield* Toolchain.warnIfUntested({ tool: "nfpm", version, tested });
    const tool: Artifact.Tool = { name: "nfpm", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const buildPackage = Effect.fn("effect-build-nfpm.buildPackage")(
      function*(candidateFormat: Format, candidateInput: PackageInput) {
        const format = yield* Schema.decodeUnknownEffect(Format)(candidateFormat).pipe(
          Effect.mapError((error) =>
            new NfpmConfigurationRejected({ path: "format", reason: `decode selected format: ${String(error)}` })
          ),
        );
        const input = yield* Schema.decodeUnknownEffect(PackageInput, { onExcessProperty: "error" })(
          candidateInput,
        ).pipe(
          Effect.mapError((error) =>
            new NfpmConfigurationRejected({ path: "input", reason: `decode package input: ${String(error)}` })
          ),
        );
        const extension = projections[format].extension;
        if (!input.outfile.endsWith(extension)) {
          return yield* Effect.fail(
            new NfpmConfigurationRejected({
              path: "input.outfile",
              reason: `${format} output must end with ${extension}`,
            }),
          );
        }
        if (format === "msix" && input.msix === undefined) {
          return yield* Effect.fail(
            new NfpmConfigurationRejected({ path: "input.msix", reason: "MSIX output requires closed MSIX metadata" }),
          );
        }
        if (format !== "msix" && input.msix !== undefined) {
          return yield* Effect.fail(
            new NfpmConfigurationRejected({
              path: "input.msix",
              reason: `${format} output cannot carry MSIX-only metadata`,
            }),
          );
        }
        return yield* Toolchain.publishFile({
          tool,
          outfile: input.outfile,
          cwd: input.cwd,
          produce: (stagedPath) =>
            Effect.gen(function*() {
              const inputs = path.join(path.dirname(stagedPath), "inputs");
              yield* fileSystem.makeDirectory(inputs, { recursive: true }).pipe(
                Effect.mapError((error) =>
                  new PublishFailed({
                    destination: path.resolve(input.cwd ?? "", input.outfile),
                    reason: `create private nFPM inputs: ${String(error)}`,
                  })
                ),
              );
              const sources: string[] = [];
              for (const [index, content] of input.metadata.contents.entries()) {
                const bytes = yield* Toolchain.readVerifiedFile(content.artifact);
                const source = path.join(inputs, String(index));
                yield* fileSystem.writeFile(source, bytes).pipe(
                  Effect.mapError((error) =>
                    new PublishFailed({
                      destination: path.resolve(input.cwd ?? "", input.outfile),
                      reason: `materialize private nFPM input ${index}: ${String(error)}`,
                    })
                  ),
                );
                sources.push(source);
              }
              const configFile = path.join(path.dirname(stagedPath), "nfpm.json");
              yield* fileSystem.writeFileString(
                configFile,
                `${JSON.stringify(renderConfiguration(format, input, sources), undefined, 2)}\n`,
              ).pipe(
                Effect.mapError((error) =>
                  new PublishFailed({
                    destination: path.resolve(input.cwd ?? "", input.outfile),
                    reason: `write private nFPM configuration: ${String(error)}`,
                  })
                ),
              );
              yield* Toolchain.runOrFail({
                tool: "nfpm",
                executable,
                args: renderArgv(format, configFile, stagedPath),
                cwd: input.cwd,
              });
            }),
        });
      },
    );

    return {
      buildPackage: (format, input) => buildPackage(format, input).pipe(Effect.provide(services)),
    };
  });

export const buildPackage = (
  format: Format,
  input: PackageInput,
): Effect.Effect<Artifact.FileArtifact, PackageError, Packager> =>
  Packager.use((service) => service.buildPackage(format, input));

export const buildDeb = (input: PackageInput) => buildPackage("deb", input);
export const buildRpm = (input: PackageInput) => buildPackage("rpm", input);
export const buildApk = (input: PackageInput) => buildPackage("apk", input);
export const buildArchLinux = (input: PackageInput) => buildPackage("archlinux", input);
export const buildMsix = (input: PackageInput) => buildPackage("msix", input);

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Packager,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Packager, makeService(options));

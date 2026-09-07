import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Tool } from "effect-build";

export class Nfpm extends Context.Service<Nfpm, { readonly tool: Tool.Resolved }>()("effect-build-nfpm/Nfpm") {}

export interface LayerOptions {
  readonly executable?: string;
  readonly version?: string | ((version: string) => boolean);
}
export const tested = ">=2.47.0 <3.0.0";
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

export const layer = (options: LayerOptions = {}): Layer.Layer<
  Nfpm,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> => Layer.effect(Nfpm, Tool.resolve({
  name: "nfpm",
  ...(options.executable === undefined ? {} : { executable: options.executable }),
  parseVersion: (completion) => /^GitVersion:\s+(\S+)/mu.exec(new TextDecoder().decode(completion.stdout))?.[1],
}).pipe(Tool.requireVersion(options.version ?? tested), Effect.map((tool) => ({ tool }))));

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("NfpmInputInvalid", {
  reason: Schema.String,
}) {}

export const Format = Schema.Literals(["deb", "rpm", "apk", "archlinux", "msix"] as const);
export type Format = typeof Format.Type;

// nFPM expands environment variables in metadata; literals keep builds independent of the shell environment.
const LocalPath = Schema.NonEmptyString.check(Schema.makeFilter((value) => value.includes("\0") ? "path contains NUL" : undefined));
const Literal = LocalPath.check(Schema.isPattern(/^[^$]+$/u));
const packagePath = (absolute: boolean) => Literal.check(Schema.makeFilter((value) => {
  const segments = (absolute ? value.slice(1) : value).split("/");
  return value.startsWith("/") === absolute && !value.includes("\\")
      && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
    ? undefined
    : `expected a canonical ${absolute ? "absolute" : "relative"} package path`;
}));
const RelativePath = packagePath(false);
const Timestamp = Schema.String.check(Schema.makeFilter((value) => {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)
      && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19)
    ? undefined
    : "expected a real UTC ISO-8601 timestamp with at most nanosecond precision";
}));

export const Content = Schema.Struct({
  artifact: Schema.Union([Artifact.File, Artifact.Executable]),
  dst: packagePath(true),
  /** Defaults to 0755 for executables and 0644 for files. */
  mode: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0o7777 }))),
});
export type Content = typeof Content.Type;

/** nFPM's native MSIX metadata; content destinations remain absolute package paths. */
export const MsixOptions = Schema.Struct({
  publisher: Literal,
  properties: Schema.Struct({
    display_name: Literal,
    publisher_display_name: Literal,
    logo: RelativePath,
  }),
  applications: Schema.NonEmptyArray(Schema.Struct({
    id: Literal,
    executable: RelativePath,
    entry_point: Literal,
    visual_elements: Schema.Struct({
      display_name: Literal,
      description: Literal,
      background_color: Literal,
      square150x150_logo: RelativePath,
      square44x44_logo: RelativePath,
    }),
  })),
  dependencies: Schema.Struct({
    target_device_families: Schema.NonEmptyArray(Schema.Struct({
      name: Literal,
      min_version: Literal,
      max_version_tested: Literal,
    })),
  }),
});
export type MsixOptions = typeof MsixOptions.Type;

export const PackageInput = Schema.Struct({
  format: Format,
  name: Literal,
  version: Literal,
  architecture: Literal,
  maintainer: Literal,
  description: Literal,
  release: Literal,
  mtime: Timestamp,
  contents: Schema.NonEmptyArray(Content),
  platform: Schema.optionalKey(Literal),
  homepage: Schema.optionalKey(Literal),
  license: Schema.optionalKey(Literal),
  vendor: Schema.optionalKey(Literal),
  dependencies: Schema.optionalKey(Schema.Array(Literal)),
  msix: Schema.optionalKey(MsixOptions),
  outfile: LocalPath,
  cwd: Schema.optionalKey(LocalPath),
  atomic: Schema.optionalKey(Schema.Boolean),
});
export type PackageInput = typeof PackageInput.Type;
export type PackageError = InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });

const packageArtifact = (candidate: PackageInput): Effect.Effect<Artifact.File, PackageError, Nfpm | Env> =>
  Effect.scoped(Effect.gen(function*() {
    // Artifacts may carry provider refinements; only nFPM's known configuration fields are serialized.
    const input = yield* Schema.decodeUnknownEffect(PackageInput)(candidate).pipe(
      Effect.mapError((error) => new InputInvalid({ reason: String(error) })),
    );
    if ((input.format === "msix") !== (input.msix !== undefined)) {
      return yield* new InputInvalid({ reason: "msix metadata is required only for the msix format" });
    }
    const { tool } = yield* Nfpm;
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, input.outfile);
    // nFPM reads private copies, so it packages exactly the bytes that passed artifact verification.
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-nfpm-" }).pipe(Effect.mapError(fileError(outfile)));
    const contents: Schema.Json[] = [];
    for (const content of input.contents) {
      const source = p.join(temporary, `input-${contents.length}`);
      yield* fs.writeFile(source, yield* Artifact.readVerified(content.artifact)).pipe(Effect.mapError(fileError(source)));
      contents.push({
        src: source,
        dst: content.dst,
        type: "file",
        expand: false,
        file_info: { mode: content.mode ?? (content.artifact.kind === "executable" ? 0o755 : 0o644) },
      });
    }
    const config = p.join(temporary, "nfpm.json");
    yield* fs.writeFileString(config, JSON.stringify({
      disable_globbing: true,
      name: input.name,
      version: input.version,
      arch: input.architecture,
      maintainer: input.maintainer,
      description: input.description,
      release: input.release,
      mtime: input.mtime,
      contents,
      platform: input.platform,
      homepage: input.homepage,
      license: input.license,
      vendor: input.vendor,
      depends: input.dependencies,
      msix: input.msix,
    })).pipe(Effect.mapError(fileError(config)));
    const produce = (out: string) => Effect.gen(function*() {
      yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError(out)));
      yield* Tool.run(tool, ["package", "--config", config, "--packager", input.format, "--target", out], { cwd });
      return yield* Artifact.file(out, Tool.producer(tool));
    });
    return yield* input.atomic === false ? produce(outfile) : Commit.atomic(outfile, produce);
  }));

export { packageArtifact as package };

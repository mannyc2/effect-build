import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Target, Tool } from "effect-build";

export class Nfpm extends Context.Service<Nfpm, { readonly tool: Tool.Resolved }>()("effect-build-nfpm/Nfpm") {}

export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
/** nFPM 2.47+ accepts the JSON configuration, disable_globbing, and MSIX packager used here. */
export const supported = ">=2.47.0 <3.0.0";
/** Exact version exercised by real-tool CI with deb, rpm, apk, archlinux, and MSIX packages. */
export const tested = "2.47.0";
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

export const layer = (options: LayerOptions = {}): Layer.Layer<
  Nfpm,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> => Layer.effect(Nfpm, Tool.resolve({
  name: "nfpm",
  executable: options.executable,
  parseVersion: (completion) => /^GitVersion:\s+(\S+)/mu.exec(new TextDecoder().decode(completion.stdout))?.[1],
}).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))));

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("NfpmInputInvalid", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}

export const Format = Schema.Literals(["deb", "rpm", "apk", "archlinux", "msix"] as const);
export type Format = typeof Format.Type;

const LocalPath = Schema.NonEmptyString.check(Schema.makeFilter((value) => value.includes("\0") ? "path contains NUL" : undefined));
const PackagePath = LocalPath.check(Schema.makeFilter((value) =>
  value.startsWith("/") && !value.includes("\\") && value.slice(1).split("/").every((part) => part !== "" && part !== "." && part !== "..")
    ? undefined : "expected a canonical absolute package path"));

export const Content = Schema.Struct({
  artifact: Schema.Union([Artifact.File, Artifact.Executable]),
  dst: PackagePath,
  /** Defaults to 0755 for executables and 0644 for files. */
  mode: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0o7777 }))),
});
export type Content = typeof Content.Type;

/**
 * Native nFPM JSON configuration. The library supplies contents and disable_globbing.
 * The rest signature admits undefined so consumers without exactOptionalPropertyTypes can
 * still assign objects with optional keys; JSON serialization drops undefined values.
 */
export const Configuration = Schema.StructWithRest(Schema.Struct({
  name: LocalPath,
  version: LocalPath,
  arch: LocalPath,
  platform: Schema.optional(LocalPath),
}), [Schema.Record(Schema.String, Schema.UndefinedOr(Schema.Json))]);
export type Configuration = typeof Configuration.Type;

export const PackageInput = Schema.Struct({
  format: Format,
  config: Configuration,
  contents: Schema.NonEmptyArray(Content),
  outfile: LocalPath,
  cwd: Schema.optional(LocalPath),
  atomic: Schema.optional(Schema.Boolean),
});
export type PackageInput = typeof PackageInput.Type;
export type PackageError = InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });

const packageArtifact = Effect.fn("Nfpm.package")((candidate: PackageInput): Effect.Effect<Artifact.File, PackageError, Nfpm | Env> =>
  Effect.scoped(Effect.gen(function*() {
    // Preserve native configuration keys; decoded artifact refinements are not nFPM configuration.
    const input = yield* Schema.decodeUnknownEffect(PackageInput)(candidate).pipe(
      Effect.mapError((error) => new InputInvalid({ reason: String(error) })),
    );
    const config = input.config;
    if ((input.format === "msix") !== (config.msix !== undefined)) {
      return yield* new InputInvalid({ reason: "msix metadata is required only for the msix format" });
    }
    const reserved = ["contents", "disable_globbing"];
    if (reserved.some((key) => key in config)) {
      return yield* new InputInvalid({ reason: "contents and disable_globbing are supplied by the artifact package operation" });
    }
    if (typeof config.overrides === "object" && config.overrides !== null) {
      for (const override of Object.values(config.overrides)) {
        if (typeof override === "object" && override !== null && [...reserved, "arch", "platform"].some((key) => key in override)) {
          return yield* new InputInvalid({ reason: "format overrides cannot replace artifact contents, architecture, platform, or disable_globbing" });
        }
      }
    }
    const os = input.format === "msix" ? "windows" : "linux";
    if (config.platform !== undefined && config.platform !== os) {
      return yield* new InputInvalid({ reason: `${input.format} requires platform ${os}` });
    }
    for (const { artifact } of input.contents) {
      if (artifact.kind !== "executable") continue;
      const target = Target.parts(artifact.target);
      const architectures = target.arch === "x64" ? ["amd64", "x86_64", "x64"] : ["arm64", "aarch64"];
      if (target.os !== os || !architectures.includes(config.arch)) {
        return yield* new InputInvalid({ reason: `${artifact.target} executable contradicts ${input.format} architecture ${config.arch} / platform ${os}` });
      }
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
      yield* Artifact.copyVerified(content.artifact, source);
      contents.push({
        src: source,
        dst: content.dst,
        type: "file",
        expand: false,
        file_info: { mode: content.mode ?? (content.artifact.kind === "executable" ? 0o755 : 0o644) },
      });
    }
    const configPath = p.join(temporary, "nfpm.json");
    yield* fs.writeFileString(configPath, JSON.stringify({ ...config, disable_globbing: true, contents })).pipe(Effect.mapError(fileError(configPath)));
    const produce = (out: string) =>
      Tool.run(tool, ["package", "--config", configPath, "--packager", input.format, "--target", out], { cwd }).pipe(
        Effect.andThen(Artifact.file(out, Tool.producer(tool))),
      );
    return yield* Commit.output(outfile, produce, { atomic: input.atomic });
  })));

export { packageArtifact as package };

import { Context, Crypto, Effect, FileSystem, Path, Schema } from "effect";
import { Artifact, Commit, Target, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";

export class Nfpm extends Context.Service<Nfpm, Tool.Service>()("effect-build-nfpm/Nfpm") {}

export const { name, layer, supported, tested, constraints, requirements, resolved, testLayer } = Tool.provider(Nfpm, {
  name: "nfpm",
  version: { parse: Tool.versionPattern(/^GitVersion:\s+(\S+)/mu), supported: ">=2.47.0 <3.0.0", tested: ["2.47.0"] },
  requirements: { env: ["HOME", "SOURCE_DATE_EPOCH"], network: false, services: [],
    detail: "Configuration may expand environment variables; package scripts name additional host inputs." },
});

type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

export const Format = Schema.Literals(["deb", "rpm", "apk", "archlinux", "msix"] as const);
export type Format = typeof Format.Type;

const LocalPath = Schema.String.check(Schema.makeFilter((value) => {
  const issue = Tool.argumentIssue(value);
  return issue === undefined ? undefined : `path ${issue}`;
}));
const PackagePath = LocalPath.check(
  Schema.makeFilter((value) =>
    value.startsWith("/") && !value.includes("\\")
      && value.slice(1).split("/").every((part) => part !== "" && part !== "." && part !== "..")
      ? undefined
      : "expected a canonical absolute package path"
  ),
);

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
export const Configuration = Schema.StructWithRest(
  Schema.Struct({
    name: LocalPath,
    version: LocalPath,
    arch: LocalPath,
    platform: Schema.optional(LocalPath),
  }),
  [Schema.Record(Schema.String, Schema.UndefinedOr(Schema.Json))],
);
export type Configuration = typeof Configuration.Type;

export const PackageInput = Schema.Struct({
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optional(Schema.Boolean),
  scrubEnv: Schema.optional(Schema.Boolean),
  format: Format,
  config: Configuration,
  contents: Schema.NonEmptyArray(Content),
  outfile: LocalPath,
  cwd: Schema.optional(LocalPath),
  atomic: Schema.optional(Schema.Boolean),
  onExists: Schema.optional(Schema.Literals(["replace", "fail"] as const)),
  prefix: Schema.optional(LocalPath),
});
export type PackageInput = typeof PackageInput.Type;
export type PackageError =
  | Tool.InputInvalid
  | Artifact.ArtifactError
  | Tool.Failed
  | Tool.SpawnFailed
  | Commit.CommitError;
const invalid = (reason: string) => new Tool.InputInvalid({ operation: "Nfpm.package", reason });
const packageArtifact = Effect.fn("Nfpm.package")((
  candidate: PackageInput,
): Effect.Effect<Artifact.File, PackageError, Nfpm | Env> =>
  Effect.scoped(Effect.gen(function*() {
    // Preserve native configuration keys; decoded artifact refinements are not nFPM configuration.
    const input = yield* Schema.decodeUnknownEffect(PackageInput)(candidate).pipe(
      Effect.mapError((error) => invalid(String(error))),
    );
    const config = input.config;
    if ((input.format === "msix") !== (config.msix !== undefined)) {
      return yield* invalid("msix metadata is required only for the msix format");
    }
    const reserved = ["contents", "disable_globbing"];
    if (reserved.some((key) => key in config)) {
      return yield* invalid("contents and disable_globbing are supplied by the artifact package operation");
    }
    if (typeof config.overrides === "object" && config.overrides !== null) {
      for (const override of Object.values(config.overrides)) {
        if (
          typeof override === "object" && override !== null
          && [...reserved, "arch", "platform"].some((key) => key in override)
        ) {
          return yield* invalid(
            "format overrides cannot replace artifact contents, architecture, platform, or disable_globbing",
          );
        }
      }
    }
    const os = input.format === "msix" ? "windows" : "linux";
    if (config.platform !== undefined && config.platform !== os) {
      return yield* invalid(`${input.format} requires platform ${os}`);
    }
    for (const { artifact } of input.contents) {
      if (artifact.kind !== "executable") continue;
      const target = Target.parts(artifact.target);
      // nFPM passes arch through in each packager's vocabulary (deb amd64, rpm x86_64, msix x64); accept any spelling of this CPU.
      const architectures = target.arch === "x64" ? ["amd64", "x86_64", "x64"] : ["arm64", "aarch64"];
      if (target.os !== os || !architectures.includes(config.arch)) {
        return yield* invalid(
          `${artifact.target} executable contradicts ${input.format} architecture ${config.arch} / platform ${os}`,
        );
      }
    }
    const { tool } = yield* Nfpm;
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, input.outfile);
    // nFPM reads private copies, so it packages exactly the bytes that passed artifact verification.
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-nfpm-" }).pipe(
      Effect.mapError(Artifact.ioError(outfile, "write")),
    );
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
    yield* fs.writeFileString(configPath, JSON.stringify({ ...config, disable_globbing: true, contents })).pipe(
      Effect.mapError(Artifact.ioError(configPath, "write")),
    );
    const produce = (out: string) =>
      Tool.run(tool, ["package", "--config", configPath, "--packager", input.format, "--target", out], { env: input.env, extendEnv: input.extendEnv, scrubEnv: input.scrubEnv, cwd }).pipe(
        Effect.andThen(Artifact.file(out, Tool.producedBy(tool))),
      );
    return yield* Commit.output(outfile, produce, input);
  }))
);

export { packageArtifact as package };

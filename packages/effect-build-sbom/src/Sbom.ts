import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";

export class Sbom extends Context.Service<Sbom, { readonly tool: Tool.Resolved }>()("effect-build-sbom/Sbom") {}

export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
/** Syft majors share the scan and output-format flags used here. */
export const supported = ">=1.50.0 <2.0.0";
/** Exact version exercised by real-tool CI against directories, lockfiles, and executables. */
export const tested = "1.50.0";
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

export const layer = (options: LayerOptions = {}): Layer.Layer<
  Sbom,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> =>
  Layer.effect(
    Sbom,
    Tool.resolve({
      name: "syft",
      executable: options.executable,
      parseVersion: (completion) => /^syft (\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
    }).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))),
  );
export const Format = Schema.Literals(["spdx-json", "cyclonedx-json"] as const);
export type Format = typeof Format.Type;
const nativeFormat = { "spdx-json": "spdx-json@2.3", "cyclonedx-json": "cyclonedx-json@1.6" } as const;

export interface GenerateInput extends Commit.ProducerOptions {
  /** Release artifact associated with the inventory; always verified. */
  readonly subject: Artifact.Artifact;
  /** Source tree or named lockfile to scan for bundled dependencies. Without this, only the subject is scanned. */
  readonly source?: Artifact.Directory | Artifact.File | undefined;
  readonly format: Format;
  readonly outfile: string;
  readonly cwd?: string | undefined;
}
export type GenerateError =
  | Tool.InputInvalid
  | Artifact.ArtifactError
  | Tool.Failed
  | Tool.SpawnFailed
  | Commit.CommitError;
const invalid = (reason: string) => new Tool.InputInvalid({ operation: "Sbom.generate", reason });

/** Inventories packages discoverable by Syft in source ?? subject. Success does not establish dependency completeness. */
export const generate = Effect.fn("Sbom.generate")((
  input: GenerateInput,
): Effect.Effect<Artifact.File, GenerateError, Sbom | Env> =>
  Effect.gen(function*() {
    const format = yield* Schema.decodeUnknownEffect(Format)(input.format).pipe(
      Effect.mapError((error) => invalid(String(error))),
    );
    const issue = Tool.argumentIssue(input.outfile);
    if (issue !== undefined) return yield* invalid(`outfile ${issue}`);
    if (input.cwd?.includes("\0")) return yield* invalid("cwd must contain no NUL");
    const { tool } = yield* Sbom;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, input.outfile);
    // Syft's catalogers use source filenames; verify the artifact and scan its original path.
    const subject = yield* Artifact.verify(input.subject);
    const source = input.source === undefined ? subject : yield* Artifact.verify(input.source);
    const produce = (out: string) =>
      Tool.run(tool, [
        "scan",
        source.path,
        "--from",
        source.kind === "directory" ? "dir" : "file",
        "--output",
        `${nativeFormat[format]}=${out}`,
        "--quiet",
      ], { cwd }).pipe(Effect.andThen(Artifact.file(out, Tool.producer(tool))));
    return yield* Commit.output(outfile, produce, input);
  })
);

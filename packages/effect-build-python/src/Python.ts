import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";

export class Python extends Context.Service<Python, { readonly tool: Tool.Resolved }>()("effect-build-python/Python") {}
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
type Env = Fs | ChildProcessSpawner.ChildProcessSpawner;
/** uv 0.12+ builds the sdist first and the wheel from it; the flags used here are stable across 0.x. */
export const supported = ">=0.12.0 <1.0.0";
/** Exact version exercised by real-tool CI. */
export const tested = "0.12.0";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Python,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> =>
  Layer.effect(
    Python,
    Tool.resolve({
      name: "uv",
      executable: options.executable,
      parseVersion: (completion) => /^uv (\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
    }).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))),
  );

export interface BuildInput extends Commit.ProducerOptions {
  readonly project: string;
  readonly outdir: string;
}
export interface BuildResult {
  readonly wheel: Artifact.File;
  readonly sdist: Artifact.File;
}
export type BuildError =
  | Tool.InputInvalid
  | Tool.Failed
  | Tool.SpawnFailed
  | Artifact.ArtifactError
  | Commit.CommitError;

/** uv writes the wheel and sdist at the top of its output directory. */
const topLevel = (suffix: string) => (entry: Artifact.Entry) =>
  entry.kind === "file" && !entry.path.includes("/") && entry.path.endsWith(suffix);

export const build = Effect.fn("Python.build")((
  input: BuildInput,
): Effect.Effect<BuildResult, BuildError, Python | Env> =>
  Effect.gen(function*() {
    for (const [field, value] of [["project", input.project], ["outdir", input.outdir]] as const) {
      const issue = Tool.argumentIssue(value);
      if (issue !== undefined) {
        return yield* new Tool.InputInvalid({ operation: "Python.build", reason: `${field} ${issue}` });
      }
    }
    const { tool } = yield* Python;
    const p = yield* Path.Path;
    const project = p.resolve(input.project);
    const outdir = p.resolve(input.outdir);
    const producer = Tool.producer(tool);
    const produce = (out: string) =>
      Effect.gen(function*() {
        // uv's default builds the wheel from its sdist, checking that the source archive is complete.
        yield* Tool.run(tool, ["build", project, "--out-dir", out, "--no-create-gitignore"], { cwd: project });
        const directory = yield* Artifact.directory(out, producer);
        if (
          directory.entries.filter(topLevel(".whl")).length !== 1
          || directory.entries.filter(topLevel(".tar.gz")).length !== 1
        ) {
          return yield* new Tool.InputInvalid({
            operation: "Python.build",
            reason: "uv output must contain exactly one wheel and one .tar.gz sdist",
          });
        }
        return directory;
      });
    const directory = yield* Commit.output(outdir, produce, input, "sibling");
    // Re-read at the committed paths so callers receive ordinary core file artifacts.
    const wheel = directory.entries.find(topLevel(".whl"))!;
    const sdist = directory.entries.find(topLevel(".tar.gz"))!;
    return {
      wheel: yield* Artifact.file(p.join(directory.path, wheel.path), producer),
      sdist: yield* Artifact.file(p.join(directory.path, sdist.path), producer),
    };
  })
);

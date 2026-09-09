import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Tool } from "effect-build";
import { InputInvalid } from "./InputInvalid.js";

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
  Python, Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported, Env
> => Layer.effect(Python, Tool.resolve({
  name: "uv",
  executable: options.executable,
  parseVersion: (completion) => /^uv (\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
}).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))));

export interface BuildInput extends Commit.ProducerOptions {
  readonly project: string;
  readonly outdir: string;
}
export interface BuildResult {
  readonly wheel: Artifact.File;
  readonly sdist: Artifact.File;
}
export type BuildError = InputInvalid | Tool.Failed | Tool.SpawnFailed | Artifact.ArtifactError | Commit.CommitError;

export const build = Effect.fn("Python.build")((input: BuildInput): Effect.Effect<BuildResult, BuildError, Python | Env> =>
  Effect.gen(function*() {
    if ([input.project, input.outdir].some((path) => path.length === 0 || path.includes("\0"))) {
      return yield* new InputInvalid({ reason: "project and outdir must be non-empty paths without NUL" });
    }
    const { tool } = yield* Python;
    const p = yield* Path.Path;
    const project = p.resolve(input.project);
    const outdir = p.resolve(input.outdir);
    const producer = Tool.producer(tool);
    const produce = (out: string) => Effect.gen(function*() {
      // uv's default builds the wheel from its sdist, checking that the source archive is complete.
      yield* Tool.run(tool, ["build", project, "--out-dir", out, "--no-create-gitignore"], { cwd: project });
      const directory = yield* Artifact.directory(out, producer);
      const names = directory.entries.filter((entry) => entry.kind === "file" && !entry.path.includes("/"));
      if (names.filter((entry) => entry.path.endsWith(".whl")).length !== 1 ||
        names.filter((entry) => entry.path.endsWith(".tar.gz")).length !== 1) {
        return yield* new InputInvalid({ reason: "uv output must contain exactly one wheel and one .tar.gz sdist" });
      }
      return directory;
    });
    const directory = yield* Commit.output(outdir, produce, input, "sibling");
    // Re-read at the committed paths so callers receive ordinary core file artifacts.
    const wheel = directory.entries.find((entry) => entry.kind === "file" && !entry.path.includes("/") && entry.path.endsWith(".whl"))!;
    const sdist = directory.entries.find((entry) => entry.kind === "file" && !entry.path.includes("/") && entry.path.endsWith(".tar.gz"))!;
    return {
      wheel: yield* Artifact.file(p.join(directory.path, wheel.path), producer),
      sdist: yield* Artifact.file(p.join(directory.path, sdist.path), producer),
    };
  }));

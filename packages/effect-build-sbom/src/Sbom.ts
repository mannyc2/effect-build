import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Tool } from "effect-build";

export class Sbom extends Context.Service<Sbom, { readonly tool: Tool.Resolved }>()("effect-build-sbom/Sbom") {}

export interface LayerOptions {
  readonly executable?: string;
  readonly version?: string | ((version: string) => boolean);
}
/** Syft 1.50.0 is exercised against real directories, lockfiles, and executables. */
export const tested = ">=1.50.0 <2.0.0";
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

export const layer = (options: LayerOptions = {}): Layer.Layer<
  Sbom,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> => Layer.effect(Sbom, Tool.resolve({
  name: "syft",
  ...(options.executable === undefined ? {} : { executable: options.executable }),
  parseVersion: (completion) => /^syft (\S+)/u.exec(new TextDecoder().decode(completion.stdout))?.[1],
}).pipe(Tool.requireVersion(options.version ?? tested), Effect.map((tool) => ({ tool }))));

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("SbomInputInvalid", {
  reason: Schema.String,
}) {}
export const Format = Schema.Literals(["spdx-json", "cyclonedx-json"] as const);
export type Format = typeof Format.Type;
const nativeFormat = { "spdx-json": "spdx-json@2.3", "cyclonedx-json": "cyclonedx-json@1.6" } as const;

export interface GenerateInput {
  readonly subject: Artifact.Artifact;
  readonly format: Format;
  readonly outfile: string;
  readonly cwd?: string;
  readonly atomic?: boolean;
}
export type GenerateError = InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });

export const generate = (input: GenerateInput): Effect.Effect<Artifact.File, GenerateError, Sbom | Env> =>
  Effect.gen(function*() {
    const format = yield* Schema.decodeUnknownEffect(Format)(input.format).pipe(
      Effect.mapError((error) => new InputInvalid({ reason: String(error) })),
    );
    if (input.outfile.length === 0 || input.outfile.includes("\0") || input.cwd?.includes("\0")) {
      return yield* new InputInvalid({ reason: "outfile must be non-empty and paths must not contain NUL" });
    }
    const { tool } = yield* Sbom;
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, input.outfile);
    // Syft's catalogers use source filenames; verify the artifact and scan its original path.
    const subject = yield* Artifact.verify(input.subject);
    const produce = (out: string) => Effect.gen(function*() {
      yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError(out)));
      yield* Tool.run(tool, [
        "scan", subject.path, "--from", subject.kind === "directory" ? "dir" : "file",
        "--output", `${nativeFormat[format]}=${out}`, "--quiet",
      ], { cwd });
      return yield* Artifact.file(out, Tool.producer(tool));
    });
    return yield* input.atomic === false ? produce(outfile) : Commit.atomic(outfile, produce);
  });

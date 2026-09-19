import { Context, Effect, FileSystem, Path, Schema } from "effect";
import { Artifact, Commit, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";

export class Sbom extends Context.Service<Sbom, Tool.Service>()("effect-build-sbom/Sbom") {}

export const { name, layer, supported, tested, constraints, requirements, resolved, testLayer } = Tool.provider(Sbom, {
  name: "syft",
  version: { parse: Tool.versionPattern(/^syft (\S+)/u), supported: ">=1.50.0 <2.0.0", tested: ["1.50.0"] },
  requirements: { env: ["HOME", "SYFT_CONFIG", "SYFT_CHECK_FOR_APP_UPDATE"], network: true, services: [],
    detail: "Syft configuration and catalogers may enable network access; filesystem scans need the source closure." },
});

type Env = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

export const Format = Schema.Literals(["spdx-json", "cyclonedx-json"] as const);
export type Format = typeof Format.Type;
const nativeFormat = { "spdx-json": "spdx-json@2.3", "cyclonedx-json": "cyclonedx-json@1.6" } as const;

export interface GenerateInput extends Commit.ProducerOptions, Tool.EnvironmentOptions {
  /** Release artifact associated with the inventory. */
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
    // Syft's catalogers use source filenames, so scan the provided artifact's path.
    const source = input.source ?? input.subject;
    const produce = (out: string) =>
      Tool.run(tool, [
        "scan",
        source.path,
        "--from",
        source.kind === "directory" ? "dir" : "file",
        "--output",
        `${nativeFormat[format]}=${out}`,
        "--quiet",
      ], { env: input.env, extendEnv: input.extendEnv, scrubEnv: input.scrubEnv, cwd }).pipe(Effect.andThen(Artifact.file(out, Tool.producedBy(tool))));
    return yield* Commit.output(outfile, produce, input);
  })
);

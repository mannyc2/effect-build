import { Effect, FileSystem, Path } from "effect";
import * as Artifact from "./Artifact.js";
import metadata from "../package.json" with { type: "json" };

const encoder = new TextEncoder();

/** Write basename entries compatible with `sha256sum -c`. */
export const write = (input: {
  readonly artifacts: readonly Artifact.Regular[];
  readonly outfile: string;
}): Effect.Effect<
  Artifact.File,
  Artifact.ArtifactError,
  FileSystem.FileSystem | Path.Path | import("effect").Crypto.Crypto
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const lines = [...input.artifacts]
      .sort((a, b) => p.basename(a.path).localeCompare(p.basename(b.path)))
      .map((a) => `${a.sha256}  ${p.basename(a.path)}\n`)
      .join("");
    const outfile = p.resolve(input.outfile);
    yield* fs.writeFile(outfile, encoder.encode(lines)).pipe(
      Effect.mapError((e) => new Artifact.ArtifactError({ path: outfile, reason: "unreadable", detail: String(e) })),
    );
    return yield* Artifact.file(outfile, { name: "effect-build", version: metadata.version });
  });

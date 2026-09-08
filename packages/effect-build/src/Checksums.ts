import { Crypto, Effect, FileSystem, Path } from "effect";
import * as Artifact from "./Artifact.js";
import metadata from "../package.json" with { type: "json" };

const encoder = new TextEncoder();

/** Paths are relative to the checksum file's directory, so the output tree can move. */
export const write = (input: {
  readonly artifacts: readonly Artifact.Regular[];
  readonly outfile: string;
}): Effect.Effect<Artifact.File, Artifact.ArtifactError, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const outfile = p.resolve(input.outfile);
    const lines = [...input.artifacts]
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      .map((a) => {
        const name = p.relative(p.dirname(outfile), a.path).split(p.sep).join("/");
        const escaped = name.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
        return `${escaped === name ? "" : "\\"}${a.sha256}  ${escaped}\n`;
      })
      .join("");
    yield* fs.writeFile(outfile, encoder.encode(lines)).pipe(
      Effect.mapError((e) => new Artifact.ArtifactError({ path: outfile, reason: "unreadable", detail: String(e) })),
    );
    return yield* Artifact.file(outfile, { name: "effect-build", version: metadata.version });
  });

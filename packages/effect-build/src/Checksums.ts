import { Crypto, Effect, FileSystem, Path } from "effect";
import * as Artifact from "./Artifact.js";
import metadata from "../package.json" with { type: "json" };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

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

/** A leading backslash marks a line whose name encodes backslashes and newlines. */
const unescape = (name: string): string | undefined => {
  let out = "";
  for (let index = 0; index < name.length; index++) {
    const char = name[index]!;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = name[++index];
    if (next === "\\") out += "\\";
    else if (next === "n") out += "\n";
    else return undefined;
  }
  return out;
};

/**
 * Check every listed file against its recorded digest. Lines take the text format
 * `write` produces (native `sha256sum` output matches); names resolve against the
 * checksum file's directory, and the checksum file is itself re-verified first.
 */
export const verify = (checksums: Artifact.File): Effect.Effect<void, Artifact.ArtifactError, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function*() {
    const p = yield* Path.Path;
    const invalid = (detail: string) => new Artifact.ArtifactError({ path: checksums.path, reason: "invalid-metadata", detail });
    const bytes = yield* Artifact.readVerified(checksums);
    const contents = yield* Effect.try({ try: () => decoder.decode(bytes), catch: () => invalid("checksum lines must be UTF-8") });
    if (contents.includes("\r")) return yield* invalid("checksum lines must not contain carriage returns");
    const lines = contents.split("\n");
    if (lines.pop() !== "") return yield* invalid("checksum lines must end with a newline");
    const directory = p.dirname(p.resolve(checksums.path));
    const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const match = /^(\\?)([a-f0-9]{64})  (.+)$/u.exec(line);
      const name = match === null ? undefined : match[1] === "\\" ? unescape(match[3]!) : match[3]!.includes("\\") ? undefined : match[3];
      if (match === null || name === undefined) return yield* invalid(`line ${index + 1} is not a checksum line`);
      const path = p.resolve(directory, name);
      if (seen.has(path)) return yield* invalid(`line ${index + 1} repeats ${path}`);
      seen.add(path);
      const current = yield* Artifact.file(path, checksums.producedBy);
      if (current.sha256 !== match[2]) {
        return yield* new Artifact.ArtifactError({ path, reason: "changed", detail: `sha256 ${current.sha256} does not match the recorded ${match[2]}` });
      }
    }
  });

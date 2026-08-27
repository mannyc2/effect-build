import type * as Artifact from "effect-build/Artifact";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const tool: Artifact.Tool = { name: "acceptance-snapshot", version: "1" };

/** Test-only adoption helper that records every regular file in one directory tree. */
export const finalizedBundle = async (directory: string): Promise<Artifact.Bundle> => {
  const outdir = resolve(directory);
  const entries: Artifact.BundleEntry[] = [];
  for (const entry of [...await readdir(outdir, { recursive: true })].sort()) {
    const path = join(outdir, entry);
    const information = await lstat(path);
    if (information.isDirectory()) {
      entries.push({ _tag: "Directory", path, mode: information.mode & 0o7777 });
    } else if (information.isSymbolicLink()) {
      entries.push({ _tag: "SymbolicLink", path, target: await readlink(path) });
    } else if (information.isFile()) {
      const contents = await readFile(path);
      entries.push({
        _tag: "File",
        path,
        bytes: contents.byteLength,
        mode: information.mode & 0o7777,
        sha256: createHash("sha256").update(contents).digest("hex"),
      });
    }
  }
  return { _tag: "Bundle", outdir, entries, tool };
};

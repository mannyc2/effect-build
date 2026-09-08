import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Tool } from "effect-build";
import metadata from "../package.json" with { type: "json" };
import { InputInvalid } from "./InputInvalid.js";
import { decodeGitTar, encodeTarGzip, encodeZip, type Entry } from "./internal/archive.js";
import { normalizeEntryPath, validateLayout } from "./internal/layout.js";

export { InputInvalid } from "./InputInvalid.js";
export type Format = "zip" | "tar.gz";
export interface ArchiveEntry {
  readonly artifact: Artifact.Artifact;
  /** A directory is expanded beneath this archive prefix. */
  readonly path: string;
  /** Regular files only; directory entries retain their recorded modes. */
  readonly executable?: boolean;
}
export interface ArchiveInput {
  readonly entries: readonly ArchiveEntry[];
  readonly outfile: string;
  readonly atomic?: boolean;
}
export interface SourceInput {
  readonly repository: string;
  /** A Git tree object ID, from `git rev-parse HEAD^{tree}`. */
  readonly tree: string;
  readonly project: string;
  readonly version: string;
  readonly format: Format;
  readonly outfile: string;
  readonly atomic?: boolean;
  readonly cwd?: string;
  readonly additionalExcludes?: readonly string[];
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
export type ArchiveError = InputInvalid | Artifact.ArtifactError | Commit.CommitError;
export type SourceError = ArchiveError | Tool.Failed | Tool.SpawnFailed;
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });

const writeArchive = (
  outfile: string,
  entries: readonly Entry[],
  format: Format,
  atomic: boolean,
  producer: Artifact.Producer,
): Effect.Effect<Artifact.File, ArchiveError, Fs> => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const validated = validateLayout(entries);
  if (validated instanceof InputInvalid) return yield* validated;
  const encoded = yield* Effect.try({
    try: () => format === "zip" ? encodeZip(validated) : encodeTarGzip(validated),
    catch: (error) => new InputInvalid({ reason: `encode ${format}: ${String(error)}` }),
  });
  const produce = (out: string) => Effect.gen(function*() {
    yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError(out)));
    yield* fs.writeFile(out, encoded).pipe(Effect.mapError(fileError(out)));
    return yield* Artifact.file(out, producer);
  });
  return yield* atomic ? Commit.atomic(outfile, produce) : produce(p.resolve(outfile));
});

const archive = (format: Format, input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  Effect.gen(function*() {
    const p = yield* Path.Path;
    const entries: Entry[] = [];
    const empty = new Uint8Array(0);
    for (const entry of input.entries) {
      const artifact = entry.artifact;
      const path = normalizeEntryPath(entry.path, artifact.kind === "directory" ? "directory" : "file");
      if (typeof path !== "string") return yield* path;
      if (artifact.kind !== "directory") {
        entries.push({
          path, kind: "file",
          mode: (entry.executable ?? artifact.kind === "executable") ? 0o755 : 0o644,
          contents: yield* Artifact.readVerified(artifact),
        });
        continue;
      }
      if (entry.executable !== undefined) {
        return yield* new InputInvalid({ path, reason: "executable overrides apply only to regular files" });
      }
      // Rebuild the manifest from disk: decoded records can contain entries inconsistent with their digest.
      const tree = yield* Artifact.directory(artifact.path, artifact.producedBy);
      if (tree.sha256 !== artifact.sha256 || tree.bytes !== artifact.bytes) {
        return yield* new Artifact.ArtifactError({ path: tree.path, reason: "changed" });
      }
      // The artifact records descendant modes, so give the newly introduced archive root a fixed mode.
      entries.push({ path, kind: "directory", mode: 0o755, contents: empty });
      for (const child of tree.entries) {
        const childPath = normalizeEntryPath(`${path}/${child.path}`, child.kind);
        if (typeof childPath !== "string") return yield* childPath;
        // Verify the bytes actually encoded even if a file changes after the tree was read.
        const contents = child.kind === "file" ? yield* Artifact.readVerified({
          kind: "file", path: p.join(tree.path, child.path), bytes: child.bytes,
          sha256: child.sha256!, producedBy: tree.producedBy,
        }) : empty;
        entries.push({ ...child, path: childPath, contents });
      }
    }
    return yield* writeArchive(input.outfile, entries, format, input.atomic ?? true, {
      name: metadata.name,
      version: metadata.version,
    });
  });

export const zip = (input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> => archive("zip", input);
export const tarGz = (input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> => archive("tar.gz", input);

export class Archive extends Context.Service<Archive, { readonly tool: Tool.Resolved }>()("effect-build-archives/Archive") {}
export interface LayerOptions {
  readonly executable?: string;
  readonly version?: string | ((version: string) => boolean);
}
/** Git 2.40+ supplies the exact tree, export-ignore, and PAX behavior exercised by the source tests. */
export const tested = ">=2.40.0 <3.0.0";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Archive,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Fs | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Archive, Tool.resolve({
  name: "git",
  ...(options.executable === undefined ? {} : { executable: options.executable }),
  parseVersion: (completion) => /^git version\s+(\d+\.\d+\.\d+)(?:\.windows\.\d+)?(?:\s|$)/u
    .exec(new TextDecoder().decode(completion.stdout))?.[1],
}).pipe(Tool.requireVersion(options.version ?? tested), Effect.map((tool) => ({ tool }))));

const builtOutputs = ["dist", "build", "out", "target", ".output", ".next"] as const;
const decoder = new TextDecoder("utf-8", { fatal: true });
const gitlinksFrom = (listing: Uint8Array): readonly string[] => {
  const gitlinks: string[] = [];
  let offset = 0;
  while (offset < listing.byteLength) {
    const nul = listing.indexOf(0, offset);
    if (nul === -1) throw new RangeError("git ls-tree output lacks a terminal NUL record separator");
    const record = listing.subarray(offset, nul);
    const tab = record.indexOf(0x09);
    if (tab <= 0) throw new RangeError("git ls-tree record lacks a metadata/path separator");
    const metadata = decoder.decode(record.subarray(0, tab));
    const path = decoder.decode(record.subarray(tab + 1));
    if (path.length === 0) throw new RangeError("git ls-tree record has an empty path");
    if (/^160000\s+commit\s+[0-9a-f]+$/.test(metadata)) gitlinks.push(path);
    offset = nul + 1;
  }
  return gitlinks;
};

export const source = (input: SourceInput): Effect.Effect<
  Artifact.File,
  SourceError,
  Archive | Fs | ChildProcessSpawner.ChildProcessSpawner
> => Effect.scoped(Effect.gen(function*() {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.tree)) {
    return yield* new InputInvalid({ reason: "tree must be a Git tree object ID" });
  }
  if (![input.project, input.version].every((part) => /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(part))) {
    return yield* new InputInvalid({ reason: "project and version must be portable root components" });
  }
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const { tool } = yield* Archive;
  const repository = p.resolve(input.cwd ?? "", input.repository);
  const outfile = p.resolve(input.cwd ?? "", input.outfile);
  const root = `${input.project}-${input.version}`;
  const excludes = new Set<string>(builtOutputs);
  for (const candidate of input.additionalExcludes ?? []) {
    const normalized = normalizeEntryPath(candidate, "file");
    if (typeof normalized !== "string") return yield* normalized;
    excludes.add(normalized);
  }
  const type = yield* Tool.run(tool, ["cat-file", "-t", input.tree], { cwd: repository });
  if (decoder.decode(type.stdout).trim() !== "tree") {
    return yield* new InputInvalid({ reason: "source requires a tree object, not a commit or blob" });
  }
  // The listing is archive input, so retaining only a diagnostic prefix could lose gitlinks.
  const listing = yield* Tool.run(tool, ["ls-tree", "-rz", "--full-tree", input.tree], {
    cwd: repository,
    outputLimit: Number.POSITIVE_INFINITY,
  });
  const gitlinks = yield* Effect.try({
    try: () => gitlinksFrom(listing.stdout),
    catch: (error) => new InputInvalid({ reason: `decode git ls-tree: ${String(error)}` }),
  });
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-git-" }).pipe(Effect.mapError(fileError(outfile)));
  const exported = p.join(temporary, "tree.tar");
  // Archive applies checkout conversion too; host preferences must not change bytes, but tracked attributes still apply.
  yield* Tool.run(tool, ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--format=tar", `--prefix=${root}/`, `--output=${exported}`, input.tree], { cwd: repository });
  const tar = yield* fs.readFile(exported).pipe(Effect.mapError(fileError(exported)));
  const projected = yield* Effect.try({
    try: () => decodeGitTar(tar),
    catch: (error) => new InputInvalid({ reason: `decode Git archive: ${String(error)}` }),
  });
  const entries: Entry[] = [];
  for (const entry of projected) {
    const relative = entry.path === root ? "" : entry.path.startsWith(`${root}/`) ? entry.path.slice(root.length + 1) : undefined;
    if (relative === undefined) return yield* new InputInvalid({ path: entry.path, reason: "Git archive escaped its root" });
    if (relative === "") {
      if (entry.kind !== "directory") return yield* new InputInvalid({ reason: "project root is not a directory" });
    } else if (relative.split("/").includes(".git")
      || [...excludes, ...gitlinks].some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))) continue;
    entries.push(entry);
  }
  return yield* writeArchive(outfile, entries, input.format, input.atomic ?? true, Tool.producer(tool));
}));

import { Context, Crypto, Effect, FileSystem, Layer, Path, Stream } from "effect";
import { Artifact, Commit, Layout as PortableLayout, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";
import metadata from "../package.json" with { type: "json" };
import { EntrySizeMismatch } from "./EntrySizeMismatch.js";
import { FormatLimit } from "./FormatLimit.js";
import { InputInvalid } from "./InputInvalid.js";
import { chunkSize, encodeTarGzip, encodeZip, type Entry, tarLimit, zipLimit } from "./internal/archive.js";
import { readGitTar } from "./internal/gitTar.js";
import { TarInvalid } from "./TarInvalid.js";

export { EntrySizeMismatch } from "./EntrySizeMismatch.js";
export { FormatLimit } from "./FormatLimit.js";
export { InputInvalid } from "./InputInvalid.js";
export { TarInvalid } from "./TarInvalid.js";
export type Format = "zip" | "tar.gz";
export interface ArchiveEntry {
  readonly artifact: Artifact.Artifact;
  /** A directory is expanded beneath this archive prefix. */
  readonly path: string;
  /** Regular files only; directory entries retain their recorded modes. */
  readonly executable?: boolean | undefined;
}
export interface ArchiveInput extends Commit.ProducerOptions {
  readonly entries: readonly ArchiveEntry[];
  readonly outfile: string;
}
export interface SourceInput extends Commit.ProducerOptions {
  readonly repository: string;
  /** A Git tree object ID, from `git rev-parse HEAD^{tree}`. */
  readonly tree: string;
  readonly project: string;
  readonly version: string;
  readonly format: Format;
  readonly outfile: string;
  readonly cwd?: string | undefined;
  /** Repository-relative paths to leave out, with their descendants. Gitlinks and `.git` components are always left out. */
  readonly excludes?: readonly string[] | undefined;
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
/** Entries carry verified artifact streams, so their failures are artifact failures. */
type ArchiveEntries = ReadonlyArray<Entry<Artifact.ArtifactError, Fs>>;
export type ArchiveError = InputInvalid | FormatLimit | EntrySizeMismatch | Artifact.ArtifactError | Commit.CommitError;
export type SourceError = ArchiveError | TarInvalid | Tool.Failed | Tool.SpawnFailed;

const writeArchive = (
  outfile: string,
  entries: ArchiveEntries,
  format: Format,
  options: Commit.ProducerOptions,
  producer: Artifact.Producer,
): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const issue = PortableLayout.validate(entries);
    if (issue !== undefined) return yield* new InputInvalid(issue);
    // Fixed-width fields are checked before anything is staged; sizes learned while compressing are checked as they appear.
    const limit = format === "zip" ? zipLimit(entries) : tarLimit(entries);
    if (limit !== undefined) return yield* limit;
    const produce = (out: string) =>
      Effect.gen(function*() {
        yield* Effect.scoped(Effect.gen(function*() {
          const file = yield* fs.open(out, { flag: "w" }).pipe(Effect.mapError(Artifact.ioError(out, "write")));
          const encoded = format === "zip" ? encodeZip(entries) : encodeTarGzip(entries);
          yield* Stream.runForEach(
            encoded,
            (chunk) => file.writeAll(chunk).pipe(Effect.mapError(Artifact.ioError(out, "write"))),
          );
        }));
        return yield* Artifact.file(out, producer);
      });
    return yield* Commit.output(outfile, produce, options);
  });

const archive = (format: Format, input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  Effect.gen(function*() {
    const p = yield* Path.Path;
    const entries: Entry<Artifact.ArtifactError, Fs>[] = [];
    for (const entry of input.entries) {
      const artifact = entry.artifact;
      // Archive directory prefixes accept one trailing separator; shipping paths are normalized thereafter.
      const path = artifact.kind === "directory" ? entry.path.replace(/\/$/u, "") : entry.path;
      const reason = PortableLayout.pathIssue(path);
      if (reason !== undefined) return yield* new InputInvalid({ path: entry.path, reason });
      if (artifact.kind !== "directory") {
        entries.push({
          kind: "file",
          path,
          mode: (entry.executable ?? artifact.kind === "executable") ? 0o755 : 0o644,
          bytes: artifact.bytes,
          contents: Artifact.streamVerified(artifact),
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
      // The archive root is the archive's own object, named by the caller rather than
      // taken from the tree, so it gets a fixed portable mode instead of the recorded rootMode.
      entries.push({ kind: "directory", path, mode: 0o755 });
      for (const child of tree.entries) {
        const childPath = `${path}/${child.path}`;
        if (child.kind === "file") {
          // Each file is verified as it streams, even if it changes after the tree was read.
          const contents = Artifact.streamVerified({
            kind: "file",
            path: p.join(tree.path, child.path),
            bytes: child.bytes,
            sha256: child.sha256,
            producedBy: tree.producedBy,
          });
          entries.push({ kind: "file", path: childPath, mode: child.mode, bytes: child.bytes, contents });
        } else if (child.kind === "symlink") {
          entries.push({ kind: "symlink", path: childPath, mode: child.mode, target: child.linkTarget });
        } else {
          entries.push({ kind: "directory", path: childPath, mode: child.mode });
        }
      }
    }
    return yield* writeArchive(input.outfile, entries, format, input, {
      name: metadata.name,
      version: metadata.version,
    });
  });

export const zip = Effect.fn("Archive.zip")((input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  archive("zip", input)
);
export const tarGz = Effect.fn("Archive.tarGz")((input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  archive("tar.gz", input)
);

export class Archive
  extends Context.Service<Archive, { readonly tool: Tool.Resolved }>()("effect-build-archives/Archive")
{}
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
/** Git 2.40+ supplies the exact tree, export-ignore, and PAX behavior the source archives rely on. */
export const supported = ">=2.40.0 <3.0.0";
/** Exact versions exercised by real-tool CI. */
export const tested = "2.40.0 || 2.55.0";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Archive,
  Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Fs | ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    Archive,
    Tool.resolve({
      name: "git",
      executable: options.executable,
      parseVersion: (completion) =>
        /^git version\s+(\d+\.\d+\.\d+)(?:\.windows\.\d+)?(?:\s|$)/u
          .exec(new TextDecoder().decode(completion.stdout))?.[1],
    }).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))),
  );

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

export const source = Effect.fn("Archive.source")((input: SourceInput): Effect.Effect<
  Artifact.File,
  SourceError,
  Archive | Fs | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(Effect.gen(function*() {
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
    const excludes = new Set<string>();
    for (const candidate of input.excludes ?? []) {
      const reason = PortableLayout.pathIssue(candidate);
      if (reason !== undefined) return yield* new InputInvalid({ path: candidate, reason });
      excludes.add(candidate);
    }
    const type = yield* Tool.run(tool, ["cat-file", "-t", input.tree], { cwd: repository });
    if (decoder.decode(type.stdout).trim() !== "tree") {
      return yield* new InputInvalid({ reason: "source requires a tree object, not a commit or blob" });
    }
    // The listing is archive input rather than a diagnostic, so it is retained in full.
    const listing = yield* Tool.run(tool, ["ls-tree", "-rz", "--full-tree", input.tree], {
      cwd: repository,
      stdoutLimit: null,
    });
    const gitlinks = yield* Effect.try({
      try: () => gitlinksFrom(listing.stdout),
      catch: (error) => new InputInvalid({ reason: `decode git ls-tree: ${String(error)}` }),
    });
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-git-" }).pipe(
      Effect.mapError(Artifact.ioError(outfile, "write")),
    );
    const exported = p.join(temporary, "tree.tar");
    // Archive applies checkout conversion too; host preferences must not change bytes, but tracked attributes still apply.
    yield* Tool.run(tool, [
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.eol=lf",
      "archive",
      "--format=tar",
      `--prefix=${root}/`,
      `--output=${exported}`,
      input.tree,
    ], { cwd: repository });
    // Only headers are read here; each file's bytes stream out of the exported tar when the encoder reaches it.
    const projected = yield* readGitTar(exported);
    const entries: Entry<Artifact.ArtifactError, Fs>[] = [];
    for (const entry of projected) {
      const relative = entry.path === root
        ? ""
        : entry.path.startsWith(`${root}/`)
        ? entry.path.slice(root.length + 1)
        : undefined;
      if (relative === undefined) {
        return yield* new InputInvalid({ path: entry.path, reason: "Git archive escaped its root" });
      }
      if (relative === "") {
        if (entry.kind !== "directory") {
          return yield* new InputInvalid({ reason: "project root is not a directory" });
        }
      } else if (
        relative.split("/").includes(".git")
        || [...excludes, ...gitlinks].some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))
      ) continue;
      if (entry.kind !== "file") {
        entries.push(entry);
        continue;
      }
      const contents = entry.bytes > 0
        ? fs.stream(exported, { offset: entry.offset, bytesToRead: entry.bytes, chunkSize }).pipe(
          Stream.mapError(Artifact.ioError(exported)),
        )
        : Stream.empty;
      entries.push({ kind: "file", path: entry.path, mode: entry.mode, bytes: entry.bytes, contents });
    }
    return yield* writeArchive(outfile, entries, input.format, input, Tool.producer(tool));
  }))
);

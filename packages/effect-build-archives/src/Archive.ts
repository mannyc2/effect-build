import { Context, Effect, FileSystem, Path, Stream } from "effect";
import { Artifact, Commit, Layout as PortableLayout, Tool } from "effect-build";
import { ChildProcessSpawner } from "effect/unstable/process";
import metadata from "../package.json" with { type: "json" };
import { EntrySizeMismatch } from "./EntrySizeMismatch.js";
import { FormatLimit } from "./FormatLimit.js";
import { chunkSize, encodeTarGzip, encodeZip, type Entry, tarLimit, zipLimit } from "./internal/archive.js";
import { gitlinksFrom, readGitTar } from "./internal/gitTar.js";
import { TarInvalid } from "./TarInvalid.js";

export { EntrySizeMismatch } from "./EntrySizeMismatch.js";
export { FormatLimit } from "./FormatLimit.js";
export { TarInvalid } from "./TarInvalid.js";
export type Format = "zip" | "tar.gz";
export interface ArchiveEntry {
  readonly artifact: Artifact.Artifact;
  /** A directory is expanded beneath this archive prefix. */
  readonly path: string;
  /** Regular files only; directory entries retain their recorded modes. */
  readonly executable?: boolean | undefined;
}
export type ArchiveInput =
  & Commit.ProducerOptions
  & {
    readonly outfile: string;
  }
  & ({
    readonly entries: readonly ArchiveEntry[];
    readonly directory?: undefined;
  } | {
    /** Archive the directory's contents at the root, without a wrapper directory. */
    readonly directory: Artifact.Directory;
    readonly entries?: undefined;
  });
export interface SourceInput extends Commit.ProducerOptions, Tool.EnvironmentOptions {
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
type Fs = FileSystem.FileSystem | Path.Path;
/** File contents stream directly from their artifact paths. */
type ArchiveEntries = ReadonlyArray<Entry<Artifact.ArtifactError, Fs>>;
export type ArchiveError =
  | Tool.InputInvalid
  | FormatLimit
  | EntrySizeMismatch
  | Artifact.ArtifactError
  | Commit.CommitError;
export type SourceError = ArchiveError | TarInvalid | Tool.Failed | Tool.SpawnFailed;

export class Archive
  extends Context.Service<Archive, Tool.Service>()("effect-build-archives/Archive")
{}
export const { name, layer, supported, tested, constraints, requirements, resolved, testLayer } = Tool.provider(Archive, {
  name: "git",
  version: { parse: Tool.versionPattern(/^git version\s+(\d+\.\d+\.\d+)(?:\.windows\.\d+)?(?:\s|$)/u), supported: ">=2.40.0 <3.0.0", tested: ["2.40.0", "2.55.0"] },
  requirements: { env: ["HOME", "XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"], network: false, services: [],
    detail: "Source archives read local Git objects and attributes; filters and repository configuration are additional inputs." },
});

const writeArchive = (
  operation: string,
  outfile: string,
  entries: ArchiveEntries,
  format: Format,
  options: Commit.ProducerOptions,
  producer: Artifact.Producer,
): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const issue = PortableLayout.validate(entries);
    if (issue !== undefined) return yield* new Tool.InputInvalid({ operation, ...issue });
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

const directoryEntries = (tree: Artifact.Directory, p: Path.Path, prefix?: string): ArchiveEntries =>
  tree.entries.map((child): Entry<Artifact.ArtifactError, Fs> => {
    const path = prefix === undefined ? child.path : `${prefix}/${child.path}`;
    if (child.kind === "file") {
      const contents = Artifact.stream({
        kind: "file",
        path: p.join(tree.path, child.path),
        bytes: child.bytes,
        producedBy: tree.producedBy,
      });
      return { kind: "file", path, mode: child.mode, bytes: child.bytes, contents };
    }
    return child.kind === "symlink"
      ? { kind: "symlink", path, mode: child.mode, target: child.linkTarget }
      : { kind: "directory", path, mode: child.mode };
  });

const archive = (
  operation: string,
  format: Format,
  input: ArchiveInput,
): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  Effect.gen(function*() {
    const issue = Tool.argumentIssue(input.outfile);
    if (issue !== undefined) return yield* new Tool.InputInvalid({ operation, reason: `outfile ${issue}` });
    const p = yield* Path.Path;
    const entries: Entry<Artifact.ArtifactError, Fs>[] = [];
    if ((input.entries === undefined) === (input.directory === undefined)) {
      return yield* new Tool.InputInvalid({ operation, reason: "provide either entries or directory" });
    }
    if (input.directory !== undefined) {
      if (input.directory.kind !== "directory") {
        return yield* new Tool.InputInvalid({ operation, reason: "directory must be a directory artifact" });
      }
      for (const entry of directoryEntries(input.directory, p)) entries.push(entry);
    }
    for (const entry of input.entries ?? []) {
      const artifact = entry.artifact;
      // Archive directory prefixes accept one trailing separator; shipping paths are normalized thereafter.
      const path = artifact.kind === "directory" ? entry.path.replace(/\/$/u, "") : entry.path;
      const reason = PortableLayout.pathIssue(path);
      if (reason !== undefined) return yield* new Tool.InputInvalid({ operation, path: entry.path, reason });
      if (artifact.kind !== "directory") {
        entries.push({
          kind: "file",
          path,
          mode: (entry.executable ?? artifact.kind === "executable") ? 0o755 : 0o644,
          bytes: artifact.bytes,
          contents: Artifact.stream(artifact),
        });
        continue;
      }
      if (entry.executable !== undefined) {
        return yield* new Tool.InputInvalid({
          operation,
          path,
          reason: "executable overrides apply only to regular files",
        });
      }
      // The archive root is the archive's own object, named by the caller rather than
      // taken from the tree, so it gets a fixed portable mode instead of the recorded rootMode.
      entries.push({ kind: "directory", path, mode: 0o755 });
      for (const entry of directoryEntries(artifact, p, path)) entries.push(entry);
    }
    return yield* writeArchive(operation, input.outfile, entries, format, input, {
      name: metadata.name,
      version: metadata.version,
    });
  });

export const zip = Effect.fn("Archive.zip")((input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  archive("Archive.zip", "zip", input)
);
export const tarGz = Effect.fn("Archive.tarGz")((input: ArchiveInput): Effect.Effect<Artifact.File, ArchiveError, Fs> =>
  archive("Archive.tarGz", "tar.gz", input)
);

const decoder = new TextDecoder("utf-8", { fatal: true });
const invalid = (reason: string) => new Tool.InputInvalid({ operation: "Archive.source", reason });

export const source = Effect.fn("Archive.source")((input: SourceInput): Effect.Effect<
  Artifact.File,
  SourceError,
  Archive | Fs | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(Effect.gen(function*() {
    for (const [field, value] of [["outfile", input.outfile], ["repository", input.repository]] as const) {
      const issue = Tool.argumentIssue(value);
      if (issue !== undefined) return yield* invalid(`${field} ${issue}`);
    }
    if (input.cwd?.includes("\0")) return yield* invalid("cwd must contain no NUL");
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.tree)) {
      return yield* invalid("tree must be a Git tree object ID");
    }
    if (![input.project, input.version].every((part) => /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(part))) {
      return yield* invalid("project and version must be portable root components");
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
      if (reason !== undefined) {
        return yield* new Tool.InputInvalid({ operation: "Archive.source", path: candidate, reason });
      }
      excludes.add(candidate);
    }
    const type = yield* Tool.run(tool, ["cat-file", "-t", input.tree], { env: input.env, extendEnv: input.extendEnv, scrubEnv: input.scrubEnv, cwd: repository });
    if (decoder.decode(type.stdout).trim() !== "tree") {
      return yield* invalid("source requires a tree object, not a commit or blob");
    }
    // The listing is archive input rather than a diagnostic, so it is retained in full.
    const listing = yield* Tool.run(tool, ["ls-tree", "-rz", "--full-tree", input.tree], {
      env: input.env, extendEnv: input.extendEnv, scrubEnv: input.scrubEnv, cwd: repository,
      stdoutLimit: null,
    });
    const gitlinks = yield* Effect.try({
      try: () => gitlinksFrom(listing.stdout),
      catch: (error) => invalid(`decode git ls-tree: ${String(error)}`),
    });
    for (const gitlink of gitlinks) excludes.add(gitlink);
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
    ], { env: input.env, extendEnv: input.extendEnv, scrubEnv: input.scrubEnv, cwd: repository });
    // Only headers are read here; each file's bytes stream out of the exported tar when the encoder reaches it.
    const projected = yield* readGitTar(exported);
    const entries: Entry<Artifact.ArtifactError, Fs>[] = [];
    for (const entry of projected) {
      if (entry.path === root) {
        if (entry.kind !== "directory") return yield* invalid("project root is not a directory");
        entries.push(entry);
        continue;
      }
      if (!entry.path.startsWith(`${root}/`)) {
        return yield* new Tool.InputInvalid({
          operation: "Archive.source",
          path: entry.path,
          reason: "Git archive escaped its root",
        });
      }
      const relative = entry.path.slice(root.length + 1);
      const excluded = relative.split("/").includes(".git")
        || [...excludes].some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
      if (excluded) continue;
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
    return yield* writeArchive("Archive.source", outfile, entries, input.format, input, Tool.producedBy(tool));
  }))
);

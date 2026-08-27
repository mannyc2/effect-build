import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { PublishFailed, ToolFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import { SourceArchiveFailed, type UnsafeArchiveLayout } from "./ArchiveError.js";
import { decodeGitTar, encodeTarGzip, encodeZip, type Entry } from "./internal/archive.js";
import { normalizeEntryPath, validateLayout } from "./internal/layout.js";
import { SourceArchiveInput } from "./Model.js";

export { Format, SourceArchiveInput } from "./Model.js";
export type { Format as FormatType } from "./Model.js";

export interface LayerOptions {
  /** Explicit Git executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type SourceArchiveError = ToolFailed | PublishFailed | UnsafeArchiveLayout | SourceArchiveFailed;

interface Service {
  readonly sourceArchive: (
    input: SourceArchiveInput,
  ) => Effect.Effect<Artifact.FileArtifact, SourceArchiveError>;
}

export class SourceArchiver extends Context.Service<SourceArchiver, Service>()(
  "effect-build-archives/SourceArchive/SourceArchiver",
) {}

const tested: Toolchain.TestedRange = { minimum: "2.40.0", before: "3.0.0" };

const builtOutputs = ["dist", "build", "out", "target", ".output", ".next"] as const;

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

const gitlinksFrom = (listing: Uint8Array): readonly string[] => {
  const gitlinks: string[] = [];
  let offset = 0;
  while (offset < listing.byteLength) {
    const nul = listing.indexOf(0, offset);
    if (nul === -1) throw new RangeError("git ls-tree output lacks a terminal NUL record separator");
    const record = listing.subarray(offset, nul);
    const tab = record.indexOf(0x09);
    if (tab <= 0) throw new RangeError("git ls-tree record lacks a metadata/path separator");
    const metadata = strictUtf8.decode(record.subarray(0, tab));
    const path = strictUtf8.decode(record.subarray(tab + 1));
    if (path.length === 0) throw new RangeError("git ls-tree record has an empty path");
    if (/^160000\s+commit\s+[0-9a-f]+$/.test(metadata)) gitlinks.push(path);
    offset = nul + 1;
  }
  return gitlinks;
};

type LayerError = ToolNotFound | ToolFailed;

const makeService = (
  options?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const executable = yield* Toolchain.resolveExecutable({ name: "git", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({
      tool: "git",
      executable,
      args: ["--version"],
      parse: (stdout) => /^git version\s+(\S+)/.exec(stdout.trim())?.[1],
    });
    yield* Toolchain.warnIfUntested({ tool: "git", version, tested });
    const tool: Artifact.Tool = { name: "git", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const sourceArchive = Effect.fn("effect-build-archives.sourceArchive")(function*(candidate: SourceArchiveInput) {
      const input = yield* Schema.decodeUnknownEffect(SourceArchiveInput, { onExcessProperty: "error" })(candidate)
        .pipe(
          Effect.mapError((error) =>
            new SourceArchiveFailed({
              repository: typeof candidate?.repository === "string" ? candidate.repository : "<invalid>",
              tree: typeof candidate?.tree === "string" ? candidate.tree : "<invalid>",
              reason: `decode input: ${String(error)}`,
            })
          ),
        );
      const repository = path.normalize(path.resolve(input.cwd ?? "", input.repository));
      const failWith = (reason: string) => new SourceArchiveFailed({ repository, tree: input.tree, reason });
      const extension = input.format === "zip" ? ".zip" : ".tar.gz";
      if (!input.outfile.endsWith(extension)) {
        return yield* Effect.fail(failWith(`${input.format} output must end with ${extension}`));
      }
      const root = `${input.project}-${input.version}`;
      const excludes = new Set<string>(builtOutputs);
      for (const candidate of input.additionalExcludes ?? []) {
        const normalized = normalizeEntryPath(candidate, "file");
        if (typeof normalized !== "string") return yield* Effect.fail(normalized);
        excludes.add(normalized);
      }
      const type = yield* Toolchain.runOrFail({
        tool: "git",
        executable,
        args: ["cat-file", "-t", input.tree],
        cwd: repository,
      }).pipe(Effect.provide(services));
      if (type.stdout.text.trim() !== "tree") {
        return yield* Effect.fail(failWith(`object is ${JSON.stringify(type.stdout.text.trim())}, not a tree`));
      }
      const listing = yield* Toolchain.runBytesOrFail({
        tool: "git",
        executable,
        args: ["ls-tree", "-rz", "--full-tree", input.tree],
        cwd: repository,
      }).pipe(Effect.provide(services));
      const gitlinks = yield* Effect.try({
        try: () => new Set(gitlinksFrom(listing.stdout)),
        catch: (error) => failWith(`decode git ls-tree: ${describe(error)}`),
      });

      return yield* Toolchain.publishFile({
        tool,
        outfile: input.outfile,
        cwd: input.cwd,
        produce: (stagedPath) =>
          Effect.gen(function*() {
            const exported = path.join(path.dirname(stagedPath), ".effect-build-git-tree.tar");
            yield* Toolchain.runOrFail({
              tool: "git",
              executable,
              args: ["archive", "--format=tar", `--prefix=${root}/`, `--output=${exported}`, input.tree],
              cwd: repository,
            });
            const tar = yield* fileSystem.readFile(exported).pipe(
              Effect.mapError((error) => failWith(`read Git archive: ${describe(error)}`)),
            );
            const projected = yield* Effect.try({
              try: () => decodeGitTar(tar),
              catch: (error) => failWith(`decode Git archive: ${describe(error)}`),
            });
            const entries: Entry[] = [];
            for (const entry of projected) {
              const relative = entry.path === root
                ? ""
                : entry.path.startsWith(`${root}/`)
                ? entry.path.slice(root.length + 1)
                : undefined;
              if (relative === undefined) {
                return yield* Effect.fail(failWith(`Git archive escaped root at ${entry.path}`));
              }
              if (relative === "") {
                if (entry.kind !== "directory") return yield* Effect.fail(failWith("project root is not a directory"));
                entries.push(entry);
                continue;
              }
              const segments = relative.split("/");
              if (segments.includes(".git")) continue;
              if (
                [...excludes].some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))
              ) continue;
              if ([...gitlinks].some((gitlink) => relative === gitlink || relative.startsWith(`${gitlink}/`))) continue;
              entries.push(entry);
            }
            const validated = validateLayout(entries);
            if (validated._tag === "Invalid") return yield* Effect.fail(validated.error);
            const encoded = yield* Effect.try({
              try: () => input.format === "zip" ? encodeZip(validated.entries) : encodeTarGzip(validated.entries),
              catch: (error) => failWith(`encode ${input.format}: ${describe(error)}`),
            });
            yield* fileSystem.writeFile(stagedPath, encoded).pipe(
              Effect.mapError((error) => failWith(`write staged archive: ${describe(error)}`)),
            );
          }),
      }).pipe(Effect.provide(services));
    });

    return { sourceArchive };
  });

export const sourceArchive = (
  input: SourceArchiveInput,
): Effect.Effect<Artifact.FileArtifact, SourceArchiveError, SourceArchiver> =>
  SourceArchiver.use((service) => service.sourceArchive(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  SourceArchiver,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(SourceArchiver, makeService(options));

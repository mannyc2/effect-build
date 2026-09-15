import { Effect, FileSystem, Path, Schema, Sink, Stream } from "effect";
import * as Artifact from "./Artifact.js";
import * as Commit from "./Commit.js";
import * as Layout from "./Layout.js";
import * as Tool from "./Tool.js";
import metadata from "../package.json" with { type: "json" };

/** Omit a directory's path to merge its contents at the output root. */
export type Entry =
  | { readonly artifact: Artifact.Artifact; readonly path: string }
  | { readonly artifact: Artifact.Directory; readonly path?: undefined };

export interface AssembleInput extends Commit.ProducerOptions {
  readonly entries: readonly Entry[];
  readonly outdir: string;
}

export type AssembleError = Tool.InputInvalid | Artifact.ArtifactError | Commit.CommitError;
type Fs = FileSystem.FileSystem | Path.Path;
type DirectoryNode = { readonly kind: "directory"; readonly path: string; readonly mode: number };
type Node = DirectoryNode
  | { readonly kind: "file"; readonly path: string; readonly mode: number; readonly artifact: Artifact.Regular }
  | { readonly kind: "symlink"; readonly path: string; readonly linkTarget: string };

const invalid = (reason: string, path?: string) => new Tool.InputInvalid({ operation: "Directory.assemble", reason, ...(path === undefined ? {} : { path }) });

/** Assemble declared inputs into one tree, preserving directory members' modes and symlinks.
 * Exact shared directories merge when their modes agree; every other collision fails before output changes. */
export const assemble = Effect.fn("Directory.assemble")(function*(input: AssembleInput): Effect.fn.Return<Artifact.Directory, AssembleError, Fs> {
  const issue = Tool.argumentIssue(input.outdir);
  if (issue !== undefined) return yield* invalid(`outdir ${issue}`);
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const outdir = p.resolve(input.outdir);
  const directDestination = input.atomic === false ? yield* fs.realPath(outdir).pipe(Effect.catch((error) => error.reason._tag === "NotFound"
    ? Effect.succeed(undefined) : Effect.fail(Artifact.ioError(outdir)(error)))) : undefined;
  const contains = (directory: string, path: string) => directory === path
    || path.startsWith(directory.endsWith(p.sep) ? directory : `${directory}${p.sep}`);
  const nodes: Node[] = [];
  for (const entry of input.entries) {
    const artifact = yield* Schema.decodeUnknownEffect(Artifact.Artifact)(entry.artifact).pipe(Effect.mapError((error) =>
      new Artifact.ArtifactError({ path: entry.artifact.path, reason: "invalid-metadata", detail: String(error) })));
    // Direct sibling output removes the old tree before production. It must not delete any part of an input.
    const source = p.resolve(artifact.path);
    if (directDestination !== undefined) {
      const actualSource = yield* fs.realPath(source).pipe(Effect.mapError(Artifact.ioError(source)));
      if (contains(directDestination, actualSource) || (artifact.kind === "directory" && contains(actualSource, directDestination))) {
        return yield* invalid("direct output must not overlap an input", artifact.path);
      }
    }
    if (artifact.kind !== "directory") {
      if (entry.path === undefined) return yield* invalid("regular files require a shipping path", artifact.path);
      nodes.push({ kind: "file", path: entry.path, mode: artifact.kind === "executable" ? 0o755 : 0o644, artifact });
      continue;
    }
    if (entry.path !== undefined) nodes.push({ kind: "directory", path: entry.path, mode: artifact.rootMode });
    for (const member of artifact.entries) {
      const path = entry.path === undefined ? member.path : `${entry.path}/${member.path}`;
      if (member.kind === "directory") nodes.push({ kind: "directory", path, mode: member.mode });
      else if (member.kind === "symlink") nodes.push({ kind: "symlink", path, linkTarget: member.linkTarget });
      else nodes.push({ kind: "file", path, mode: member.mode, artifact: {
        kind: "file", path: p.join(source, ...member.path.split("/")), bytes: member.bytes,
        producedBy: artifact.producedBy,
      } });
    }
  }

  const directories = new Map<string, DirectoryNode>();
  const leaves: Exclude<Node, DirectoryNode>[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") leaves.push(node);
    else {
      const previous = directories.get(node.path);
      if (previous !== undefined && previous.mode !== node.mode) return yield* invalid("merged directories have different modes", node.path);
      directories.set(node.path, node);
    }
  }
  const layout = Layout.validate([...directories.values(), ...leaves]);
  if (layout !== undefined) return yield* invalid(layout.reason, layout.path);
  // Every parent is a real directory. Layout validation excludes a symlink at any of these prefixes.
  for (const node of nodes) {
    const parts = node.path.split("/");
    for (let length = 1; length < parts.length; length++) {
      const path = parts.slice(0, length).join("/");
      if (!directories.has(path)) directories.set(path, { kind: "directory", path, mode: 0o755 });
    }
  }
  const ordered = [...directories.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const produce = (root: string) => Effect.gen(function*() {
    const write = (path: string) => Artifact.ioError(path, "write");
    yield* fs.makeDirectory(root, { recursive: true }).pipe(Effect.mapError(write(root)));
    for (const node of ordered) {
      const path = p.join(root, ...node.path.split("/"));
      yield* fs.makeDirectory(path).pipe(Effect.mapError(write(path)));
    }
    for (const node of leaves) {
      const path = p.join(root, ...node.path.split("/"));
      if (node.kind === "symlink") yield* fs.symlink(node.linkTarget, path).pipe(Effect.mapError(write(path)));
      else {
        // Let the destination filesystem decide whether distinct spellings alias.
        // Exclusive creation prevents one declared member from overwriting another.
        yield* Stream.run(Artifact.stream(node.artifact), fs.sink(path, { flag: "wx" }).pipe(Sink.mapError(write(path))));
        yield* fs.chmod(path, node.mode).pipe(Effect.mapError(write(path)));
      }
    }
    // Apply directory permissions after writing children, including read-only mounted roots.
    for (const node of [...ordered].reverse()) {
      const path = p.join(root, ...node.path.split("/"));
      yield* fs.chmod(path, node.mode).pipe(Effect.mapError(write(path)));
    }
    yield* fs.chmod(root, 0o755).pipe(Effect.mapError(write(root)));
    return yield* Artifact.directory(root, { name: "effect-build", version: metadata.version });
  });
  return yield* Commit.output(outdir, produce, input, "sibling");
});

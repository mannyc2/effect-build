import { Crypto, Effect, Exit, FileSystem, Option, Path, Schema, type Scope } from "effect";
import type {
  AbsolutePath,
  HashedFile,
  HashedTree,
  HashedTreeEntry,
  HashedTreeObservation,
  Provenance,
} from "../Artifact.js";
import { decimalBytes, fileMode, portableRelativePath, sha256Digest } from "../Artifact.js";
import { claimDurableDestination, contains, releaseDurableDestination } from "./internal/Claims.js";

export type Artifact = HashedTree;

export interface Request {
  readonly outdir: string;
  readonly cwd?: string | undefined;
  readonly observation: "hashed";
  readonly provenance: Provenance;
}

export class TreeDestinationInvalid extends Schema.TaggedError<TreeDestinationInvalid>()(
  "TreeDestinationInvalid",
  { destination: Schema.String, reason: Schema.String },
) {}

export class TreeCandidateMissing extends Schema.TaggedError<TreeCandidateMissing>()(
  "TreeCandidateMissing",
  { stagedRoot: Schema.String },
) {}

export class TreeCandidateChanged extends Schema.TaggedError<TreeCandidateChanged>()(
  "TreeCandidateChanged",
  { stagedRoot: Schema.String, reason: Schema.String },
) {}

export class TreeDestinationLocked extends Schema.TaggedError<TreeDestinationLocked>()(
  "TreeDestinationLocked",
  { destination: Schema.String, reason: Schema.String },
) {}

export class TreeCommitFailed extends Schema.TaggedError<TreeCommitFailed>()(
  "TreeCommitFailed",
  { destination: Schema.String, reason: Schema.String },
) {}

export class TreeVerificationFailed extends Schema.TaggedError<TreeVerificationFailed>()(
  "TreeVerificationFailed",
  { root: Schema.String, reason: Schema.String },
) {}

export class TreeFileProjectionFailed extends Schema.TaggedError<TreeFileProjectionFailed>()(
  "TreeFileProjectionFailed",
  { root: Schema.String, relativePath: Schema.String, reason: Schema.String },
) {}

export type PublicationFailure =
  | TreeDestinationInvalid
  | TreeCandidateMissing
  | TreeCandidateChanged
  | TreeDestinationLocked
  | TreeCommitFailed;

export type Failure<ProduceFailure, InspectFailure = never> =
  | ProduceFailure
  | InspectFailure
  | PublicationFailure;

interface CapturedEntry {
  readonly entry: HashedTreeEntry;
  readonly folded: string;
  readonly contents?: Uint8Array | undefined;
}

interface CapturedTree {
  readonly observation: HashedTreeObservation;
  readonly entries: readonly CapturedEntry[];
}

const encoder = new TextEncoder();
const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);
const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const reject = <E>(error: E): Effect.Effect<never, E> => Effect.fail(error);

const comparePath = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.byteLength - b.byteLength;
};

const digest = <E>(
  contents: Uint8Array,
  fail: (reason: string) => E,
): Effect.Effect<ReturnType<typeof sha256Digest>, E, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto;
    const value = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((error) => fail(`sha-256 digest unavailable: ${describe(error)}`)),
    );
    return sha256Digest(hex(new Uint8Array(value)));
  });

const capture = <E>(
  root: AbsolutePath,
  fail: (reason: string) => E,
): Effect.Effect<CapturedTree, E, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const canonicalRoot = yield* fileSystem.realPath(root).pipe(
      Effect.mapError((error) => fail(`resolve tree root: ${describe(error)}`)),
    );
    if (path.normalize(canonicalRoot) !== root) {
      return yield* reject(fail(`tree root is a symbolic-link alias: expected ${root}, observed ${canonicalRoot}`));
    }
    const rootInformation = yield* fileSystem.stat(root).pipe(
      Effect.mapError((error) => fail(`inspect tree root: ${describe(error)}`)),
    );
    if (rootInformation.type !== "Directory") return yield* reject(fail("tree root is not a directory"));
    const rootMode = fileMode(Number(rootInformation.mode) & 0o7777);

    const captured: CapturedEntry[] = [];
    const pendingDirectories = [""];
    const seen = new Set<string>();
    let total = 0n;
    while (pendingDirectories.length > 0) {
      const directory = pendingDirectories.shift() ?? "";
      const absoluteDirectory = directory.length === 0 ? root : path.join(root, ...directory.split("/"));
      const children = yield* fileSystem.readDirectory(absoluteDirectory).pipe(
        Effect.mapError((error) => fail(`read directory ${directory || "."}: ${describe(error)}`)),
      );
      children.sort(comparePath);
      for (const child of children) {
        const relativeText = directory.length === 0 ? child : `${directory}/${child}`;
        let relativePath: ReturnType<typeof portableRelativePath>;
        try {
          relativePath = portableRelativePath(relativeText.split(path.sep).join("/"));
        } catch (error) {
          return yield* reject(fail(`non-portable tree path ${relativeText}: ${describe(error)}`));
        }
        const folded = relativePath.toLowerCase();
        if (seen.has(folded)) return yield* reject(fail(`case-insensitive tree path collision at ${relativePath}`));
        seen.add(folded);
        const absolute = path.join(root, ...relativePath.split("/"));
        const link = yield* Effect.option(fileSystem.readLink(absolute));
        if (Option.isSome(link)) {
          const target = link.value;
          const resolved = path.normalize(path.resolve(path.dirname(absolute), target));
          if (
            target.length === 0
            || target.includes("\0")
            || path.isAbsolute(target)
            || !contains(path, root, resolved)
          ) return yield* reject(fail(`symbolic link escapes tree: ${relativePath} -> ${target}`));
          if (Option.isNone(yield* Effect.option(fileSystem.stat(resolved)))) {
            return yield* reject(fail(`symbolic link is absent, broken, or cyclic: ${relativePath} -> ${target}`));
          }
          captured.push(Object.freeze({
            entry: Object.freeze({ kind: "symbolic-link" as const, relativePath, target }),
            folded,
          }));
          continue;
        }

        const canonical = yield* fileSystem.realPath(absolute).pipe(
          Effect.mapError((error) => fail(`resolve ${relativePath}: ${describe(error)}`)),
        );
        if (path.normalize(canonical) !== absolute || !contains(path, root, canonical)) {
          return yield* reject(fail(`tree entry escapes its root: ${relativePath}`));
        }
        const before = yield* fileSystem.stat(absolute).pipe(
          Effect.mapError((error) => fail(`inspect ${relativePath}: ${describe(error)}`)),
        );
        if (before.type === "Directory") {
          captured.push(Object.freeze({
            entry: Object.freeze({
              kind: "directory" as const,
              relativePath,
              mode: fileMode(Number(before.mode) & 0o7777),
            }),
            folded,
          }));
          pendingDirectories.push(relativePath);
          continue;
        }
        if (before.type !== "File") return yield* reject(fail(`unsupported tree entry type at ${relativePath}`));
        const contents = yield* fileSystem.readFile(absolute).pipe(
          Effect.mapError((error) => fail(`read ${relativePath}: ${describe(error)}`)),
        );
        const afterLink = yield* Effect.option(fileSystem.readLink(absolute));
        const after = yield* fileSystem.stat(absolute).pipe(
          Effect.mapError((error) => fail(`reinspect ${relativePath}: ${describe(error)}`)),
        );
        if (
          Option.isSome(afterLink)
          || after.type !== "File"
          || `${before.size}` !== `${contents.byteLength}`
          || `${after.size}` !== `${contents.byteLength}`
          || `${before.mtime}` !== `${after.mtime}`
        ) return yield* reject(fail(`tree file changed while captured: ${relativePath}`));
        total += BigInt(contents.byteLength);
        captured.push(Object.freeze({
          entry: Object.freeze({
            kind: "file" as const,
            relativePath,
            mode: fileMode(Number(before.mode) & 0o7777),
            bytes: decimalBytes(`${contents.byteLength}`),
            digest: yield* digest(contents, fail),
          }),
          folded,
          contents,
        }));
      }
    }

    captured.sort((left, right) => comparePath(left.entry.relativePath, right.entry.relativePath));
    const entries = Object.freeze(captured.map(({ entry }) => entry));
    const totalBytes = decimalBytes(`${total}`);
    const manifestBytes = encoder.encode(JSON.stringify({ rootMode, totalBytes, entries }));
    const manifestDigest = yield* digest(manifestBytes, fail);
    return Object.freeze({
      observation: Object.freeze({
        _tag: "HashedTreeObservation" as const,
        root,
        rootMode,
        entries,
        totalBytes,
        manifestDigest,
      }),
      entries: Object.freeze(captured),
    });
  });

/** Make private roots removable without following symbolic links. */
const removePrivateTree = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): Effect.Effect<void> => {
  const prepare = Effect.gen(function*() {
    const directories = [root];
    while (directories.length > 0) {
      const directory = directories.shift();
      if (directory === undefined) continue;
      yield* fileSystem.chmod(directory, 0o700);
      for (const child of yield* fileSystem.readDirectory(directory)) {
        const entry = path.join(directory, child);
        if (Option.isSome(yield* Effect.option(fileSystem.readLink(entry)))) continue;
        const information = yield* fileSystem.stat(entry);
        if (information.type === "Directory") directories.push(entry);
      }
    }
  });
  return prepare.pipe(
    Effect.ignore,
    Effect.andThen(fileSystem.remove(root, { recursive: true, force: true }).pipe(Effect.ignore)),
  );
};

const privateDirectory = <E>(
  parent: string | undefined,
  prefix: string,
  fail: (reason: string) => E,
): Effect.Effect<string, E, FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const created = yield* Effect.acquireRelease(
      fileSystem.makeTempDirectory({ ...(parent === undefined ? {} : { directory: parent }), prefix }).pipe(
        Effect.mapError((error) => fail(`create private directory: ${describe(error)}`)),
      ),
      (root) => removePrivateTree(fileSystem, path, root),
    );
    return yield* fileSystem.realPath(created).pipe(
      Effect.map(path.normalize),
      Effect.mapError((error) => fail(`resolve private directory: ${describe(error)}`)),
    );
  });

const rebuild = <E>(
  root: AbsolutePath,
  captured: CapturedTree,
  fail: (reason: string) => E,
): Effect.Effect<void, E, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = captured.entries
      .filter(({ entry }) => entry.kind === "directory")
      .sort((left, right) =>
        left.entry.relativePath.split("/").length - right.entry.relativePath.split("/").length
        || comparePath(left.entry.relativePath, right.entry.relativePath)
      );
    for (const { entry } of directories) {
      const destination = path.join(root, ...entry.relativePath.split("/"));
      yield* fileSystem.makeDirectory(destination).pipe(
        Effect.mapError((error) => fail(`create directory ${entry.relativePath}: ${describe(error)}`)),
      );
    }
    for (const item of captured.entries.filter(({ entry }) => entry.kind === "file")) {
      if (item.entry.kind !== "file") continue;
      const destination = path.join(root, ...item.entry.relativePath.split("/"));
      yield* fileSystem.writeFile(destination, item.contents ?? new Uint8Array()).pipe(
        Effect.mapError((error) => fail(`write file ${item.entry.relativePath}: ${describe(error)}`)),
      );
      yield* fileSystem.chmod(destination, item.entry.mode).pipe(
        Effect.mapError((error) => fail(`set file mode ${item.entry.relativePath}: ${describe(error)}`)),
      );
    }
    const pendingLinks = captured.entries.filter(({ entry }) => entry.kind === "symbolic-link").slice();
    while (pendingLinks.length > 0) {
      let progressed = false;
      for (let index = pendingLinks.length - 1; index >= 0; index--) {
        const item = pendingLinks[index]!;
        if (item.entry.kind !== "symbolic-link") continue;
        const destination = path.join(root, ...item.entry.relativePath.split("/"));
        const target = path.resolve(path.dirname(destination), item.entry.target);
        if (Option.isNone(yield* Effect.option(fileSystem.stat(target)))) continue;
        yield* fileSystem.symlink(item.entry.target, destination).pipe(
          Effect.mapError((error) => fail(`write symbolic link ${item.entry.relativePath}: ${describe(error)}`)),
        );
        pendingLinks.splice(index, 1);
        progressed = true;
      }
      if (!progressed) {
        const item = pendingLinks[0]!;
        return yield* reject(fail(
          `symbolic link is absent, broken, or cyclic: ${item.entry.relativePath} -> ${
            item.entry.kind === "symbolic-link" ? item.entry.target : ""
          }`,
        ));
      }
    }
    for (const { entry } of [...directories].reverse()) {
      if (entry.kind !== "directory") continue;
      const destination = path.join(root, ...entry.relativePath.split("/"));
      yield* fileSystem.chmod(destination, entry.mode).pipe(
        Effect.mapError((error) => fail(`set directory mode ${entry.relativePath}: ${describe(error)}`)),
      );
    }
    yield* fileSystem.chmod(root, captured.observation.rootMode).pipe(
      Effect.mapError((error) => fail(`set tree root mode: ${describe(error)}`)),
    );
  });

/**
 * Finalizes one exact tree. The destination must be absent because portable
 * filesystems cannot atomically overlay a non-empty directory generation.
 */
export const publish = <
  ProduceFailure,
  ProduceRequirements,
  InspectFailure = never,
  InspectRequirements = never,
>(
  request: Request,
  produce: (privateSameParentRoot: AbsolutePath) => Effect.Effect<void, ProduceFailure, ProduceRequirements>,
  inspect?:
    | ((candidate: HashedTreeObservation) => Effect.Effect<void, InspectFailure, InspectRequirements>)
    | undefined,
): Effect.Effect<
  HashedTree,
  Failure<ProduceFailure, InspectFailure>,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ProduceRequirements | InspectRequirements
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const destinationText = path.normalize(path.resolve(request.cwd ?? "", request.outdir));
      if (
        request.outdir.length === 0 || !path.isAbsolute(destinationText) || path.basename(destinationText).length === 0
      ) {
        return yield* new TreeDestinationInvalid({
          destination: request.outdir,
          reason: "outdir must resolve to an absolute non-root directory path",
        });
      }
      yield* fileSystem.makeDirectory(path.dirname(destinationText), { recursive: true }).pipe(
        Effect.mapError((error) =>
          new TreeDestinationInvalid({ destination: destinationText, reason: describe(error) })
        ),
      );
      const parent = path.normalize(
        yield* fileSystem.realPath(path.dirname(destinationText)).pipe(
          Effect.mapError((error) =>
            new TreeDestinationInvalid({ destination: destinationText, reason: describe(error) })
          ),
        ),
      );
      const destination = path.join(parent, path.basename(destinationText)) as AbsolutePath;
      const exists = Option.isSome(yield* Effect.option(fileSystem.readLink(destination)))
        || (yield* fileSystem.exists(destination).pipe(
          Effect.mapError((error) => new TreeDestinationInvalid({ destination, reason: describe(error) })),
        ));
      if (exists) {
        return yield* new TreeDestinationLocked({ destination, reason: "exact trees never overlay an existing path" });
      }
      const conflict = claimDurableDestination(path, destination);
      if (conflict !== undefined) return yield* new TreeDestinationLocked({ destination, reason: conflict });
      yield* Effect.addFinalizer(() => Effect.sync(() => releaseDurableDestination(path, destination)));
      let committed = false;
      let committedNode: { readonly dev: number; readonly ino: number } | undefined;
      yield* Effect.addFinalizer((exit) => {
        if (Exit.isSuccess(exit) || !committed || committedNode === undefined) return Effect.void;
        return fileSystem.stat(destination).pipe(
          Effect.flatMap((information) => {
            const ino = Option.getOrUndefined(information.ino);
            return information.dev === committedNode?.dev && ino === committedNode?.ino
              ? fileSystem.remove(destination, { recursive: true, force: true })
              : Effect.void;
          }),
          Effect.ignore,
        );
      });

      const staged = path.normalize(
        yield* privateDirectory(
          parent,
          ".effect-build-tree-candidate-",
          (reason) => new TreeCommitFailed({ destination, reason }),
        ),
      ) as AbsolutePath;
      yield* produce(staged);
      yield* fileSystem.chmod(staged, 0o755).pipe(
        Effect.mapError((error) => new TreeCandidateChanged({ stagedRoot: staged, reason: describe(error) })),
      );
      const before = yield* capture(staged, (reason) => new TreeCandidateChanged({ stagedRoot: staged, reason }));
      yield* (inspect?.(before.observation) ?? Effect.void);
      const after = yield* capture(staged, (reason) => new TreeCandidateChanged({ stagedRoot: staged, reason }));
      if (
        before.observation.manifestDigest.value !== after.observation.manifestDigest.value
        || before.observation.totalBytes !== after.observation.totalBytes
        || before.observation.rootMode !== after.observation.rootMode
      ) return yield* new TreeCandidateChanged({ stagedRoot: staged, reason: "tree changed after inspection" });

      const verified = path.normalize(
        yield* privateDirectory(
          parent,
          ".effect-build-tree-verified-",
          (reason) => new TreeCommitFailed({ destination, reason }),
        ),
      ) as AbsolutePath;
      yield* rebuild(verified, before, (reason) => new TreeCommitFailed({ destination, reason }));
      const reobserved = yield* capture(verified, (reason) => new TreeCommitFailed({ destination, reason }));
      if (reobserved.observation.manifestDigest.value !== before.observation.manifestDigest.value) {
        return yield* new TreeCommitFailed({ destination, reason: "verified tree reconstruction changed identity" });
      }
      const appeared = Option.isSome(yield* Effect.option(fileSystem.readLink(destination)))
        || (yield* fileSystem.exists(destination).pipe(
          Effect.mapError((error) => new TreeCommitFailed({ destination, reason: describe(error) })),
        ));
      if (appeared) {
        return yield* new TreeDestinationLocked({
          destination,
          reason: "destination appeared before the atomic tree commit",
        });
      }
      const verifiedInformation = yield* fileSystem.stat(verified).pipe(
        Effect.mapError((error) => new TreeCommitFailed({ destination, reason: describe(error) })),
      );
      const verifiedIno = Option.getOrUndefined(verifiedInformation.ino);
      yield* Effect.uninterruptible(
        fileSystem.rename(verified, destination).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              committed = true;
              committedNode = verifiedIno === undefined
                ? undefined
                : { dev: verifiedInformation.dev, ino: verifiedIno };
            })
          ),
        ),
      ).pipe(
        Effect.mapError((error) => new TreeCommitFailed({ destination, reason: describe(error) })),
      );
      return Object.freeze({
        _tag: "HashedTree" as const,
        root: destination,
        rootMode: before.observation.rootMode,
        entries: before.observation.entries,
        totalBytes: before.observation.totalBytes,
        manifestDigest: before.observation.manifestDigest,
        provenance: request.provenance,
        publication: Object.freeze({
          scope: "tree" as const,
          commit: "same-parent-rename" as const,
          committed: true as const,
        }),
      });
    }),
  );

/**
 * Revalidates one durable tree, rebuilds only its recorded entries in a private
 * scope, and lends the snapshot path solely to the continuation.
 */
export const withVerifiedSnapshot = <A, UseFailure, UseRequirements>(
  artifact: HashedTree,
  use: (privateSnapshot: AbsolutePath) => Effect.Effect<A, UseFailure, UseRequirements>,
): Effect.Effect<
  A,
  TreeVerificationFailed | UseFailure,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | UseRequirements
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const path = yield* Path.Path;
      const fail = (reason: string): TreeVerificationFailed =>
        new TreeVerificationFailed({ root: artifact.root, reason });
      const captured = yield* capture(artifact.root, fail);
      if (
        captured.observation.manifestDigest.value !== artifact.manifestDigest.value
        || captured.observation.totalBytes !== artifact.totalBytes
        || captured.observation.rootMode !== artifact.rootMode
      ) return yield* fail("tree identity does not match the durable handoff");
      const snapshot = path.normalize(
        yield* privateDirectory(undefined, "effect-build-tree-snapshot-", fail),
      ) as AbsolutePath;
      yield* rebuild(snapshot, captured, fail);
      const verified = yield* capture(snapshot, fail);
      if (verified.observation.manifestDigest.value !== artifact.manifestDigest.value) {
        return yield* fail("private snapshot reconstruction changed identity");
      }
      return yield* use(snapshot);
    }),
  );

/** Projects one regular file committed by the tree's single atomic rename. */
export const projectFile = (
  artifact: HashedTree,
  relativePath: string,
): Effect.Effect<HashedFile, TreeFileProjectionFailed, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    let portable: ReturnType<typeof portableRelativePath>;
    try {
      portable = portableRelativePath(relativePath);
    } catch (error) {
      return yield* new TreeFileProjectionFailed({
        root: artifact.root,
        relativePath,
        reason: `invalid portable relative path: ${describe(error)}`,
      });
    }
    const entry = artifact.entries.find((candidate) =>
      candidate.kind === "file" && candidate.relativePath === portable
    );
    if (entry === undefined || entry.kind !== "file") {
      return yield* new TreeFileProjectionFailed({
        root: artifact.root,
        relativePath: portable,
        reason: "tree generation has no regular file at this path",
      });
    }
    return Object.freeze({
      _tag: "HashedFile" as const,
      path: path.join(artifact.root, ...portable.split("/")) as AbsolutePath,
      bytes: entry.bytes,
      digest: entry.digest,
      provenance: artifact.provenance,
      publication: Object.freeze({
        scope: "tree-file-projection" as const,
        commit: "same-parent-rename" as const,
        committed: true as const,
        treeRoot: artifact.root,
        relativePath: portable,
        treeManifestDigest: artifact.manifestDigest,
      }),
    });
  });

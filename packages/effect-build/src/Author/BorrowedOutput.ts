import { Cause, Context, Crypto, Effect, Exit, FileSystem, Layer, Path, Schema, type Scope, Semaphore } from "effect";
import type { AbsolutePath, DecimalBytes, Digest, HashedFile, ObservationMode, UnhashedFile } from "../Artifact.js";
import { decimalBytes, sha256Digest } from "../Artifact.js";
import { claimCleanupRoot, contains, releaseCleanupRoot } from "./internal/Claims.js";

export type { ObservationMode } from "../Artifact.js";
export type { DecimalBytes, Digest } from "../Artifact.js";

export class BorrowedOutputExpired extends Schema.TaggedError<BorrowedOutputExpired>()("BorrowedOutputExpired", {
  leaseId: Schema.String,
}) {}

export class BorrowedOutputChanged extends Schema.TaggedError<BorrowedOutputChanged>()("BorrowedOutputChanged", {
  leaseId: Schema.String,
  mismatch: Schema.String,
}) {}

export class BorrowedOutputEscaped extends Schema.TaggedError<BorrowedOutputEscaped>()("BorrowedOutputEscaped", {
  leaseId: Schema.String,
  candidate: Schema.String,
}) {}

export class BorrowedOutputMissing extends Schema.TaggedError<BorrowedOutputMissing>()("BorrowedOutputMissing", {
  leaseId: Schema.String,
  path: Schema.String,
}) {}

export class BorrowedOutputObservationFailed extends Schema.TaggedError<BorrowedOutputObservationFailed>()(
  "BorrowedOutputObservationFailed",
  { leaseId: Schema.String, reason: Schema.String },
) {}

export class CleanupFailedAfterSuccessfulUse extends Schema.TaggedError<CleanupFailedAfterSuccessfulUse>()(
  "CleanupFailedAfterSuccessfulUse",
  { leaseId: Schema.String, root: Schema.String, reason: Schema.String },
) {}

export type Failure =
  | BorrowedOutputExpired
  | BorrowedOutputChanged
  | BorrowedOutputEscaped
  | BorrowedOutputMissing
  | BorrowedOutputObservationFailed;

export interface CleanupObservation {
  readonly leaseId: string;
  readonly root: AbsolutePath;
  readonly cause: Cause.Cause<unknown>;
}

export class CleanupReporter extends Context.Service<
  CleanupReporter,
  { readonly report: (observation: CleanupObservation) => Effect.Effect<void> }
>()("effect-build/Author/BorrowedOutput/CleanupReporter") {
  static readonly layer: Layer.Layer<CleanupReporter> = Layer.succeed(CleanupReporter, {
    report: (observation) =>
      Effect.logWarning("borrowed-output cleanup failed").pipe(
        Effect.annotateLogs({ leaseId: observation.leaseId, root: observation.root }),
      ),
  });
}

export interface UnhashedFileObservation extends UnhashedFile {
  readonly _tag: "UnhashedFileObservation";
  readonly kind: "file";
}

export interface HashedFileObservation extends HashedFile {
  readonly _tag: "HashedFileObservation";
  readonly kind: "file";
}

export interface TreeDirectoryEntry {
  readonly relativePath: string;
  readonly kind: "directory";
}

export interface UnhashedTreeFileEntry {
  readonly relativePath: string;
  readonly kind: "file";
  readonly bytes: DecimalBytes;
}

export interface HashedTreeFileEntry extends UnhashedTreeFileEntry {
  readonly digest: Digest;
}

export type UnhashedTreeEntry = TreeDirectoryEntry | UnhashedTreeFileEntry;
export type HashedTreeEntry = TreeDirectoryEntry | HashedTreeFileEntry;

export interface UnhashedTreeObservation {
  readonly _tag: "UnhashedTreeObservation";
  readonly root: AbsolutePath;
  readonly entries: readonly UnhashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
}

export interface HashedTreeObservation {
  readonly _tag: "HashedTreeObservation";
  readonly root: AbsolutePath;
  readonly entries: readonly HashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

export type FileObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedFileObservation
  : UnhashedFileObservation;
export type TreeObservation<Mode extends ObservationMode> = Mode extends "hashed" ? HashedTreeObservation
  : UnhashedTreeObservation;

export interface File<Mode extends ObservationMode> {
  /** Copyable locator only; continuing authority lives in `observe`. */
  readonly path: AbsolutePath;
  readonly initial: FileObservation<Mode>;
  readonly observe: Effect.Effect<FileObservation<Mode>, Failure>;
}

export interface Tree<Mode extends ObservationMode> {
  /** Copyable locator only; continuing authority lives in `observe`. */
  readonly root: AbsolutePath;
  readonly initial: TreeObservation<Mode>;
  readonly observe: Effect.Effect<TreeObservation<Mode>, Failure>;
}

export interface Producer<ProduceFailure, Requirements = never> {
  readonly prefix: string;
  readonly produce: (ownedRoot: AbsolutePath) => Effect.Effect<string, ProduceFailure, Requirements>;
}

type State = "open" | "closing" | "closed";

interface PrivateFileObservation {
  readonly path: AbsolutePath;
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
}

interface PrivateTreeObservation {
  readonly root: AbsolutePath;
  readonly entries: readonly HashedTreeEntry[];
  readonly totalBytes: DecimalBytes;
  readonly manifestDigest: Digest;
}

const encoder = new TextEncoder();

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);

const digest = (
  leaseId: string,
  contents: Uint8Array,
): Effect.Effect<Digest, BorrowedOutputObservationFailed, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto;
    const value = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => new BorrowedOutputObservationFailed({ leaseId, reason: "sha-256 digest unavailable" })),
    );
    return sha256Digest(hex(new Uint8Array(value)));
  });

const canonicalObject = (
  leaseId: string,
  cleanupRoot: AbsolutePath,
  candidate: string,
): Effect.Effect<AbsolutePath, Failure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (candidate.length === 0 || !path.isAbsolute(candidate) || path.normalize(candidate) !== candidate) {
      return yield* new BorrowedOutputEscaped({ leaseId, candidate });
    }
    const absolute = path.normalize(path.resolve(candidate));
    if (!contains(path, cleanupRoot, absolute)) {
      return yield* new BorrowedOutputEscaped({ leaseId, candidate: absolute });
    }
    const canonical = yield* fileSystem.realPath(absolute).pipe(
      Effect.mapError(() => new BorrowedOutputMissing({ leaseId, path: absolute })),
    );
    const normalized = path.normalize(canonical);
    if (normalized !== absolute || !contains(path, cleanupRoot, normalized)) {
      return yield* new BorrowedOutputEscaped({ leaseId, candidate: absolute });
    }
    return normalized as AbsolutePath;
  });

const observePrivateFile = (
  leaseId: string,
  cleanupRoot: AbsolutePath,
  candidate: string,
): Effect.Effect<PrivateFileObservation, Failure, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* canonicalObject(leaseId, cleanupRoot, candidate);
    const information = yield* fileSystem.stat(path).pipe(
      Effect.mapError(() => new BorrowedOutputMissing({ leaseId, path })),
    );
    if (information.type !== "File") {
      return yield* new BorrowedOutputObservationFailed({ leaseId, reason: "borrowed file is not a regular file" });
    }
    const contents = yield* fileSystem.readFile(path).pipe(
      Effect.mapError((error) => new BorrowedOutputObservationFailed({ leaseId, reason: describe(error) })),
    );
    if (`${information.size}` !== `${contents.byteLength}`) {
      return yield* new BorrowedOutputChanged({ leaseId, mismatch: "byte count changed during observation" });
    }
    return Object.freeze({
      path,
      bytes: decimalBytes(`${contents.byteLength}`),
      digest: yield* digest(leaseId, contents),
    });
  });

const publicFile = <Mode extends ObservationMode>(
  mode: Mode,
  observed: PrivateFileObservation,
): FileObservation<Mode> =>
  Object.freeze(
    mode === "hashed"
      ? { _tag: "HashedFileObservation" as const, kind: "file" as const, ...observed }
      : {
        _tag: "UnhashedFileObservation" as const,
        kind: "file" as const,
        path: observed.path,
        bytes: observed.bytes,
      },
  ) as FileObservation<Mode>;

const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const windowsForbidden = /[<>:"|?*]/u;
const hasWindowsForbiddenCharacter = (component: string): boolean =>
  windowsForbidden.test(component) || Array.from(component).some((character) => character.charCodeAt(0) <= 0x1f);

const portablePath = (entry: string): string | undefined => {
  if (
    entry.length === 0
    || entry.normalize("NFC") !== entry
    || entry.includes("\\")
    || entry.startsWith("/")
    || entry.endsWith("/")
  ) return undefined;
  const components = entry.split("/");
  return components.every((component) =>
      component.length > 0
      && component !== "."
      && component !== ".."
      && !hasWindowsForbiddenCharacter(component)
      && !component.endsWith(".")
      && !component.endsWith(" ")
      && !windowsReserved.test(component)
    )
    ? entry
    : undefined;
};

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

const observePrivateTree = (
  leaseId: string,
  cleanupRoot: AbsolutePath,
  candidate: string,
): Effect.Effect<PrivateTreeObservation, Failure, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* canonicalObject(leaseId, cleanupRoot, candidate);
    const rootInformation = yield* fileSystem.stat(root).pipe(
      Effect.mapError(() => new BorrowedOutputMissing({ leaseId, path: root })),
    );
    if (rootInformation.type !== "Directory") {
      return yield* new BorrowedOutputObservationFailed({ leaseId, reason: "borrowed tree root is not a directory" });
    }
    const names = yield* fileSystem.readDirectory(root, { recursive: true }).pipe(
      Effect.mapError((error) => new BorrowedOutputObservationFailed({ leaseId, reason: describe(error) })),
    );
    const entries: HashedTreeEntry[] = [];
    const seen = new Set<string>();
    let total = 0n;
    for (const name of names) {
      const relativePath = portablePath(name.split(path.sep).join("/"));
      if (relativePath === undefined) {
        return yield* new BorrowedOutputObservationFailed({ leaseId, reason: "tree contains a non-portable path" });
      }
      const folded = relativePath.toLowerCase();
      if (seen.has(folded)) {
        return yield* new BorrowedOutputObservationFailed({
          leaseId,
          reason: "tree has a case-insensitive path collision",
        });
      }
      seen.add(folded);
      const absolute = path.normalize(path.join(root, name));
      const canonical = yield* fileSystem.realPath(absolute).pipe(
        Effect.mapError(() => new BorrowedOutputMissing({ leaseId, path: absolute })),
      );
      if (path.normalize(canonical) !== absolute || !contains(path, root, canonical)) {
        return yield* new BorrowedOutputEscaped({ leaseId, candidate: absolute });
      }
      const information = yield* fileSystem.stat(absolute).pipe(
        Effect.mapError(() => new BorrowedOutputMissing({ leaseId, path: absolute })),
      );
      if (information.type === "Directory") {
        entries.push(Object.freeze({ relativePath, kind: "directory" as const }));
        continue;
      }
      if (information.type !== "File") {
        return yield* new BorrowedOutputObservationFailed({ leaseId, reason: "tree contains an unsupported entry" });
      }
      const contents = yield* fileSystem.readFile(absolute).pipe(
        Effect.mapError((error) => new BorrowedOutputObservationFailed({ leaseId, reason: describe(error) })),
      );
      if (`${information.size}` !== `${contents.byteLength}`) {
        return yield* new BorrowedOutputChanged({ leaseId, mismatch: `byte count changed for ${relativePath}` });
      }
      total += BigInt(contents.byteLength);
      entries.push(Object.freeze({
        relativePath,
        kind: "file" as const,
        bytes: decimalBytes(`${contents.byteLength}`),
        digest: yield* digest(leaseId, contents),
      }));
    }
    entries.sort((left, right) => comparePath(left.relativePath, right.relativePath));
    const frozen = Object.freeze(entries);
    const manifestDigest = yield* digest(leaseId, encoder.encode(JSON.stringify(frozen)));
    return Object.freeze({ root, entries: frozen, totalBytes: decimalBytes(`${total}`), manifestDigest });
  });

const publicTree = <Mode extends ObservationMode>(
  mode: Mode,
  observed: PrivateTreeObservation,
): TreeObservation<Mode> => {
  if (mode === "hashed") {
    return Object.freeze({
      _tag: "HashedTreeObservation" as const,
      root: observed.root,
      entries: observed.entries,
      totalBytes: observed.totalBytes,
      manifestDigest: observed.manifestDigest,
    }) as TreeObservation<Mode>;
  }
  const entries: UnhashedTreeEntry[] = observed.entries.map((entry) =>
    entry.kind === "directory"
      ? entry
      : Object.freeze({ relativePath: entry.relativePath, kind: "file" as const, bytes: entry.bytes })
  );
  return Object.freeze({
    _tag: "UnhashedTreeObservation" as const,
    root: observed.root,
    entries: Object.freeze(entries),
    totalBytes: observed.totalBytes,
  }) as TreeObservation<Mode>;
};

const makeLeaseId = (root: string): string => `lease:${root}`;

const cleanupReason = (cause: Cause.Cause<unknown>): string => {
  const rendered = String(cause);
  return rendered.length <= 1024 ? rendered : `${rendered.slice(0, 1024)}…`;
};

const withOwnedRoot = <Handle, A, ProduceFailure, UseFailure, ProduceRequirements, UseRequirements>(
  producer: Producer<ProduceFailure, ProduceRequirements>,
  makeHandle: (
    leaseId: string,
    root: AbsolutePath,
    candidate: string,
    state: { value: State },
    semaphore: Semaphore.Semaphore,
  ) => Effect.Effect<Handle, Failure, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
  use: (handle: Handle) => Effect.Effect<A, UseFailure, UseRequirements>,
): Effect.Effect<
  A,
  ProduceFailure | UseFailure | Failure | CleanupFailedAfterSuccessfulUse,
  | CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<ProduceRequirements, Scope.Scope>
  | Exclude<UseRequirements, Scope.Scope>
> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const reporter = yield* CleanupReporter;
      if (producer.prefix.length === 0 || producer.prefix.includes("/") || producer.prefix.includes("\\")) {
        return yield* new BorrowedOutputObservationFailed({ leaseId: "unallocated", reason: "invalid root prefix" });
      }
      const created = yield* fileSystem.makeTempDirectory({ prefix: producer.prefix }).pipe(
        Effect.mapError((error) =>
          new BorrowedOutputObservationFailed({ leaseId: "unallocated", reason: describe(error) })
        ),
      );
      const rootExit = yield* Effect.exit(fileSystem.realPath(created));
      if (Exit.isFailure(rootExit)) {
        yield* Effect.exit(fileSystem.remove(created, { recursive: true, force: true }));
        return yield* new BorrowedOutputObservationFailed({
          leaseId: "unallocated",
          reason: cleanupReason(rootExit.cause),
        });
      }
      const root = path.normalize(rootExit.value) as AbsolutePath;
      const leaseId = makeLeaseId(root);
      const conflict = claimCleanupRoot(path, root);
      if (conflict !== undefined) {
        yield* fileSystem.remove(root, { recursive: true, force: true }).pipe(Effect.ignore);
        return yield* new BorrowedOutputObservationFailed({ leaseId, reason: conflict });
      }
      const state: { value: State } = { value: "open" };
      const semaphore = Semaphore.makeUnsafe(1);
      const work = Effect.gen(function*() {
        const candidate = yield* producer.produce(root);
        const handle = yield* makeHandle(leaseId, root, candidate, state, semaphore);
        return yield* use(handle);
      });
      const workExit = yield* Effect.exit(restore(Effect.scoped(work)));
      state.value = "closing";
      const cleanupExit = yield* Effect.exit(
        semaphore.withPermit(fileSystem.remove(root, { recursive: true, force: true })),
      );
      state.value = "closed";
      releaseCleanupRoot(path, root);

      if (Exit.isFailure(workExit)) {
        if (Exit.isFailure(cleanupExit)) {
          yield* Effect.exit(reporter.report({ leaseId, root, cause: cleanupExit.cause }));
        }
        return yield* Effect.failCause(workExit.cause);
      }
      if (Exit.isFailure(cleanupExit)) {
        return yield* new CleanupFailedAfterSuccessfulUse({
          leaseId,
          root,
          reason: cleanupReason(cleanupExit.cause),
        });
      }
      return workExit.value;
    })
  );

export const withFile = <
  Mode extends ObservationMode,
  A,
  ProduceFailure,
  UseFailure,
  ProduceRequirements,
  UseRequirements,
>(
  producer: Producer<ProduceFailure, ProduceRequirements>,
  mode: Mode,
  use: (file: File<Mode>) => Effect.Effect<A, UseFailure, UseRequirements>,
): Effect.Effect<
  A,
  ProduceFailure | UseFailure | Failure | CleanupFailedAfterSuccessfulUse,
  | CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<ProduceRequirements, Scope.Scope>
  | Exclude<UseRequirements, Scope.Scope>
> =>
  withOwnedRoot(
    producer,
    (leaseId, root, candidate, state, semaphore) =>
      Effect.gen(function*() {
        const initialPrivate = yield* observePrivateFile(leaseId, root, candidate);
        const initial = publicFile(mode, initialPrivate);
        const crypto = yield* Crypto.Crypto;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const observe = Effect.suspend(() =>
          semaphore.withPermit(
            Effect.gen(function*() {
              if (state.value !== "open") return yield* new BorrowedOutputExpired({ leaseId });
              const current = yield* observePrivateFile(leaseId, root, initialPrivate.path);
              if (current.bytes !== initialPrivate.bytes) {
                return yield* new BorrowedOutputChanged({ leaseId, mismatch: "byte count changed" });
              }
              if (current.digest.value !== initialPrivate.digest.value) {
                return yield* new BorrowedOutputChanged({ leaseId, mismatch: "content digest changed" });
              }
              return publicFile(mode, current);
            }),
          )
        ).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
        return Object.freeze({ path: initialPrivate.path, initial, observe });
      }),
    use,
  );

export const withTree = <
  Mode extends ObservationMode,
  A,
  ProduceFailure,
  UseFailure,
  ProduceRequirements,
  UseRequirements,
>(
  producer: Producer<ProduceFailure, ProduceRequirements>,
  mode: Mode,
  use: (tree: Tree<Mode>) => Effect.Effect<A, UseFailure, UseRequirements>,
): Effect.Effect<
  A,
  ProduceFailure | UseFailure | Failure | CleanupFailedAfterSuccessfulUse,
  | CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<ProduceRequirements, Scope.Scope>
  | Exclude<UseRequirements, Scope.Scope>
> =>
  withOwnedRoot(
    producer,
    (leaseId, root, candidate, state, semaphore) =>
      Effect.gen(function*() {
        const initialPrivate = yield* observePrivateTree(leaseId, root, candidate);
        const initial = publicTree(mode, initialPrivate);
        const crypto = yield* Crypto.Crypto;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const observe = Effect.suspend(() =>
          semaphore.withPermit(
            Effect.gen(function*() {
              if (state.value !== "open") return yield* new BorrowedOutputExpired({ leaseId });
              const current = yield* observePrivateTree(leaseId, root, initialPrivate.root);
              if (current.manifestDigest.value !== initialPrivate.manifestDigest.value) {
                return yield* new BorrowedOutputChanged({ leaseId, mismatch: "tree manifest digest changed" });
              }
              return publicTree(mode, current);
            }),
          )
        ).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
        return Object.freeze({ root: initialPrivate.root, initial, observe });
      }),
    use,
  );

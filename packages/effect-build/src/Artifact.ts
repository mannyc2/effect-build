import { sha256 as incrementalSha256 } from "@noble/hashes/sha2.js";
import { Crypto, Effect, Encoding, FileSystem, Path, PlatformError, Schema, Stream } from "effect";
import * as Inspect from "./Executable.js";
import { readLink } from "./internal/fileSystem.js";
import { manifestDigest } from "./internal/directoryIdentity.js";
import { parts, Target } from "./Target.js";

const Bytes = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
export const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).pipe(Schema.brand("Sha256"));
export type Sha256 = typeof Sha256.Type;
const Mode = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0o7777));

export const Producer = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  path: Schema.optionalKey(Schema.String),
  sha256: Schema.optionalKey(Sha256),
});
export type Producer = typeof Producer.Type;

const Common = {
  path: Schema.NonEmptyString,
  bytes: Bytes,
  producedBy: Producer,
};

export const File = Schema.Struct({ kind: Schema.Literal("file"), ...Common });
export type File = typeof File.Type;

const executableCheck = Schema.makeFilter((value: { readonly target: Target; readonly format: string }) =>
  parts(value.target).format === value.format ? undefined : "executable format must match its target");

export const Executable = Schema.Struct({
  kind: Schema.Literal("executable"),
  ...Common,
  target: Target,
  format: Schema.Literals(["elf", "mach-o", "pe"] as const),
}).check(executableCheck);
export type Executable = typeof Executable.Type;

const EntryCommon = {
  path: Schema.NonEmptyString.check(Schema.makeFilter((path) =>
    !path.includes("\0") && !path.startsWith("/") && path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
      ? undefined : "entry path must be a normalized relative path")),
  mode: Mode,
};
/** Directory members carry metadata without reading their contents. */
export const Entry = Schema.Union([
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("file"), bytes: Bytes, linkTarget: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("directory"), bytes: Schema.Literal(0), linkTarget: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("symlink"), bytes: Schema.Literal(0), linkTarget: Schema.NonEmptyString }),
]);
export type Entry = typeof Entry.Type;

const directoryCheck = Schema.makeFilter((value: { readonly bytes: number; readonly entries: readonly Entry[] }) => {
  let bytes = 0, previous: string | undefined;
  const seen = new Map<string, Entry>();
  for (const entry of value.entries) {
    if (previous !== undefined && previous >= entry.path) return "directory entries must be sorted and unique";
    if (entry.path.includes("/") && seen.get(entry.path.slice(0, entry.path.lastIndexOf("/")))?.kind !== "directory") {
      return "directory entries must include their parent directory";
    }
    bytes += entry.bytes;
    previous = entry.path;
    seen.set(entry.path, entry);
  }
  return Number.isSafeInteger(bytes) && bytes === value.bytes ? undefined : "directory bytes must equal its file entries";
});

export const Directory = Schema.Struct({
  kind: Schema.Literal("directory"),
  ...Common,
  rootMode: Mode,
  entries: Schema.Array(Entry),
}).check(directoryCheck);
export type Directory = typeof Directory.Type;

const identity = { sha256: Sha256 };
export const HashedFile = File.pipe(Schema.fieldsAssign(identity));
export type HashedFile = typeof HashedFile.Type;
export const HashedExecutable = Executable.pipe(Schema.fieldsAssign(identity)).check(executableCheck);
export type HashedExecutable = typeof HashedExecutable.Type;
export const HashedEntry = Schema.Union([
  Entry.members[0].pipe(Schema.fieldsAssign(identity)),
  Entry.members[1],
  Entry.members[2],
]);
export type HashedEntry = typeof HashedEntry.Type;

export const HashedDirectory = Directory.pipe(Schema.fieldsAssign({
  ...identity,
  entries: Schema.Array(HashedEntry),
})).check(directoryCheck, Schema.makeFilter((value) =>
  manifestDigest(value.entries) === value.sha256 ? undefined : "directory digest must match its entry manifest"));
export type HashedDirectory = typeof HashedDirectory.Type;
export const HashedArtifact = Schema.Union([HashedFile, HashedExecutable, HashedDirectory]);
export type HashedArtifact = typeof HashedArtifact.Type;
export type HashedRegular = HashedFile | HashedExecutable;

/** Add identity while retaining the producer's more specific record fields. */
export type WithSha256<A extends Artifact> =
  A extends Directory ? Omit<A, keyof Directory | "sha256"> & HashedDirectory
  : A extends Executable ? Omit<A, keyof Executable | "sha256"> & HashedExecutable
  : Omit<A, keyof File | "sha256"> & HashedFile;

export const Artifact = Schema.Union([File, Executable, Directory]);
export type Artifact = typeof Artifact.Type;

/** Anything backed by a single regular file. Most consumers accept this. */
export type Regular = File | Executable;

export const isRegular = (artifact: Artifact): artifact is Regular => artifact.kind !== "directory";

export class ArtifactError extends Schema.TaggedError<ArtifactError>()("ArtifactError", {
  path: Schema.String,
  reason: Schema.Literals([
    "not-found",
    "not-a-file",
    "not-a-directory",
    "unreadable",
    "unwritable",
    "copy-failed",
    "changed",
    "invalid-metadata",
  ] as const),
  detail: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.reason}: ${this.path}${this.detail === undefined ? "" : ` (${this.detail})`}`;
  }
}

/** Translate filesystem failures at the operation boundary, retaining the native diagnosis. */
export const ioError = (path: string, operation: "read" | "write" = "read") => (error: unknown): ArtifactError =>
  new ArtifactError({
    path,
    reason: operation === "write" ? "unwritable" : error instanceof PlatformError.PlatformError && error.reason._tag === "NotFound" ? "not-found" : "unreadable",
    detail: String(error),
  });

type Fs = FileSystem.FileSystem | Path.Path;

/** Every read here moves this much at a time; encoders downstream see the same boundaries on every run. */
const chunkSize = 64 * 1024;

export const sha256 = (data: Uint8Array): Effect.Effect<Sha256, never, Crypto.Crypto> =>
  Crypto.Crypto.use((crypto) => crypto.digest("SHA-256", data)).pipe(Effect.map((digest) => Encoding.encodeHex(digest) as Sha256), Effect.orDie);

/** Read metadata without opening the file's contents. */
export const file = (path: string, producedBy: Producer): Effect.Effect<File, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(path);
    const info = yield* fs.stat(absolute).pipe(Effect.mapError(ioError(absolute)));
    if (info.type !== "File") return yield* new ArtifactError({ path: absolute, reason: "not-a-file" });
    if (!Number.isSafeInteger(Number(info.size))) return yield* new ArtifactError({ path: absolute, reason: "unreadable", detail: "file exceeds the maximum safe byte count" });
    return { kind: "file", path: absolute, bytes: Number(info.size), producedBy };
  });

/** Hash through a scoped handle in bounded chunks. */
const hashRegular = (path: string) => Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const unreadable = ioError(path);
  const handle = yield* fs.open(path).pipe(Effect.mapError(unreadable));
  const info = yield* handle.stat.pipe(Effect.mapError(unreadable));
  if (info.type !== "File") return yield* new ArtifactError({ path, reason: "not-a-file" });
  const buffer = new Uint8Array(chunkSize), hash = incrementalSha256.create();
  let bytes = 0;
  while (true) {
    const count = Number(yield* handle.read(buffer).pipe(Effect.mapError(unreadable)));
    if (count === 0) break;
    hash.update(buffer.subarray(0, count));
    bytes += count;
    if (!Number.isSafeInteger(bytes)) return yield* unreadable("file exceeds the maximum safe byte count");
  }
  if (bytes !== Number(info.size)) return yield* new ArtifactError({ path, reason: "changed" });
  return { bytes, sha256: Encoding.encodeHex(hash.digest()) as Sha256 };
}));

export const executable = (
  path: string,
  producedBy: Producer,
  expected?: Target,
): Effect.Effect<Executable, ArtifactError | Inspect.InspectError | Inspect.TargetMismatch, Fs> =>
  Effect.gen(function*() {
    const current = yield* file(path, producedBy);
    const facts = yield* Inspect.inspect(current.path);
    const target = yield* Inspect.resolveTarget(current.path, facts, expected);
    return {
      ...current,
      kind: "executable" as const,
      target,
      format: facts.format,
    };
  });

/** Observe a directory tree. Symlinks are recorded, never followed. */
export const directory = (root: string, producedBy: Producer): Effect.Effect<Directory, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(root);
    const info = yield* fs.stat(absolute).pipe(
      Effect.mapError(ioError(absolute)),
    );
    if (info.type !== "Directory") return yield* new ArtifactError({ path: absolute, reason: "not-a-directory" });
    const names = yield* fs.readDirectory(absolute).pipe(
      Effect.mapError(ioError(absolute)),
    );
    const entries: Entry[] = [];
    let total = 0;
    // Breadth-first work queue: newly discovered directory children join the tail.
    for (let index = 0; index < names.length; index++) {
      const name = names[index]!;
      const full = p.join(absolute, name);
      const rel = name.split(p.sep).join("/");
      // stat follows links; distinguish them before reading bytes or traversing children.
      const link = yield* readLink(full).pipe(Effect.mapError(ioError(full)));
      if (link !== undefined) {
        entries.push({ path: rel, kind: "symlink", bytes: 0, mode: 0o777, linkTarget: link });
        continue;
      }
      const stat = yield* fs.stat(full).pipe(
        Effect.mapError(ioError(full)),
      );
      if (stat.type === "Directory") {
        entries.push({ path: rel, kind: "directory", bytes: 0, mode: stat.mode & 0o7777 });
        const children = yield* fs.readDirectory(full).pipe(
          Effect.mapError(ioError(full)),
        );
        names.push(...children.map((child) => p.join(name, child)));
      } else {
        if (stat.type !== "File") return yield* new ArtifactError({ path: full, reason: "not-a-file" });
        const member = { bytes: Number(stat.size) };
        total += member.bytes;
        if (!Number.isSafeInteger(total)) return yield* new ArtifactError({ path: absolute, reason: "unreadable", detail: "directory exceeds the maximum safe byte count" });
        entries.push({ path: rel, kind: "file", bytes: member.bytes, mode: stat.mode & 0o7777 });
      }
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return {
      kind: "directory" as const,
      path: absolute,
      bytes: total,
      producedBy,
      rootMode: info.mode & 0o7777,
      entries,
    };
  });

/** Opt in to content identity. Files hash their bytes; directories hash each member
 * and the sorted manifest. Schema decoding alone never reads the filesystem. */
export function withSha256<A extends Artifact>(artifact: A): Effect.Effect<WithSha256<A>, ArtifactError, Fs>;
export function withSha256(artifact: Artifact): Effect.Effect<HashedArtifact, ArtifactError, Fs> {
  return Effect.gen(function*() {
    const p = yield* Path.Path;
    if (artifact.kind !== "directory") {
      const path = p.resolve(artifact.path);
      return { ...artifact, path, ...yield* hashRegular(path) };
    }
    const current = yield* directory(artifact.path, artifact.producedBy);
    const entries: HashedEntry[] = [];
    let bytes = 0;
    for (const entry of current.entries) {
      if (entry.kind !== "file") entries.push(entry);
      else {
        const identity = yield* hashRegular(p.join(current.path, entry.path));
        bytes += identity.bytes;
        if (!Number.isSafeInteger(bytes)) return yield* new ArtifactError({ path: current.path, reason: "unreadable", detail: "directory exceeds the maximum safe byte count" });
        entries.push({ ...entry, ...identity });
      }
    }
    return { ...artifact, ...current, entries, bytes, sha256: manifestDigest(entries) };
  });
}

/** Stream current file contents without requiring a recorded content identity. */
export const stream = (artifact: Regular): Stream.Stream<Uint8Array, ArtifactError, FileSystem.FileSystem> =>
  Stream.unwrap(FileSystem.FileSystem.use((fs) => Effect.succeed(fs.stream(artifact.path, { chunkSize }).pipe(
    Stream.mapError(ioError(artifact.path)),
  ))));

/** Copy current contents. Same-file aliases are handled by the filesystem's native copy. */
export const copy = (artifact: Regular, destination: string): Effect.Effect<void, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const target = p.resolve(destination);
    if (target === p.resolve(artifact.path)) return;
    yield* fs.makeDirectory(p.dirname(target), { recursive: true }).pipe(Effect.mapError(ioError(target, "write")));
    yield* fs.copyFile(artifact.path, target).pipe(Effect.mapError((error) => new ArtifactError({
      path: artifact.path, reason: "copy-failed", detail: `${artifact.path} -> ${target}: ${String(error)}`,
    })));
  });

const invalidMetadata = (path: string) => (error: unknown) => new ArtifactError({ path, reason: "invalid-metadata", detail: String(error) });

/** Decoded records can carry anything; check the schema before trusting a field such as `bytes` or `target`. */
const checkRecord = (artifact: HashedArtifact) =>
  Schema.decodeUnknownEffect(HashedArtifact)(artifact).pipe(Effect.mapError(invalidMetadata(artifact.path)));

/** The header must still agree with the recorded target, whichever way the header was read. */
const checkTarget = <E, R>(artifact: Executable, facts: Effect.Effect<Inspect.Facts, E, R>) =>
  facts.pipe(
    Effect.flatMap((current) => Inspect.resolveTarget(artifact.path, current, artifact.target)),
    Effect.mapError(invalidMetadata(artifact.path)),
  );

/** Artifacts record bytes; call verify when consuming them later in a pipeline. */
export const verify = <A extends HashedArtifact>(artifact: A): Effect.Effect<A, ArtifactError, Fs> =>
  Effect.gen(function*() {
    yield* checkRecord(artifact);
    const current = yield* withSha256(artifact);
    const rootChanged = artifact.kind === "directory" && current.kind === "directory" && current.rootMode !== artifact.rootMode;
    if (current.sha256 !== artifact.sha256 || current.bytes !== artifact.bytes || rootChanged) {
      return yield* new ArtifactError({ path: artifact.path, reason: "changed" });
    }
    if (artifact.kind === "executable") yield* checkTarget(artifact, Inspect.inspect(artifact.path));
    return artifact;
  });

/**
 * Read the entire verified file into one buffer, bounded to its recorded size.
 * Files that grow are rejected without buffering the excess. Use verify when only integrity is needed.
 */
export const readVerified = (artifact: HashedRegular): Effect.Effect<Uint8Array, ArtifactError, Fs> =>
  Effect.scoped(Effect.gen(function*() {
    yield* checkRecord(artifact);
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const path = p.resolve(artifact.path);
    const unreadable = ioError(path);
    const changed = () => new ArtifactError({ path, reason: "changed" as const });
    const info = yield* fs.stat(path).pipe(Effect.mapError(ioError(path)));
    if (info.type !== "File") return yield* new ArtifactError({ path, reason: "not-a-file" });
    const handle = yield* fs.open(path).pipe(Effect.mapError(unreadable));
    const opened = yield* handle.stat.pipe(Effect.mapError(unreadable));
    if (opened.type !== "File" || opened.size !== BigInt(artifact.bytes)) return yield* changed();
    const contents = yield* Effect.try({ try: () => new Uint8Array(artifact.bytes), catch: () => new ArtifactError({ path, reason: "unreadable", detail: "file exceeds the runtime's supported buffer size" }) });
    const hash = incrementalSha256.create();
    let offset = 0;
    while (offset < contents.length) {
      const chunk = contents.subarray(offset, Math.min(offset + chunkSize, contents.length));
      const count = Number(yield* handle.read(chunk).pipe(Effect.mapError(unreadable)));
      if (count === 0) return yield* changed();
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
    // One byte past the recorded size detects growth since the stat without reading the excess.
    const excess = yield* handle.read(new Uint8Array(1)).pipe(Effect.mapError(unreadable));
    if (excess !== 0) return yield* changed();
    if (Encoding.encodeHex(hash.digest()) !== artifact.sha256) return yield* changed();
    if (artifact.kind === "executable") yield* checkTarget(artifact, Inspect.parse(contents));
    return contents;
  }));

/**
 * Stream the file's bytes while hashing them. The stream fails at EOF when the bytes
 * differ from the record, so whatever a consumer wrote from it is provisional until the
 * stream completes; `Commit.atomic` discards staged output on failure. An executable's
 * header is checked against its recorded target before the first chunk.
 */
export const streamVerified = (artifact: HashedRegular): Stream.Stream<Uint8Array, ArtifactError, Fs> =>
  Stream.unwrap(Effect.gen(function*() {
    yield* checkRecord(artifact);
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const path = p.resolve(artifact.path);
    const changed = () => new ArtifactError({ path, reason: "changed" as const });
    const info = yield* fs.stat(path).pipe(Effect.mapError(ioError(path)));
    if (info.type !== "File") return yield* new ArtifactError({ path, reason: "not-a-file" });
    if (info.size !== BigInt(artifact.bytes)) return yield* changed();
    if (artifact.kind === "executable") yield* checkTarget(artifact, Inspect.inspect(path));
    const hash = incrementalSha256.create();
    let total = 0;
    // One byte past the recorded size detects growth without reading all of it.
    return fs.stream(path, { chunkSize, bytesToRead: artifact.bytes + 1 }).pipe(
      Stream.mapError(ioError(path)),
      Stream.tap((chunk) =>
        Effect.sync(() => {
          hash.update(chunk);
          total += chunk.byteLength;
        })
      ),
      Stream.onEnd(Effect.suspend(() =>
        total === artifact.bytes && Encoding.encodeHex(hash.digest()) === artifact.sha256 ? Effect.void : Effect.fail(changed())
      )),
    );
  }));

/**
 * Copy through `streamVerified`. Failure attempts to remove incomplete output; use
 * `Commit.atomic` when publication must be all-or-nothing. An equal source and
 * destination path is verified in place.
 */
export const copyVerified = (artifact: HashedRegular, destination: string): Effect.Effect<void, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const target = p.resolve(destination);
    if (target === p.resolve(artifact.path)) return yield* Effect.asVoid(verify(artifact));
    const unwritable = ioError(target, "write");
    yield* fs.makeDirectory(p.dirname(target), { recursive: true }).pipe(Effect.mapError(unwritable));
    yield* Stream.run(streamVerified(artifact), fs.sink(target)).pipe(
      Effect.mapError((error) => error instanceof ArtifactError ? error : unwritable(error)),
      Effect.onError(() => fs.remove(target, { force: true }).pipe(Effect.ignore)),
    );
  });

/**
 * Encode the core file handoff only. Provider refinements (for example signatures,
 * runtime versions, Apple product types and tickets) are intentionally omitted.
 * Persist richer records with their provider schema and Effect Schema.encodeSync.
 */
export const encode = Schema.encodeSync(Schema.Array(Artifact));
/** Decode and validate core records; provider refinements are intentionally omitted. */
export const decode = Schema.decodeUnknownSync(Schema.Array(Artifact));

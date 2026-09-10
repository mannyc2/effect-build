import { sha256 as incrementalSha256 } from "@noble/hashes/sha2.js";
import { Crypto, Effect, Encoding, FileSystem, Path, PlatformError, Schema, Stream } from "effect";
import * as Inspect from "./Executable.js";
import { readLink } from "./internal/fileSystem.js";
import { parts, Target } from "./Target.js";

const Bytes = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const Mode = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0o7777));

export const Producer = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  path: Schema.optionalKey(Schema.String),
  sha256: Schema.optionalKey(Digest),
});
export type Producer = typeof Producer.Type;

const Common = {
  path: Schema.NonEmptyString,
  bytes: Bytes,
  sha256: Digest,
  producedBy: Producer,
};

export const File = Schema.Struct({ kind: Schema.Literal("file"), ...Common });
export type File = typeof File.Type;

export const Executable = Schema.Struct({
  kind: Schema.Literal("executable"),
  ...Common,
  target: Target,
  format: Schema.Literals(["elf", "mach-o", "pe"] as const),
}).check(Schema.makeFilter((value) => parts(value.target).format === value.format ? undefined : "executable format must match its target"));
export type Executable = typeof Executable.Type;

const EntryCommon = {
  path: Schema.NonEmptyString.check(Schema.makeFilter((path) =>
    !path.includes("\0") && !path.startsWith("/") && path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
      ? undefined : "entry path must be a normalized relative path")),
  mode: Mode,
};
/** Each kind has exactly the metadata that describes its filesystem object. */
export const Entry = Schema.Union([
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("file"), bytes: Bytes, sha256: Digest, linkTarget: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("directory"), bytes: Schema.Literal(0), sha256: Schema.optionalKey(Schema.Never), linkTarget: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ ...EntryCommon, kind: Schema.Literal("symlink"), bytes: Schema.Literal(0), sha256: Schema.optionalKey(Schema.Never), linkTarget: Schema.NonEmptyString }),
]);
export type Entry = typeof Entry.Type;

const encoder = new TextEncoder();
// Persisted identity: SHA-256 of UTF-8 JSON tuples in this exact field order.
// Missing fields become null in JSON arrays; changing that or the order changes existing identities.
const manifestDigest = (entries: readonly Entry[]): string => {
  const hash = incrementalSha256.create().update(encoder.encode("["));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (i > 0) hash.update(encoder.encode(","));
    hash.update(encoder.encode(JSON.stringify([e.kind, e.mode, e.bytes, e.sha256, e.linkTarget, e.path])));
  }
  return Encoding.encodeHex(hash.update(encoder.encode("]")).digest());
};

/** `sha256` of a directory is the hash of its sorted entry manifest. The root's
 * own mode travels beside the digest — like an executable's target — and verify
 * checks both. */
export const Directory = Schema.Struct({
  kind: Schema.Literal("directory"),
  ...Common,
  rootMode: Mode,
  entries: Schema.Array(Entry),
}).check(Schema.makeFilter((value) => {
  let bytes = 0, previous: string | undefined;
  const entries = new Map<string, Entry>();
  for (const entry of value.entries) {
    if (previous !== undefined && previous >= entry.path) return "directory entries must be sorted and unique";
    const parent = entry.path.slice(0, entry.path.lastIndexOf("/"));
    if (entry.path.includes("/") && entries.get(parent)?.kind !== "directory") return "directory entries must include their parent directory";
    bytes += entry.bytes;
    previous = entry.path;
    entries.set(entry.path, entry);
  }
  if (!Number.isSafeInteger(bytes) || bytes !== value.bytes) return "directory bytes must equal its file entries";
  return manifestDigest(value.entries) === value.sha256 ? undefined : "directory digest must match its entry manifest";
}));
export type Directory = typeof Directory.Type;

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

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;

/** Every read here moves this much at a time; encoders downstream see the same boundaries on every run. */
const chunkSize = 64 * 1024;

export const sha256 = (data: Uint8Array): Effect.Effect<string, never, Crypto.Crypto> =>
  Crypto.Crypto.use((crypto) => crypto.digest("SHA-256", data)).pipe(Effect.map(Encoding.encodeHex), Effect.orDie);

/** Hash bounded chunks; large executables and directory members never require whole-file buffers. */
const hashRegular = (path: string) => Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const absolute = p.resolve(path);
  const info = yield* fs.stat(absolute).pipe(Effect.mapError(ioError(absolute)));
  if (info.type !== "File") return yield* new ArtifactError({ path: absolute, reason: "not-a-file" });
  if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) return yield* new ArtifactError({ path: absolute, reason: "unreadable", detail: "file exceeds the maximum safe byte count" });
  const unreadable = ioError(absolute);
  const handle = yield* fs.open(absolute).pipe(Effect.mapError(unreadable));
  const buffer = new Uint8Array(chunkSize), hash = incrementalSha256.create();
  let bytes = 0;
  while (true) {
    const count = Number(yield* handle.read(buffer).pipe(Effect.mapError(unreadable)));
    if (count === 0) break;
    hash.update(buffer.subarray(0, count));
    bytes += count;
    if (!Number.isSafeInteger(bytes)) return yield* unreadable("file exceeds the maximum safe byte count");
  }
  if (bytes !== Number(info.size)) return yield* new ArtifactError({ path: absolute, reason: "changed" });
  return { absolute, bytes, digest: Encoding.encodeHex(hash.digest()) };
}));

export const file = (path: string, producedBy: Producer): Effect.Effect<File, ArtifactError, Fs> =>
  hashRegular(path).pipe(
    Effect.map(({ absolute, bytes, digest }) => ({ kind: "file" as const, path: absolute, bytes, sha256: digest, producedBy })),
  );

export const executable = (
  path: string,
  producedBy: Producer,
  expected?: Target,
): Effect.Effect<Executable, ArtifactError | Inspect.InspectError | Inspect.TargetMismatch, Fs> =>
  Effect.gen(function*() {
    const { absolute, bytes, digest } = yield* hashRegular(path);
    const facts = yield* Inspect.inspect(absolute);
    const target = yield* Inspect.resolveTarget(absolute, facts, expected);
    return {
      kind: "executable" as const,
      path: absolute,
      bytes,
      sha256: digest,
      producedBy,
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
        const member = yield* hashRegular(full);
        total += member.bytes;
        if (!Number.isSafeInteger(total)) return yield* new ArtifactError({ path: absolute, reason: "unreadable", detail: "directory exceeds the maximum safe byte count" });
        entries.push({ path: rel, kind: "file", bytes: member.bytes, mode: stat.mode & 0o7777, sha256: member.digest });
      }
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    // JSON separates entry fields even when a filename or symlink target contains newlines.
    return {
      kind: "directory" as const,
      path: absolute,
      bytes: total,
      sha256: manifestDigest(entries),
      producedBy,
      rootMode: info.mode & 0o7777,
      entries,
    };
  });

const invalidMetadata = (path: string) => (error: unknown) => new ArtifactError({ path, reason: "invalid-metadata", detail: String(error) });

/** Decoded records can carry anything; check the schema before trusting a field such as `bytes` or `target`. */
const checkRecord = (artifact: Artifact) =>
  Schema.decodeUnknownEffect(Artifact)(artifact).pipe(Effect.mapError(invalidMetadata(artifact.path)));

/** The header must still agree with the recorded target, whichever way the header was read. */
const checkTarget = <E, R>(artifact: Executable, facts: Effect.Effect<Inspect.Facts, E, R>) =>
  facts.pipe(
    Effect.flatMap((current) => Inspect.resolveTarget(artifact.path, current, artifact.target)),
    Effect.mapError(invalidMetadata(artifact.path)),
  );

/** Artifacts record bytes; call verify when consuming them later in a pipeline. */
export const verify = <A extends Artifact>(artifact: A): Effect.Effect<A, ArtifactError, Fs> =>
  Effect.gen(function*() {
    yield* checkRecord(artifact);
    const current = artifact.kind === "directory"
      ? yield* directory(artifact.path, artifact.producedBy)
      : yield* file(artifact.path, artifact.producedBy);
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
export const readVerified = (artifact: Regular): Effect.Effect<Uint8Array, ArtifactError, Fs> =>
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
    const excess = yield* handle.read(new Uint8Array(1)).pipe(Effect.mapError(unreadable));
    if (excess !== 0n) return yield* changed();
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
export const streamVerified = (artifact: Regular): Stream.Stream<Uint8Array, ArtifactError, Fs> =>
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
 * Copy a file through `streamVerified`, so `destination` ends up holding exactly the
 * recorded bytes or nothing at all. A destination equal to the source is verified in place.
 */
export const copyVerified = (artifact: Regular, destination: string): Effect.Effect<void, ArtifactError, Fs> =>
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

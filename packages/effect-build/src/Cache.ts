import { sha256 as incrementalSha256 } from "@noble/hashes/sha2.js";
import { Context, Crypto, Data, Effect, Encoding, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { KeyValueStore } from "effect/unstable/persistence";
import * as Artifact from "./Artifact.js";
import * as Commit from "./Commit.js";
import * as Target from "./Target.js";
import * as Tool from "./Tool.js";
import { manifestDigest } from "./internal/directoryIdentity.js";

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
const format = "effect-build-cache-v3";

/** The complete inputs the caller declares. Paths do not contribute to artifact/tool identity. */
export interface Key {
  readonly operation: string;
  readonly tool: Tool.Resolved | Artifact.Producer;
  readonly inputs: readonly Artifact.HashedArtifact[];
  /** Plain JSON data, including all options and environment values that affect output. */
  readonly options?: unknown;
}

export class Objects extends Context.Service<Objects, { readonly directory: string }>()("effect-build/Cache/Objects") {}

/** Provide a dedicated object directory. Directory creation is deferred until ingest. */
export const objects = (directory: string): Layer.Layer<Objects, never, Path.Path> =>
  Layer.effect(Objects)(Path.Path.use((path) => Effect.succeed({ directory: path.resolve(directory) })));

// JSON.stringify alone conflates Map/Set/Date, non-finite numbers, sparse arrays and functions.
// Encode plain data ourselves so every accepted value has one unambiguous representation.
const canonical = (value: unknown, ancestors = new Set<object>()): string => {
  if (value === null) return "null";
  switch (typeof value) {
    case "string": case "boolean": return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("numbers must be finite");
      return JSON.stringify(value);
    case "object": {
      if (ancestors.has(value)) throw new Error("cyclic data is not JSON");
      ancestors.add(value);
      try {
        if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("symbol keys are not JSON");
        if (Array.isArray(value)) {
          const items: string[] = [];
          for (let i = 0; i < value.length; i++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
            if (descriptor === undefined || !("value" in descriptor)) throw new Error("arrays must be dense data");
            items.push(canonical(descriptor.value, ancestors));
          }
          if (Object.keys(value).length !== value.length) throw new Error("array properties are not JSON");
          return `[${items.join(",")}]`;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
          throw new Error("options must contain plain objects and arrays");
        }
        const entries: string[] = [];
        for (const key of Object.keys(value).sort()) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!("value" in descriptor)) throw new Error("accessors are not JSON");
          if (descriptor.value !== undefined) entries.push(`${JSON.stringify(key)}:${canonical(descriptor.value, ancestors)}`);
        }
        return `{${entries.join(",")}}`;
      } finally { ancestors.delete(value); }
    }
    default: throw new Error(`${typeof value} is not JSON data`);
  }
};

const components = (input: Key) => Effect.try({
  try: () => {
    const issue = Tool.argumentIssue(input.operation);
    if (issue !== undefined) throw new Error(`operation ${issue}`);
    const tool = Schema.decodeUnknownSync(Artifact.Producer)(input.tool);
    const inputs = input.inputs.map((record) => {
      const artifact = Schema.decodeUnknownSync(Artifact.HashedArtifact)(record);
      return {
        kind: artifact.kind,
        sha256: artifact.sha256,
        ...(artifact.kind === "executable" ? { target: artifact.target } : {}),
        // Directory's root mode is carried beside, rather than inside, its manifest digest.
        ...(artifact.kind === "directory" ? { rootMode: artifact.rootMode } : {}),
      };
    });
    return canonical({ format, host: Target.host() ?? "unknown", operation: input.operation,
      tool: { name: tool.name, version: tool.version, sha256: tool.sha256 }, inputs, options: input.options });
  },
  catch: (error) => new Tool.InputInvalid({ operation: "Cache.key", reason: String(error) }),
});

const digest = (encoded: string) => Artifact.sha256(new TextEncoder().encode(encoded)).pipe(Effect.map((hash) => `${format}:${hash}`));

/** Hash canonical declared inputs, tool identity, host and index format. This does not discover dependencies. */
export const key = (input: Key): Effect.Effect<string, Tool.InputInvalid, Crypto.Crypto> => components(input).pipe(Effect.flatMap(digest));

// The caller's codec owns metadata. The cache adds only content digests.
const Digests = Schema.Struct({
  sha256: Artifact.Sha256,
  files: Schema.optionalKey(Schema.Record(Schema.String, Artifact.Sha256)),
});
const Entry = Schema.Struct({
  format: Schema.Literal(format),
  components: Schema.String,
  artifact: Schema.Unknown,
  digests: Digests,
  mode: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0o7777)),
});
class Miss extends Data.TaggedError("CacheMiss")<{}> {}

const fileRecord = (path: string, entry: Extract<Artifact.Entry, { kind: "file" }>, producedBy: Artifact.Producer): Artifact.File =>
  ({ kind: "file", path, bytes: entry.bytes, producedBy });

const objectPath = (directory: string, hash: string) => Path.Path.use((p) => Effect.succeed(p.join(directory, hash)));
const changed = (path: string) => new Artifact.ArtifactError({ path, reason: "changed" });

const ingestFile = (artifact: Artifact.Regular, directory: string) => Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const info = yield* fs.stat(artifact.path).pipe(Effect.mapError(Artifact.ioError(artifact.path)));
  if (info.type !== "File" || info.size !== BigInt(artifact.bytes)) return yield* changed(artifact.path);
  yield* fs.makeDirectory(directory, { recursive: true }).pipe(Effect.mapError(Artifact.ioError(directory, "write")));
  const temporary = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".effect-build-" }).pipe(Effect.mapError(Artifact.ioError(directory, "write")));
  const staged = p.join(temporary, "object");
  const hash = incrementalSha256.create();
  let bytes = 0;
  const source = fs.stream(artifact.path, { chunkSize: 64 * 1024, bytesToRead: artifact.bytes + 1 }).pipe(
    Stream.mapError(Artifact.ioError(artifact.path)),
    Stream.tap((chunk) => Effect.sync(() => { hash.update(chunk); bytes += chunk.byteLength; })),
  );
  yield* Stream.run(source, fs.sink(staged)).pipe(
    Effect.mapError((error) => error instanceof Artifact.ArtifactError ? error : Artifact.ioError(staged, "write")(error)),
  );
  if (bytes !== artifact.bytes) return yield* changed(artifact.path);
  if (artifact.kind === "executable") yield* Artifact.executable(staged, artifact.producedBy, artifact.target);
  const sha256 = Encoding.encodeHex(hash.digest()) as Artifact.Sha256;
  const destination = yield* objectPath(directory, sha256);
  yield* fs.rename(staged, destination).pipe(Effect.mapError(Artifact.ioError(destination, "write")), Effect.uninterruptible);
  return { identity: { ...artifact, sha256 }, mode: info.mode & 0o7777 };
}));

const ingest = (artifact: Artifact.Artifact, directory: string) => Effect.gen(function*() {
  if (artifact.kind !== "directory") return yield* ingestFile(artifact, directory);
  const current = yield* Artifact.directory(artifact.path, artifact.producedBy);
  if (canonical(current) !== canonical(artifact)) return yield* changed(artifact.path);
  const p = yield* Path.Path;
  const entries: Artifact.HashedEntry[] = [];
  for (const entry of artifact.entries) {
    if (entry.kind !== "file") entries.push(entry);
    else {
      const member = yield* ingestFile(fileRecord(p.join(artifact.path, ...entry.path.split("/")), entry, artifact.producedBy), directory);
      if (member.mode !== entry.mode) return yield* changed(artifact.path);
      entries.push({ ...entry, sha256: member.identity.sha256 });
    }
  }
  return { identity: { ...artifact, entries, sha256: manifestDigest(entries) }, mode: artifact.rootMode };
});

const addDigests = (artifact: Artifact.Artifact, digests: typeof Digests.Type) => {
  if ("sha256" in artifact && artifact.sha256 !== digests.sha256) return Effect.fail(new Miss());
  if (artifact.kind !== "directory") {
    return digests.files === undefined
      ? Schema.decodeUnknownEffect(Artifact.HashedArtifact)({ ...artifact, sha256: digests.sha256 })
      : Effect.fail(new Miss());
  }
  const files = digests.files;
  if (files === undefined || Object.keys(files).length !== artifact.entries.filter((entry) => entry.kind === "file").length) return Effect.fail(new Miss());
  if (artifact.entries.some((entry) => entry.kind === "file" && "sha256" in entry && entry.sha256 !== files[entry.path])) return Effect.fail(new Miss());
  return Schema.decodeUnknownEffect(Artifact.HashedArtifact)({ ...artifact, sha256: digests.sha256,
    entries: artifact.entries.map((entry) => entry.kind === "file" ? { ...entry, sha256: files[entry.path] } : entry),
  });
};

const copyFile = (artifact: Artifact.HashedRegular, directory: string | undefined, destination: string, exclusive = false) => Effect.gen(function*() {
  const path = directory === undefined ? artifact.path : yield* objectPath(directory, artifact.sha256);
  const source = { ...artifact, path };
  const fs = yield* FileSystem.FileSystem;
  const copy = exclusive
    ? Stream.run(Artifact.streamVerified(source), fs.sink(destination, { flag: "wx" })).pipe(
      Effect.mapError((error) => error instanceof Artifact.ArtifactError ? error : Artifact.ioError(destination, "write")(error)),
    )
    : Artifact.copyVerified(source, destination);
  yield* copy.pipe(
    Effect.catch((error) => Effect.fail<Miss | Artifact.ArtifactError>(directory !== undefined && error.path === path ? new Miss() : error)),
  );
});

const restore = (artifact: Artifact.HashedArtifact, directory: string | undefined, destination: string, mode: number) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  if (artifact.kind === "directory") {
    // A manifest can originate on another host. Reject names that project to different
    // path components here (notably POSIX backslashes on Windows) before creating links.
    for (const entry of artifact.entries) {
      const path = p.resolve(destination, ...entry.path.split("/"));
      if (!path.startsWith(`${destination}${p.sep}`) || p.relative(destination, path).split(p.sep).join("/") !== entry.path) {
        return yield* new Miss();
      }
    }
    yield* fs.makeDirectory(destination, { recursive: true }).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
    for (const entry of artifact.entries) {
      const path = p.resolve(destination, ...entry.path.split("/"));
      const writeError = Artifact.ioError(path, "write");
      if (entry.kind === "directory") yield* fs.makeDirectory(path).pipe(Effect.mapError(writeError));
      else if (entry.kind === "symlink") yield* fs.symlink(entry.linkTarget, path).pipe(Effect.mapError(writeError));
      else {
        const source = { ...fileRecord(p.join(artifact.path, ...entry.path.split("/")), entry, artifact.producedBy), sha256: entry.sha256 };
        yield* copyFile(source, directory, path, true);
        yield* fs.chmod(path, entry.mode).pipe(Effect.mapError(writeError));
      }
    }
    // Set directory permissions after children, so read-only trees can still be reconstructed.
    for (const entry of [...artifact.entries].reverse()) {
      if (entry.kind === "directory") {
        const path = p.join(destination, ...entry.path.split("/"));
        yield* fs.chmod(path, entry.mode).pipe(Effect.mapError(Artifact.ioError(path, "write")));
      }
    }
    yield* fs.chmod(destination, artifact.rootMode).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  } else {
    yield* copyFile(artifact, directory, destination);
    yield* fs.chmod(destination, mode).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  }
  return { ...artifact, path: destination };
});

export interface Options extends Commit.ProducerOptions {
  readonly key: Key;
  readonly outfile: string;
}

type CacheError = Tool.InputInvalid | Artifact.ArtifactError | Commit.CommitError;
type CacheEnv = Fs | Objects | KeyValueStore.KeyValueStore;

const cacheWith = <A extends Artifact.Artifact, RD, RE>(input: Options, schema: Schema.Codec<A, unknown, RD, RE>) =>
  <E, R>(producer: Effect.Effect<A, E, R>): Effect.Effect<A, E | CacheError, R | RD | RE | CacheEnv> => Effect.gen(function*() {
    const issue = Tool.argumentIssue(input.outfile);
    if (issue !== undefined) return yield* new Tool.InputInvalid({ operation: "Cache.cached", reason: `outfile ${issue}` });
    const encoded = yield* components(input.key);
    const id = yield* digest(encoded);
    const store = yield* KeyValueStore.KeyValueStore;
    const { directory } = yield* Objects;
    const p = yield* Path.Path;
    const destination = p.resolve(input.outfile);
    const decode = Effect.gen(function*() {
      const value = yield* store.get(id);
      if (value === undefined) return undefined;
      const json: unknown = yield* Effect.try(() => JSON.parse(value));
      const entry = yield* Schema.decodeUnknownEffect(Entry)(json);
      if (entry.components !== encoded) return undefined;
      const artifact = yield* Schema.decodeUnknownEffect(schema)(entry.artifact);
      const identity = yield* addDigests(artifact, entry.digests);
      return { artifact, identity, mode: entry.mode };
    }).pipe(Effect.orElseSucceed(() => undefined));
    const entry = yield* decode;
    if (entry !== undefined) {
      const staging = entry.identity.kind === "directory" ? "sibling" : "nested";
      const publish = (identity: Artifact.HashedArtifact, objects: string | undefined) => Commit.output(destination,
        (path) => restore(identity, objects, path, entry.mode), input, staging);
      // Atomic staging already keeps corrupt bytes away from the destination. Direct
      // output needs a private verified copy before it can touch an existing output.
      const hit = yield* (input.atomic === false
        ? Effect.scoped(Effect.gen(function*() {
          const staged = yield* Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem;
            const scratch = yield* fs.makeTempDirectoryScoped();
            return yield* restore(entry.identity, directory, p.join(scratch, "output"), entry.mode);
          }).pipe(Effect.catch(() => Effect.fail(new Miss())));
          return yield* publish(staged, undefined);
        }))
        : publish(entry.identity, directory)).pipe(Effect.catchTag("CacheMiss", () => Effect.succeed(undefined)));
      if (hit !== undefined) return { ...entry.artifact, path: hit.path };
    }
    const result = yield* producer;
    if (p.resolve(result.path) !== destination) {
      return yield* new Tool.InputInvalid({ operation: "Cache.cached", reason: "outfile must equal the producer's output path", path: result.path });
    }
    yield* Effect.gen(function*() {
      const encodedArtifact = yield* Schema.encodeEffect(schema)(result);
      const core = yield* Schema.decodeUnknownEffect(Artifact.Artifact)(result);
      const { identity, mode } = yield* ingest(core, directory);
      const identified = yield* Schema.encodeUnknownEffect(schema)({ ...result, ...identity });
      if (canonical(encodedArtifact) !== canonical(identified)) return yield* changed(result.path);
      const digests: typeof Digests.Type = { sha256: identity.sha256,
        ...(identity.kind === "directory" ? { files: Object.fromEntries(identity.entries.flatMap((entry) => entry.kind === "file" ? [[entry.path, entry.sha256]] : [])) } : {}),
      };
      const value = canonical({ format, components: encoded, artifact: encodedArtifact, digests, mode });
      yield* store.set(id, value);
    }).pipe(Effect.catch((error) => Effect.logWarning("Cache ingest failed", { operation: input.key.operation, detail: String(error) })));
    return result;
  });

/** Restore a verified output or run and hash the producer's output for storage. Storage failures are misses;
 * destination/commit errors remain typed failures. Provide a schema to retain a precise kind
 * or provider refinement; the default codec returns the core Artifact union. */
export function cached<A extends Artifact.Artifact, RD = never, RE = never>(input: Options & { readonly schema: Schema.Codec<A, unknown, RD, RE> }):
  <E, R>(producer: Effect.Effect<A, E, R>) => Effect.Effect<A, E | CacheError, R | RD | RE | CacheEnv>;
export function cached(input: Options):
  <E, R>(producer: Effect.Effect<Artifact.Artifact, E, R>) => Effect.Effect<Artifact.Artifact, E | CacheError, R | CacheEnv>;
export function cached(input: Options & { readonly schema?: Schema.Codec<Artifact.Artifact, unknown, unknown, unknown> }) {
  return cacheWith(input, input.schema ?? Artifact.Artifact);
}

/** Clear a dedicated index and object directory. Do not share these resources with another application. */
export const clear = Effect.gen(function*() {
  const store = yield* KeyValueStore.KeyValueStore;
  const { directory } = yield* Objects;
  const fs = yield* FileSystem.FileSystem;
  yield* store.clear;
  yield* fs.remove(directory, { recursive: true, force: true }).pipe(Effect.mapError(Artifact.ioError(directory, "write")));
});

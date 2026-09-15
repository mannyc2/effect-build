import { Context, Crypto, Data, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { KeyValueStore } from "effect/unstable/persistence";
import * as Artifact from "./Artifact.js";
import * as Commit from "./Commit.js";
import * as Target from "./Target.js";
import * as Tool from "./Tool.js";

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
const format = "effect-build-cache-v2";

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

const Entry = Schema.Struct({
  format: Schema.Literal(format),
  components: Schema.String,
  artifact: Schema.Unknown,
  identity: Artifact.HashedArtifact,
  mode: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0o7777)),
});
class Miss extends Data.TaggedError("CacheMiss")<{}> {}

const fileRecord = (path: string, entry: Extract<Artifact.HashedEntry, { kind: "file" }>, producedBy: Artifact.Producer): Artifact.HashedFile =>
  ({ kind: "file", path, bytes: entry.bytes, sha256: entry.sha256, producedBy });

const objectPath = (directory: string, hash: string) => Path.Path.use((p) => Effect.succeed(p.join(directory, hash)));

const ingestFile = (artifact: Artifact.HashedRegular, directory: string) => Effect.gen(function*() {
  const destination = yield* objectPath(directory, artifact.sha256);
  // Concurrent writers have private staging. Only a complete verified object becomes visible.
  yield* Commit.atomic(destination, (staged) => Artifact.copyVerified(artifact, staged).pipe(
    Effect.as({ ...artifact, path: staged }),
  ));
});

const ingest = (artifact: Artifact.HashedArtifact, directory: string) => Effect.gen(function*() {
  yield* Artifact.verify(artifact);
  if (artifact.kind !== "directory") return yield* ingestFile(artifact, directory);
  const p = yield* Path.Path;
  for (const entry of artifact.entries) {
    if (entry.kind === "file") yield* ingestFile(fileRecord(p.join(artifact.path, ...entry.path.split("/")), entry, artifact.producedBy), directory);
  }
});

const copyObject = (artifact: Artifact.HashedRegular, directory: string, destination: string) => Effect.gen(function*() {
  const path = yield* objectPath(directory, artifact.sha256);
  yield* Artifact.copyVerified({ ...artifact, path }, destination).pipe(
    Effect.catch((error) => Effect.fail<Miss | Artifact.ArtifactError>(error.path === path ? new Miss() : error)),
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
      if (!path.startsWith(`${destination}${p.sep}`)) return yield* new Miss();
      const writeError = Artifact.ioError(path, "write");
      if (entry.kind === "directory") yield* fs.makeDirectory(path).pipe(Effect.mapError(writeError));
      else if (entry.kind === "symlink") yield* fs.symlink(entry.linkTarget, path).pipe(Effect.mapError(writeError));
      else {
        const source = fileRecord(p.join(artifact.path, ...entry.path.split("/")), entry, artifact.producedBy);
        yield* directory === undefined ? Artifact.copyVerified(source, path) : copyObject(source, directory, path);
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
    yield* directory === undefined ? Artifact.copyVerified(artifact, destination) : copyObject(artifact, directory, destination);
    yield* fs.chmod(destination, mode).pipe(Effect.mapError(Artifact.ioError(destination, "write")));
  }
  return yield* Artifact.verify({ ...artifact, path: destination });
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
      const core = yield* Schema.encodeEffect(Artifact.Artifact)(artifact);
      const identityCore = yield* Schema.encodeEffect(Artifact.Artifact)(entry.identity);
      if (canonical(core) !== canonical(identityCore)) return undefined;
      const recorded = yield* Schema.encodeEffect(schema)(artifact);
      const identified = yield* Schema.encodeUnknownEffect(schema)({ ...artifact, ...entry.identity });
      if (canonical(recorded) !== canonical(identified)) return undefined;
      return { artifact, identity: entry.identity, mode: entry.mode };
    }).pipe(Effect.orElseSucceed(() => undefined));
    const entry = yield* decode;
    if (entry !== undefined) {
      // Even direct output first verifies cache objects privately. Corruption must not touch
      // an existing destination before falling back to the real producer.
      const hit = yield* Effect.scoped(Effect.gen(function*() {
        const staged = yield* Effect.gen(function*() {
          const fs = yield* FileSystem.FileSystem;
          const scratch = yield* fs.makeTempDirectoryScoped();
          return yield* restore(entry.identity, directory, p.join(scratch, "output"), entry.mode);
        }).pipe(Effect.catch(() => Effect.fail(new Miss())));
        return yield* Commit.output(destination,
          (path) => restore(staged, undefined, path, entry.mode), input, staged.kind === "directory" ? "sibling" : "nested");
      })).pipe(Effect.catchTag("CacheMiss", () => Effect.succeed(undefined)));
      if (hit !== undefined) return { ...entry.artifact, path: hit.path };
    }
    const result = yield* producer;
    if (p.resolve(result.path) !== destination) {
      return yield* new Tool.InputInvalid({ operation: "Cache.cached", reason: "outfile must equal the producer's output path", path: result.path });
    }
    yield* Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const encodedArtifact = yield* Schema.encodeEffect(schema)(result);
      const identity = yield* Artifact.withSha256(result);
      const encodedIdentity = yield* Schema.encodeEffect(Artifact.HashedArtifact)(identity);
      const identified = yield* Schema.encodeUnknownEffect(schema)(identity);
      const core = yield* Schema.encodeEffect(Artifact.Artifact)(result);
      const identityCore = yield* Schema.encodeEffect(Artifact.Artifact)(identity);
      if (canonical(core) !== canonical(identityCore) || canonical(encodedArtifact) !== canonical(identified)) {
        return yield* new Artifact.ArtifactError({ path: result.path, reason: "changed" });
      }
      const info = yield* fs.stat(result.path);
      yield* ingest(identity, directory);
      const value = canonical({ format, components: encoded, artifact: encodedArtifact, identity: encodedIdentity, mode: info.mode & 0o7777 });
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

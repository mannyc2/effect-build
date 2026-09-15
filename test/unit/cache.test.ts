import { NodeServices } from "@effect/platform-node";
import { Deferred, Effect, Fiber, FileSystem, Layer, Path, PlatformError, Schema } from "effect";
import { KeyValueStore } from "effect/unstable/persistence";
import { Artifact, Cache, Commit } from "effect-build";
import { TestArtifact } from "effect-build/testing";
import { chmod, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const producedBy = { name: "fixture", version: "1.0.0", sha256: Artifact.Sha256.make("0".repeat(64)) };
let root: string;
let cacheLayer: Layer.Layer<Cache.Objects | KeyValueStore.KeyValueStore, never, import("effect").Path.Path>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-cache-"));
  cacheLayer = Layer.merge(Cache.objects(join(root, "objects")), KeyValueStore.layerMemory);
});
afterEach(async () => { await rm(root, { force: true, recursive: true }); });
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices | Cache.Objects | KeyValueStore.KeyValueStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(cacheLayer), Effect.provide(NodeServices.layer)));
const cacheKey = (options?: unknown): Cache.Key => ({ operation: "Fixture.write", tool: producedBy, inputs: [], options });
const produce = (outfile: string, text = "hello") => Commit.output(outfile, (staged) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(staged, text);
  return yield* Artifact.file(staged, producedBy);
}));

it("canonicalizes options and identities without erasing meaningful values", async () => {
  const a = await run(Cache.key(cacheKey({ b: 2, a: 1, ignored: undefined })));
  expect(await run(Cache.key(cacheKey({ a: 1, b: 2 })))).toBe(a);
  expect(await run(Cache.key(cacheKey({ a: 1, b: 3 })))).not.toBe(a);
  expect(await run(Cache.key({ ...cacheKey({ a: 1, b: 2 }), tool: { ...producedBy, path: "/elsewhere" } }))).toBe(a);
  for (const bad of [() => 1, { fn: () => 1 }, NaN, Infinity, new Date(), new Map(), [undefined], new Array(1), 1n]) {
    expect(await run(Cache.key(cacheKey(bad)).pipe(Effect.flip))).toMatchObject({ _tag: "InputInvalid", operation: "Cache.key" });
  }
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  expect(await run(Cache.key(cacheKey(cycle)).pipe(Effect.flip))).toHaveProperty("_tag", "InputInvalid");
});

it("requires input digests, accepts version-only tools, and distinguishes changed input bytes", async () => {
  const path = join(root, "input");
  await writeFile(path, "before");
  const file = await run(Artifact.file(path, producedBy));
  // @ts-expect-error A cache input requires a recorded content identity.
  expect(await run(Cache.key({ ...cacheKey(), inputs: [file] }).pipe(Effect.flip))).toHaveProperty("_tag", "InputInvalid");
  const versionOnly = { name: "fixture", version: "1.0.0" };
  expect(await run(Cache.key({ ...cacheKey(), tool: versionOnly }))).not.toBe(await run(Cache.key(cacheKey())));
  expect(await run(Cache.key({ ...cacheKey(), tool: versionOnly }))).not.toBe(await run(Cache.key({ ...cacheKey(), tool: { ...versionOnly, version: "2.0.0" } })));
  const first = await run(Artifact.withSha256(file));
  await writeFile(path, "after!");
  const second = await run(Artifact.withSha256(file));
  expect(await run(Cache.key({ ...cacheKey(), inputs: [first] }))).not.toBe(await run(Cache.key({ ...cacheKey(), inputs: [second] })));
});

it("hits across destinations, preserves producer identity, and never hardlinks objects", async () => {
  await run(Effect.gen(function*() {
    const first = yield* produce(join(root, "first")).pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "first"), schema: Artifact.File }));
    const second = yield* Effect.die("producer must not run on a hit").pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "second"), schema: Artifact.File }));
    expect(first).not.toHaveProperty("sha256");
    expect(second).toEqual({ ...first, path: join(root, "second") });
    expect(yield* (yield* FileSystem.FileSystem).readFileString(second.path)).toBe("hello");
  }));
  const entries = await readdir(join(root, "objects"));
  expect(entries).toHaveLength(1);
  await writeFile(join(root, "second"), "mutated");
  expect(await readFile(join(root, "objects", entries[0]!), "utf8")).toBe("hello");
});

it.each(["missing", "corrupt", "malformed-index"] as const)("rebuilds a %s entry", async (damage) => {
  await run(Effect.gen(function*() {
    const outfile = join(root, "out");
    const first = yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile, schema: Artifact.File }));
    const identity = yield* Artifact.withSha256(first);
    const fs = yield* FileSystem.FileSystem;
    if (damage === "missing") yield* fs.remove(join(root, "objects", identity.sha256));
    else if (damage === "corrupt") yield* fs.writeFileString(join(root, "objects", identity.sha256), "wrong");
    else yield* (yield* KeyValueStore.KeyValueStore).set(yield* Cache.key(cacheKey()), "{broken");
    let invoked = false;
    const second = yield* Effect.sync(() => { invoked = true; }).pipe(Effect.andThen(produce(outfile, "rebuilt")), Cache.cached({ key: cacheKey(), outfile, schema: Artifact.File }));
    expect(invoked).toBe(true);
    expect((yield* Artifact.withSha256(second)).sha256).not.toBe(identity.sha256);
    expect(yield* fs.readFileString(second.path)).toBe("rebuilt");
  }));
});

it("corrupt direct hits leave the previous destination intact before the producer starts", async () => {
  await run(Effect.gen(function*() {
    const outfile = join(root, "out");
    const first = yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }));
    const identity = yield* Artifact.withSha256(first);
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(join(root, "objects", identity.sha256), "broken");
    yield* Effect.gen(function*() {
      expect(yield* fs.readFileString(outfile)).toBe("hello");
      return yield* produce(outfile, "next");
    }).pipe(Cache.cached({ key: cacheKey(), outfile, atomic: false }));
  }));
});

it("preserves modes, symlinks and directory manifests", async () => {
  const source = join(root, "source");
  await mkdir(join(source, "bin"), { recursive: true });
  await writeFile(join(source, "bin", "tool"), "bytes");
  await chmod(join(source, "bin", "tool"), 0o755);
  if (process.platform !== "win32") await symlink("bin/tool", join(source, "link"));
  await run(Effect.gen(function*() {
    const artifact = yield* Artifact.directory(source, producedBy);
    yield* Effect.succeed(artifact).pipe(Cache.cached({ key: cacheKey(), outfile: source, schema: Artifact.Directory }));
    const restored = yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "restored"), schema: Artifact.Directory }));
    expect(restored).toEqual({ ...artifact, path: join(root, "restored") });
    expect((yield* Artifact.withSha256(restored)).sha256).toBe((yield* Artifact.withSha256(artifact)).sha256);
  }));
  expect((await stat(join(root, "restored", "bin", "tool"))).mode & 0o777).toBe(process.platform === "win32" ? 0o666 : 0o755);
  if (process.platform !== "win32") expect(await readlink(join(root, "restored", "link"))).toBe("bin/tool");
});

it("replaces an existing directory completely on a direct hit", async () => {
  const source = join(root, "source");
  await mkdir(join(source, "nested"), { recursive: true });
  await writeFile(join(source, "nested", "file"), "contents");
  await run(Effect.gen(function*() {
    const artifact = yield* Artifact.directory(source, producedBy);
    yield* Effect.succeed(artifact).pipe(Cache.cached({ key: cacheKey(), outfile: source, schema: Artifact.Directory }));
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(join(source, "stale"), "remove me");
    const restored = yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile: source, schema: Artifact.Directory, atomic: false }));
    expect(restored.entries).toEqual(artifact.entries);
    expect(yield* fs.exists(join(source, "stale"))).toBe(false);
  }));
});

it("rejects cross-host path projections before following manifest symlinks", async () => {
  if (process.platform === "win32") return; // A POSIX-only source name represents an index from another host.
  const source = join(root, "source"), outside = join(root, "outside");
  await mkdir(source); await mkdir(outside);
  await writeFile(join(outside, "b"), "untouched");
  await symlink(outside, join(source, "a"));
  await writeFile(join(source, "a\\b"), "cached");
  await run(Effect.gen(function*() {
    const artifact = yield* Artifact.directory(source, producedBy);
    yield* Effect.succeed(artifact).pipe(Cache.cached({ key: cacheKey(), outfile: source, schema: Artifact.Directory }));
    const p = yield* Path.Path;
    const output = join(root, "result");
    const result = yield* produce(output, "miss").pipe(Cache.cached({ key: cacheKey(), outfile: output }), Effect.provideService(Path.Path, {
      ...p, resolve: (...paths) => p.resolve(...paths.map((path) => path.replaceAll("\\", "/"))),
    }));
    expect(result.kind).toBe("file");
    expect(yield* (yield* FileSystem.FileSystem).readFileString(join(outside, "b"))).toBe("untouched");
  }));
});

it("streams executable objects and retains their header and executable mode", async () => {
  await run(Effect.scoped(Effect.gen(function*() {
    const artifact = yield* TestArtifact.executable("linux-x64");
    const fs = yield* FileSystem.FileSystem;
    const outfile = join(root, "program");
    const restored = yield* Effect.gen(function*() {
      yield* Effect.succeed(artifact).pipe(Cache.cached({ key: cacheKey(), outfile: artifact.path, schema: Artifact.Executable }));
      return yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile, schema: Artifact.Executable }));
    }).pipe(Effect.provideService(FileSystem.FileSystem, {
      ...fs, readFile: () => Effect.die("cache bytes must stream"),
    }));
    expect(restored).toEqual({ ...artifact, path: outfile });
    expect((yield* Artifact.withSha256(restored)).sha256).toBe((yield* Artifact.withSha256(artifact)).sha256);
    if (process.platform !== "win32") expect(Number((yield* fs.stat(outfile)).mode) & 0o111).not.toBe(0);
  })));
});

it("keys directory root modes even though the manifest digest excludes them", async () => {
  const path = join(root, "tree"); await mkdir(path);
  const artifact = await run(Artifact.directory(path, producedBy).pipe(Effect.flatMap(Artifact.withSha256)));
  expect(await run(Cache.key({ ...cacheKey(), inputs: [artifact] }))).not.toBe(await run(Cache.key({ ...cacheKey(), inputs: [{ ...artifact, rootMode: 0o700 }] })));
});

it("retains provider refinements through their schema", async () => {
  const Refined = Schema.Struct({ ...Artifact.File.fields, signature: Schema.String, signedAt: Schema.DateFromString });
  await run(Effect.gen(function*() {
    const outfile = join(root, "signed");
    const artifact = { ...yield* produce(outfile), signature: "certificate", signedAt: new Date("2026-01-01T00:00:00Z") };
    yield* Effect.succeed(artifact).pipe(Cache.cached({ key: cacheKey(), outfile, schema: Refined }));
    const restored = yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "restored"), schema: Refined }));
    expect(restored.signature).toBe("certificate");
    expect(restored.signedAt).toEqual(artifact.signedAt);
    expect(restored).not.toHaveProperty("sha256");
  }));
});

it("retains explicitly hashed output and rejects a conflicting recorded digest", async () => {
  await run(Effect.gen(function*() {
    const outfile = join(root, "hashed");
    const first = yield* produce(outfile).pipe(Effect.flatMap(Artifact.withSha256), Cache.cached({ key: cacheKey(), outfile, schema: Artifact.HashedFile }));
    const hit = yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "hit"), schema: Artifact.HashedFile }));
    expect(hit.sha256).toBe(first.sha256);
    yield* Artifact.verify(hit);
    const store = yield* KeyValueStore.KeyValueStore;
    const id = yield* Cache.key(cacheKey());
    const entry = JSON.parse((yield* store.get(id))!);
    entry.artifact.sha256 = "0".repeat(64);
    yield* store.set(id, JSON.stringify(entry));
    const rebuilt = yield* produce(outfile, "fresh").pipe(Effect.flatMap(Artifact.withSha256), Cache.cached({ key: cacheKey(), outfile, schema: Artifact.HashedFile }));
    expect(rebuilt.sha256).not.toBe(first.sha256);
    expect(yield* (yield* FileSystem.FileSystem).readFileString(outfile)).toBe("fresh");
  }));
});

it("preserves commit failures instead of rerunning the producer", async () => {
  await run(Effect.gen(function*() {
    const outfile = join(root, "out");
    yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }));
    const failure = yield* Effect.die("must not run").pipe(Cache.cached({ key: cacheKey(), outfile, onExists: "fail" }), Effect.flip);
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "exists" });
    expect(yield* (yield* FileSystem.FileSystem).readFileString(outfile)).toBe("hello");
  }));
});

it("does not fail a successful build when index reads or ingest fail", async () => {
  await run(Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore;
    const error = new KeyValueStore.KeyValueStoreError({ method: "get", message: "unavailable" });
    const outfile = join(root, "out");
    const record = yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }), Effect.provideService(KeyValueStore.KeyValueStore, {
      ...store, get: () => Effect.fail(error), set: () => Effect.fail(error),
    }));
    expect(yield* (yield* FileSystem.FileSystem).readFileString(record.path)).toBe("hello");
  }));
});

it("preserves output on object write failure, and reports destination write failure on a hit", async () => {
  await run(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const outfile = join(root, "out");
    yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }), Effect.provideService(FileSystem.FileSystem, {
      ...fs, makeTempDirectory: (options) => options?.directory === join(root, "objects")
        ? Effect.fail(PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "makeTempDirectory" }))
        : fs.makeTempDirectory(options),
    }));
    expect(yield* fs.readFileString(outfile)).toBe("hello");
    yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }));
    const blocked = join(root, "file-parent"); yield* fs.writeFileString(blocked, "occupied");
    const failure = yield* Effect.die("hit destination failure must not run producer").pipe(Cache.cached({ key: cacheKey(), outfile: join(blocked, "out") }), Effect.flip);
    expect(failure._tag).toBe("CommitError");
  }));
});

it("rejects invalid or mismatched output paths without populating an index entry", async () => {
  await run(Effect.gen(function*() {
    for (const outfile of ["", "bad\0path"]) {
      expect(yield* Effect.die("invalid must not run").pipe(Cache.cached({ key: cacheKey(), outfile }), Effect.flip)).toMatchObject({ _tag: "InputInvalid" });
    }
    expect(yield* produce(join(root, "actual")).pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "expected") }), Effect.flip)).toMatchObject({ _tag: "InputInvalid" });
    expect(yield* (yield* KeyValueStore.KeyValueStore).size).toBe(0);
  }));
});

it("concurrent misses never expose partial objects and interrupted ingest remains interruptible", async () => {
  await run(Effect.gen(function*() {
    const results = yield* Effect.forEach(["a", "b"], (name) => produce(join(root, name)).pipe(Cache.cached({ key: cacheKey(), outfile: join(root, name) })), { concurrency: 2 });
    expect((yield* Artifact.withSha256(results[0]!)).sha256).toBe((yield* Artifact.withSha256(results[1]!)).sha256);
    yield* Effect.die("hit").pipe(Cache.cached({ key: cacheKey(), outfile: join(root, "c") }));
    const started = yield* Deferred.make<void>();
    const store = yield* KeyValueStore.KeyValueStore;
    const fiber = yield* produce(join(root, "interrupt")).pipe(Cache.cached({ key: cacheKey("new"), outfile: join(root, "interrupt") }), Effect.provideService(KeyValueStore.KeyValueStore, {
      ...store, set: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
    }), Effect.forkChild);
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);
    expect(yield* store.get(yield* Cache.key(cacheKey("new")))).toBeUndefined();
  }));
  expect((await readdir(join(root, "objects"))).some((name) => name.startsWith(".effect-build-"))).toBe(false);
});

it("clears its dedicated index and objects", async () => {
  await run(Effect.gen(function*() {
    const outfile = join(root, "out");
    yield* produce(outfile).pipe(Cache.cached({ key: cacheKey(), outfile }));
    yield* Cache.clear;
    expect(yield* (yield* KeyValueStore.KeyValueStore).size).toBe(0);
    expect(yield* (yield* FileSystem.FileSystem).exists(join(root, "objects"))).toBe(false);
  }));
});

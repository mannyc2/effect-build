import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, PlatformError, Stream } from "effect";
import * as Artifact from "effect-build/Artifact";
import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { elf, thinMacho } from "../fixtures/native-executable.js";

const producer = { name: "fixture", version: "0.7.0" };
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "effect-build-artifact-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("filesystem diagnostics", () => {
  it.each(["file", "directory", "readVerified", "streamVerified"] as const)("preserves a denied stat through %s", async (operation) => {
    const path = join(root, "input");
    await writeFile(path, "input");
    const artifact = await run(Artifact.file(path, producer));
    const denied = PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "stat", pathOrDescriptor: path });
    const failure = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const read = operation === "file" ? Artifact.file(path, producer)
        : operation === "directory" ? Artifact.directory(path, producer)
        : operation === "readVerified" ? Artifact.readVerified(artifact)
        : Stream.runDrain(Artifact.streamVerified(artifact));
      return yield* read.pipe(Effect.provideService(FileSystem.FileSystem, { ...fs, stat: () => Effect.fail(denied) }), Effect.flip);
    }));
    expect(failure).toMatchObject({ reason: "unreadable", path, detail: expect.stringContaining("PermissionDenied") });
  });

  it("does not mistake a failed link inspection for a regular directory member", async () => {
    const path = join(root, "input");
    await writeFile(path, "input");
    const failure = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      return yield* Artifact.directory(root, producer).pipe(Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        readLink: () => Effect.fail(PlatformError.systemError({ _tag: "Unknown", module: "FileSystem", method: "readLink", description: "I/O failure" })),
      }), Effect.flip);
    }));
    expect(failure).toMatchObject({ reason: "unreadable", path, detail: expect.stringContaining("I/O failure") });
  });

  it("distinguishes a missing read from an unwritable copy destination", async () => {
    const missing = join(root, "missing");
    expect(await run(Artifact.file(missing, producer).pipe(Effect.flip))).toMatchObject({ reason: "not-found", path: missing });
    const source = join(root, "source");
    await writeFile(source, "input");
    const artifact = await run(Artifact.file(source, producer));
    const destination = join(source, "cannot-be-written");
    expect(await run(Artifact.copyVerified(artifact, destination).pipe(Effect.flip))).toMatchObject({ reason: "unwritable", path: destination, detail: expect.any(String) });
    expect(await readFile(source, "utf8")).toBe("input");
    expect(await readdir(root)).toEqual(["source"]);
  });
});

describe("artifacts from real files", () => {
  it("reads verified bytes and round-trips a JSON manifest", async () => {
    const path = join(root, "hello.txt");
    const contents = "hello π\n";
    await writeFile(path, contents);
    const file = await run(Artifact.file(path, producer));
    expect(file.bytes).toBe(Buffer.byteLength(contents));
    expect(file.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    expect(new TextDecoder().decode(await run(Artifact.readVerified(file)))).toBe(contents);
    expect(await run(Artifact.verify(file))).toBe(file);
    const json: unknown = JSON.parse(JSON.stringify(Artifact.encode([file])));
    const decoded = Artifact.decode(json);
    expect(decoded).toEqual([file]);
    expect(await run(Artifact.verify(decoded[0]!))).toEqual(file);
  });

  it("hashes multi-chunk files and directory members with the same SHA256 as Node", async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 31, 0x5a), path = join(root, "large");
    await writeFile(path, bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const file = await run(Artifact.file(path, producer)), directory = await run(Artifact.directory(root, producer));
    expect(file).toMatchObject({ bytes: bytes.length, sha256: digest });
    expect(Buffer.from(await run(Artifact.readVerified(file))).equals(bytes)).toBe(true);
    expect(directory.entries[0]).toMatchObject({ bytes: bytes.length, sha256: digest });
  });

  it.each([
    ["architecture", thinMacho(), "darwin-arm64", "darwin-x64"],
    ["ABI", elf("/lib64/ld-linux-x86-64.so.2"), "linux-x64", "linux-x64-musl"],
  ] as const)("rejects a decoded executable with authentic bytes but a forged %s", async (_label, bytes, target, forgedTarget) => {
    const path = join(root, "executable");
    await writeFile(path, bytes);
    const original = await run(Artifact.executable(path, producer, target));
    const decoded = Artifact.decode([{ ...original, target: forgedTarget }])[0]!;
    expect(await run(Artifact.verify(original))).toBe(original);
    expect(await run(Artifact.verify(decoded).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
    if (Artifact.isRegular(decoded)) {
      expect(await run(Artifact.readVerified(decoded).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
      expect(await run(Artifact.copyVerified(decoded, join(root, "forged-copy")).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
      expect(await readdir(root)).not.toContain("forged-copy");
    }
  });

  it("rejects authentic file bytes advertised as an executable when its header is incomplete", async () => {
    const path = join(root, "incomplete");
    await writeFile(path, thinMacho().subarray(0, 8));
    const file = await run(Artifact.file(path, producer));
    const decoded = Artifact.decode([{ ...file, kind: "executable", format: "mach-o", target: "darwin-arm64" }])[0]!;
    expect(await run(Artifact.verify(decoded).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
    if (Artifact.isRegular(decoded)) {
      expect(await run(Artifact.readVerified(decoded).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
      expect(await run(Artifact.copyVerified(decoded, join(root, "forged-copy")).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
      expect(await readdir(root)).not.toContain("forged-copy");
    }
  });

  it("copies verified bytes into a new parent and leaves nothing behind when the source changed", async () => {
    const source = join(root, "source.txt"), destination = join(root, "out", "copy.txt");
    await writeFile(source, "copy me");
    const file = await run(Artifact.file(source, producer));
    await run(Artifact.copyVerified(file, destination));
    expect(await readFile(destination, "utf8")).toBe("copy me");
    await writeFile(source, "changed");
    expect(await run(Artifact.copyVerified(file, join(root, "out", "second.txt")).pipe(Effect.flip))).toMatchObject({ reason: "changed", path: source });
    expect(await readdir(join(root, "out"))).toEqual(["copy.txt"]);
    // A destination equal to the source is verified in place, never copied over itself.
    expect(await run(Artifact.copyVerified(file, source).pipe(Effect.flip))).toMatchObject({ reason: "changed" });
    await run(Artifact.copyVerified(await run(Artifact.file(source, producer)), source));
    expect(await readFile(source, "utf8")).toBe("changed");
  });

  it("streams verified chunks of bounded size and fails at the end when the bytes differ", async () => {
    const path = join(root, "stream.bin"), contents = Buffer.alloc(3 * 64 * 1024 + 7, 0x41);
    await writeFile(path, contents);
    const file = await run(Artifact.file(path, producer));
    const chunks = [...await run(Stream.runCollect(Artifact.streamVerified(file)))];
    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).equals(contents)).toBe(true);
    expect(Math.max(...chunks.map((chunk) => chunk.byteLength))).toBeLessThanOrEqual(64 * 1024);
    await writeFile(path, Buffer.alloc(contents.length, 0x42));
    expect(await run(Stream.runCollect(Artifact.streamVerified(file)).pipe(Effect.flip))).toMatchObject({ reason: "changed", path });
    await writeFile(path, Buffer.concat([contents, Buffer.from("+")]));
    expect(await run(Stream.runCollect(Artifact.streamVerified(file)).pipe(Effect.flip))).toMatchObject({ reason: "changed", path });
  });

  it("rejects growth after opening without reading beyond its recorded size plus one byte", async () => {
    const path = join(root, "growing"), contents = Buffer.alloc(64 * 1024 + 5, 0x61);
    await writeFile(path, contents);
    const artifact = await run(Artifact.file(path, producer)), fs = await run(FileSystem.FileSystem);
    const reads: number[] = [];
    const observing: FileSystem.FileSystem = {
      ...fs,
      open: (path, options) => fs.open(path, options).pipe(Effect.map((handle) => ({
        ...handle,
        stat: handle.stat.pipe(Effect.tap(() => Effect.promise(() => appendFile(path, Buffer.alloc(8 * 1024 * 1024, 0x62))))),
        read: (buffer) => { reads.push(buffer.length); return handle.read(buffer); },
      }))),
    };
    const failure = await run(Artifact.readVerified(artifact).pipe(Effect.provideService(FileSystem.FileSystem, observing), Effect.flip));
    expect(failure).toMatchObject({ reason: "changed" });
    expect(Math.max(...reads)).toBeLessThanOrEqual(64 * 1024);
    expect(reads.reduce((sum, size) => sum + size, 0)).toBe(artifact.bytes + 1);
  });

  it("explicitly projects provider refinements out of the core manifest", async () => {
    const path = join(root, "refined");
    await writeFile(path, "signed program");
    const core = await run(Artifact.file(path, producer));
    const refined = { ...core, signature: { issuer: "fixture" }, runtime: { version: "1.0.0" }, product: "pkg", ticket: "accepted" };
    expect(Artifact.encode([refined])).toEqual([core]);
    expect(Artifact.decode([refined])).toEqual([core]);
  });

  it.each([
    ["negative size", { bytes: -1 }],
    ["fractional size", { bytes: 0.5 }],
    ["unsafe size", { bytes: Number.MAX_SAFE_INTEGER + 1 }],
    ["infinite size", { bytes: Infinity }],
    ["empty digest", { sha256: "" }],
    ["non-hex digest", { sha256: "g".repeat(64) }],
    ["uppercase digest", { sha256: "A".repeat(64) }],
    ["short digest", { sha256: "a".repeat(63) }],
    ["target/format mismatch", { kind: "executable", format: "pe", target: "linux-x64" }],
  ])("rejects file metadata with %s", async (_name, invalid) => {
    const path = join(root, "record");
    await writeFile(path, "bytes");
    const file = await run(Artifact.file(path, producer));
    expect(() => Artifact.decode([{ ...file, ...invalid }])).toThrow();
  });

  type Entry = Artifact.Directory["entries"][number];
  const invalidEntryCases: ReadonlyArray<readonly [string, (entry: Entry) => unknown]> = [
    ["missing file digest", (entry) => ({ ...entry, sha256: undefined })],
    ["file with link target", (entry) => ({ ...entry, linkTarget: "elsewhere" })],
    ["directory with file digest", (entry) => ({ ...entry, kind: "directory", bytes: 0 })],
    ["symlink with file digest", (entry) => ({ ...entry, kind: "symlink", bytes: 0, linkTarget: "elsewhere" })],
    ["symlink without target", () => ({ path: "link", kind: "symlink", mode: 0o777, bytes: 0 })],
    ["parent traversal", (entry) => ({ ...entry, path: "../outside" })],
    ["missing parent directory", (entry) => ({ ...entry, path: "nested/file" })],
    ["negative mode", (entry) => ({ ...entry, mode: -1 })],
  ];
  it.each(invalidEntryCases)("rejects directory entry metadata with %s", async (_name, invalid) => {
    await writeFile(join(root, "record"), "bytes");
    const directory = await run(Artifact.directory(root, producer));
    expect(() => Artifact.decode([{ ...directory, entries: [invalid(directory.entries[0]!)] }])).toThrow();
  });

  const invalidDirectoryCases: ReadonlyArray<readonly [string, (directory: Artifact.Directory) => unknown]> = [
    ["duplicate entries", (directory) => ({ ...directory, entries: [...directory.entries, ...directory.entries] })],
    ["inconsistent byte total", (directory) => ({ ...directory, bytes: directory.bytes + 1 })],
    ["negative root mode", (directory) => ({ ...directory, rootMode: -1 })],
    ["fractional root mode", (directory) => ({ ...directory, rootMode: 0.5 })],
    ["oversized root mode", (directory) => ({ ...directory, rootMode: 0o10000 })],
    ["missing root mode", ({ rootMode: _rootMode, ...directory }) => directory],
  ];
  it.each(invalidDirectoryCases)("rejects directory metadata with %s", async (_name, invalid) => {
    await writeFile(join(root, "record"), "bytes");
    const directory = await run(Artifact.directory(root, producer));
    expect(() => Artifact.decode([invalid(directory)])).toThrow();
  });

  it("rejects a directory manifest whose entry mode changed without updating its digest", async () => {
    await writeFile(join(root, "record"), "bytes");
    const directory = await run(Artifact.directory(root, producer));
    const entry = directory.entries[0]!;
    const changedManifest = { ...directory, entries: [{ ...entry, mode: entry.mode === 0o644 ? 0o755 : 0o644 }] };
    expect(() => Artifact.decode([changedManifest])).toThrow();
    expect(await run(Artifact.verify(changedManifest).pipe(Effect.flip))).toMatchObject({ reason: "invalid-metadata" });
  });

  it("rejects changed bytes even when the file length stays the same", async () => {
    const path = join(root, "app.txt");
    await writeFile(path, "before");
    const file = await run(Artifact.file(path, producer));
    await writeFile(path, "after!");
    const failures = await Promise.all([
      run(Artifact.verify(file).pipe(Effect.flip)),
      run(Artifact.readVerified(file).pipe(Effect.flip)),
    ]);
    for (const failure of failures) {
      expect(failure).toMatchObject({
        _tag: "ArtifactError", path, reason: "changed",
      });
    }
  });

  it("reports a missing path and a directory used as a regular file", async () => {
    const missing = join(root, "missing");
    expect(await run(Artifact.file(missing, producer).pipe(Effect.flip))).toMatchObject({
      path: missing, reason: "not-found",
    });
    expect(await run(Artifact.file(root, producer).pipe(Effect.flip))).toMatchObject({
      path: root, reason: "not-a-file",
    });
  });

  it("rejects a recorded byte count that does not match the file", async () => {
    const path = join(root, "size.txt");
    await writeFile(path, "hello");
    const file = await run(Artifact.file(path, producer));
    const changed = { ...file, bytes: file.bytes + 1 };
    expect(await run(Artifact.readVerified(changed).pipe(Effect.flip))).toMatchObject({
      _tag: "ArtifactError", path, reason: "changed",
    });
  });
});

describe("directory manifests", () => {
  it("decodes the persisted directory digest format without changing tuple field order", () => {
    // Golden SHA-256 of the existing UTF-8 JSON tuple format, including null absent fields.
    const entries = [
      { path: "bin", kind: "directory", mode: 0o755, bytes: 0 },
      { path: "bin/empty", kind: "file", mode: 0o644, bytes: 0, sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      { path: "link", kind: "symlink", mode: 0o777, bytes: 0, linkTarget: "bin/empty" },
    ];
    const record = { kind: "directory", path: "release", bytes: 0, sha256: "619319aa040ae99c239540dc85adf0ea8300b40e31b22e13b12d290fb9077bca", rootMode: 0o755, producedBy: producer, entries };
    expect(Artifact.decode([record])).toEqual([record]);
  });

  it.skipIf(process.platform === "win32")("distinguishes newlines in filenames from separate manifest entries", async () => {
    const first = join(root, "first"), second = join(root, "second");
    await mkdir(first);
    await mkdir(second);
    const digest = createHash("sha256").update("").digest("hex");
    await writeFile(join(first, `a\nfile 644 0 ${digest} b`), "");
    await writeFile(join(second, "a"), "");
    await writeFile(join(second, "b"), "");
    const [one, two] = await Promise.all([run(Artifact.directory(first, producer)), run(Artifact.directory(second, producer))]);
    expect(one.bytes).toBe(two.bytes);
    expect(one.sha256).not.toBe(two.sha256);
  });

  it("sorts nested entries and produces the same digest across repeated reads", async () => {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.txt"), "last");
    await writeFile(join(root, "nested", "b.txt"), "inside");
    await writeFile(join(root, "a.txt"), "first");
    const first = await run(Artifact.directory(root, producer));
    const second = await run(Artifact.directory(root, producer));
    expect(first.entries.map((entry) => entry.path)).toEqual(["a.txt", "nested", "nested/b.txt", "z.txt"]);
    expect(first.bytes).toBe(15);
    expect(second).toEqual(first);
    expect(await run(Artifact.verify(first))).toBe(first);
    await writeFile(join(root, "nested", "b.txt"), "edited");
    expect(await run(Artifact.verify(first).pipe(Effect.flip))).toMatchObject({ reason: "changed" });
  });

  it("records a directory symlink without including or following its target", async () => {
    const tree = join(root, "tree");
    const outside = join(root, "outside");
    const link = join(tree, "linked");
    await mkdir(tree);
    await mkdir(outside);
    await writeFile(join(tree, "local.txt"), "local");
    await writeFile(join(outside, "secret.txt"), "outside contents");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const first = await run(Artifact.directory(tree, producer));
    expect(first.entries.map((entry) => entry.path)).toEqual(["linked", "local.txt"]);
    expect(first.entries[0]).toMatchObject({
      path: "linked", kind: "symlink", bytes: 0, linkTarget: await readlink(link),
    });
    expect(first.bytes).toBe(5);
    await writeFile(join(outside, "secret.txt"), "changed outside the tree");
    expect(await run(Artifact.directory(tree, producer))).toEqual(first);
  });

  it("records a dangling symlink without trying to read its missing target", async () => {
    const link = join(root, "missing-link");
    await symlink(join(root, "absent"), link, process.platform === "win32" ? "junction" : "dir");
    const artifact = await run(Artifact.directory(root, producer));
    expect(artifact.entries).toHaveLength(1);
    expect(artifact.entries[0]).toMatchObject({
      path: "missing-link", kind: "symlink", bytes: 0, linkTarget: await readlink(link),
    });
    expect(artifact.bytes).toBe(0);
  });

  it("records the root's own mode and round-trips it through the manifest", async () => {
    await writeFile(join(root, "member.txt"), "kept");
    const artifact = await run(Artifact.directory(root, producer));
    expect(Number.isInteger(artifact.rootMode)).toBe(true);
    expect(artifact.rootMode).toBeGreaterThanOrEqual(0);
    expect(artifact.rootMode).toBeLessThanOrEqual(0o7777);
    expect(Artifact.decode(JSON.parse(JSON.stringify(Artifact.encode([artifact]))))).toEqual([artifact]);
  });

  it.skipIf(process.platform === "win32")("rejects root mode drift the entry manifest cannot see", async () => {
    const tree = join(root, "tree");
    await mkdir(tree);
    await writeFile(join(tree, "member.txt"), "kept");
    await chmod(tree, 0o750);
    const artifact = await run(Artifact.directory(tree, producer));
    expect(artifact.rootMode).toBe(0o750);
    expect(await run(Artifact.verify(artifact))).toBe(artifact);
    await chmod(tree, 0o700);
    expect(await run(Artifact.verify(artifact).pipe(Effect.flip))).toMatchObject({ reason: "changed", path: tree });
    const drifted = await run(Artifact.directory(tree, producer));
    expect(drifted.rootMode).toBe(0o700);
    // The digest still names only the entry manifest; the root's mode travels beside it.
    expect(drifted.sha256).toBe(artifact.sha256);
  });
});

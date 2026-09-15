import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem } from "effect";
import * as Artifact from "effect-build/Artifact";
import { TestArtifact } from "effect-build/testing";
import * as Directory from "../../packages/effect-build/src/Directory.js";
import { chmod, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const producer = { name: "fixture", version: "1" };
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-directory-"))); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const file = async (path: string, contents: string | Uint8Array = path) => {
  const full = join(root, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, contents);
  return run(Artifact.file(full, producer));
};
const previous = async () => {
  await file("release/previous", "previous output");
  return run(Artifact.directory(join(root, "release"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
};
const unchanged = async (before: Artifact.HashedDirectory) => {
  expect(await run(Artifact.verify(before))).toEqual(before);
  expect((await readdir(root)).some((path) => path.startsWith(".effect-build-"))).toBe(false);
};

describe("directory assembly", () => {
  it("merges root directory contents and mounts independent bundle and native assets", async () => {
    await file("node/chunks/node.js", "export const runtime = 'node';");
    await file("bun/chunks/bun.js", "export const runtime = 'bun';");
    await file("mounted/main.js", "export const mounted = true;");
    const wasm = await file("main.wasm", new Uint8Array([0, 97, 115, 109]));
    const executableFile = await file("native", TestArtifact.elf());
    const executable = await run(Artifact.executable(executableFile.path, producer, "linux-x64"));
    const inputs = await Promise.all(["node", "bun", "mounted"].map((name) => run(Artifact.directory(join(root, name), producer))));
    const assembled = await run(Directory.assemble({ outdir: join(root, "release"), entries: [
      { artifact: inputs[0]! }, { artifact: inputs[1]! }, { artifact: inputs[2]!, path: "app" },
      { artifact: wasm, path: "signer/main.wasm" }, { artifact: executable, path: "bin/native" },
    ] }));
    expect(assembled.entries.map((entry) => entry.path)).toEqual([
      "app", "app/main.js", "bin", "bin/native", "chunks", "chunks/bun.js", "chunks/node.js", "signer", "signer/main.wasm",
    ]);
    expect(await readFile(join(assembled.path, "chunks/node.js"), "utf8")).toContain("node");
    expect(await readFile(join(assembled.path, "chunks/bun.js"), "utf8")).toContain("bun");
    expect(await run(Artifact.directory(assembled.path, assembled.producedBy))).toEqual(assembled);
    if (process.platform !== "win32") {
      expect(assembled.rootMode).toBe(0o755);
      expect((await stat(join(assembled.path, "signer/main.wasm"))).mode & 0o7777).toBe(0o644);
      expect((await stat(join(assembled.path, "bin/native"))).mode & 0o7777).toBe(0o755);
    }
  });

  it.skipIf(process.platform === "win32")("preserves mounted roots, descendants, empty directories and symlinks without writing through them", async () => {
    await file("source/lib/data", "native library");
    await mkdir(join(root, "source/empty"));
    await chmod(join(root, "source"), 0o750);
    await chmod(join(root, "source/lib"), 0o700);
    await chmod(join(root, "source/lib/data"), 0o640);
    await symlink("lib", join(root, "source/current"));
    await symlink("missing", join(root, "source/dangling"));
    const source = await run(Artifact.directory(join(root, "source"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const result = await run(Directory.assemble({ outdir: join(root, "release"), entries: [{ artifact: source, path: "runtime" }] }));
    expect(result.entries.find((entry) => entry.path === "runtime")).toMatchObject({ kind: "directory", mode: 0o750 });
    expect(result.entries.find((entry) => entry.path === "runtime/lib")).toMatchObject({ mode: 0o700 });
    expect(result.entries.find((entry) => entry.path === "runtime/lib/data")).toMatchObject({ mode: 0o640 });
    expect(await readdir(join(result.path, "runtime/empty"))).toEqual([]);
    expect(await readlink(join(result.path, "runtime/current"))).toBe("lib");
    expect(await readlink(join(result.path, "runtime/dangling"))).toBe("missing");
  });

  it.each(["../escape", "/absolute", "a/../escape", "a\\escape", ".", ""])("rejects shipping path %j before changing direct output", async (path) => {
    const input = await file("input");
    const before = await previous();
    const failure = await run(Directory.assemble({ outdir: before.path, atomic: false, entries: [{ artifact: input, path }] }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid", operation: "Directory.assemble", path });
    await unchanged(before);
  });

  it.each([["same", "same"], ["Asset/a", "asset/b"], ["caf\u00e9/a", "cafe\u0301/b"], ["file", "file/child"]])("rejects conflicting paths %j and %j before changing output", async (first, second) => {
    const input = await file("input");
    const before = await previous();
    const failure = await run(Directory.assemble({ outdir: before.path, entries: [
      { artifact: input, path: first! }, { artifact: input, path: second! },
    ] }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid", operation: "Directory.assemble" });
    await unchanged(before);
  });

  it.skipIf(process.platform === "win32")("rejects a symlink prefix before any write can escape the output tree", async () => {
    await file("outside/untouched", "outside");
    await mkdir(join(root, "source"));
    await symlink(join(root, "outside"), join(root, "source/link"));
    const source = await run(Artifact.directory(join(root, "source"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const input = await file("input");
    const before = await previous();
    const failure = await run(Directory.assemble({ outdir: before.path, entries: [
      { artifact: source }, { artifact: input, path: "link/untouched" },
    ] }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid" });
    expect(await readFile(join(root, "outside/untouched"), "utf8")).toBe("outside");
    await unchanged(before);
  });

  it.skipIf(process.platform === "win32")("rejects ambiguous modes when shared directories merge", async () => {
    await file("one/shared/a");
    await file("two/shared/b");
    await chmod(join(root, "one/shared"), 0o700);
    await chmod(join(root, "two/shared"), 0o750);
    const inputs = await Promise.all(["one", "two"].map((name) => run(Artifact.directory(join(root, name), producer))));
    const before = await previous();
    const failure = await run(Directory.assemble({ outdir: before.path, entries: inputs.map((artifact) => ({ artifact })) }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid", path: "shared", reason: expect.stringContaining("modes") });
    await unchanged(before);
  });

  it.each(["file", "directory", "manifest"])("explicit verification rejects a changed %s input before assembly", async (kind) => {
    const member = await run(Artifact.withSha256(await file("source/input", "before")));
    const directory = await run(Artifact.directory(join(root, "source"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const before = await previous();
    if (kind === "directory") await file("source/added", "unexpected");
    else if (kind === "file") await writeFile(member.path, "after!");
    const artifact = kind === "file" ? member : kind === "manifest" ? { ...directory, entries: [] } : directory;
    const failure = await run(Artifact.verify(artifact).pipe(Effect.flatMap((verified) =>
      Directory.assemble({ outdir: before.path, entries: [{ artifact: verified, path: "input" }] })), Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: kind === "manifest" ? "invalid-metadata" : "changed" });
    await unchanged(before);
  });

  it("writes direct output from an empty tree and rejects inputs it would remove", async () => {
    const input = await file("input", "current");
    const before = await previous();
    const inside = await run(Artifact.file(join(before.path, "previous"), producer));
    const failure = await run(Directory.assemble({ outdir: before.path, atomic: false, entries: [{ artifact: inside, path: "current" }] }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid", path: inside.path });
    await unchanged(before);
    const result = await run(Directory.assemble({ outdir: before.path, atomic: false, entries: [{ artifact: input, path: "current" }] }));
    expect(await readdir(result.path)).toEqual(["current"]);
  });

  it("can assemble a source snapshot into a nested destination without including its staging", async () => {
    await file("source/main.js", "export const current = true;");
    const source = await run(Artifact.directory(join(root, "source"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const result = await run(Directory.assemble({ outdir: join(source.path, "release"), entries: [{ artifact: source }] }));
    expect(result.entries.map((entry) => entry.path)).toEqual(["main.js"]);
    expect(await readFile(join(result.path, "main.js"), "utf8")).toContain("current");
  });

  it("rejects direct output inside a directory input before deleting members, including path aliases", async () => {
    await file("source/main.js", "current source");
    await file("source/release/previous", "previous output");
    const source = await run(Artifact.directory(join(root, "source"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const before = await run(Artifact.directory(join(source.path, "release"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
    const cases = [{ artifact: source, outdir: before.path }];
    if (process.platform !== "win32") {
      await symlink(source.path, join(root, "alias"));
      const alias = await run(Artifact.directory(join(root, "alias"), producer).pipe(Effect.flatMap(Artifact.withSha256)));
      cases.push({ artifact: alias, outdir: before.path }, { artifact: source, outdir: join(root, "alias/release") });
    }
    for (const { artifact, outdir } of cases) {
      const failure = await run(Directory.assemble({ outdir, atomic: false, entries: [{ artifact }] }).pipe(Effect.flip));
      expect(failure).toMatchObject({ _tag: "InputInvalid", path: artifact.path, reason: "direct output must not overlap an input" });
      expect(await run(Artifact.verify(source))).toEqual(source);
      await unchanged(before);
    }
  });

  it.skipIf(process.platform === "win32")("protects direct-output inputs reached through a symlink alias", async () => {
    const before = await previous();
    await symlink(before.path, join(root, "alias"));
    const input = await run(Artifact.file(join(root, "alias/previous"), producer));
    const failure = await run(Directory.assemble({ outdir: before.path, atomic: false, entries: [{ artifact: input, path: "current" }] }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "InputInvalid", path: input.path });
    await unchanged(before);
  });

  it("interrupts during copying and removes staging without changing previous output", async () => {
    const input = await file("input", new Uint8Array(192 * 1024).fill(42));
    const before = await previous();
    const exit = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const blocked = yield* Deferred.make<void>();
      const fiber = yield* Directory.assemble({ outdir: before.path, entries: [{ artifact: input, path: "payload" }] }).pipe(
        Effect.provideService(FileSystem.FileSystem, { ...fs, copyFile: (source, destination) => fs.copyFile(source, destination).pipe(
          Effect.andThen(Deferred.succeed(blocked, undefined)), Effect.andThen(Effect.never),
        ) }), Effect.forkChild,
      );
      yield* Deferred.await(blocked);
      yield* Fiber.interrupt(fiber);
      return yield* Fiber.await(fiber);
    }));
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    await unchanged(before);
  });
});


it("assembles current input bytes without reading for hashes", async () => {
  const input = await file("input", "before");
  await writeFile(input.path, "after!");
  const result = await run(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    return yield* Directory.assemble({ outdir: join(root, "release"), entries: [{ artifact: input, path: "payload" }] }).pipe(
      Effect.provideService(FileSystem.FileSystem, { ...fs, open: () => Effect.die("assembly opened an input or output for hashing") }),
    );
  }));
  expect(await readFile(join(result.path, "payload"), "utf8")).toBe("after!");
  expect(result).not.toHaveProperty("sha256");
});

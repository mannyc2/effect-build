import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as Commit from "effect-build/Commit";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const producer = { name: "fixture", version: "0.7.0" };
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const write = (path: string, contents: string) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(path, contents);
  return yield* Artifact.file(path, producer);
});
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "effect-build-commit-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("atomic output", () => {
  it("creates the parent and renames a staged file with the final basename", async () => {
    const outfile = join(root, "dist", "cli.txt");
    const artifact = await run(Commit.atomic(outfile, (staged) => Effect.gen(function*() {
      expect(basename(staged)).toBe("cli.txt");
      expect(dirname(dirname(staged))).toBe(dirname(outfile));
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(outfile)).toBe(false);
      return yield* write(staged, "compiled");
    })));
    expect(artifact.path).toBe(outfile);
    expect(await readFile(outfile, "utf8")).toBe("compiled");
    expect(await readdir(dirname(outfile))).toEqual(["cli.txt"]);
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
  });

  it("removes staging when the producer fails and leaves no output", async () => {
    const outfile = join(root, "cli.txt");
    const failure = await run(Commit.atomic(outfile, (staged) => Effect.gen(function*() {
      yield* write(staged, "partial");
      return yield* Effect.fail("compilation failed");
    })).pipe(Effect.flip));
    expect(failure).toBe("compilation failed");
    expect(await readdir(root)).toEqual([]);
  });

  it("keeps an existing file when onExists is fail", async () => {
    const outfile = join(root, "cli.txt");
    await writeFile(outfile, "existing");
    const failure = await run(Commit.atomic(outfile, (staged) => write(staged, "replacement"), {
      onExists: "fail",
    }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", destination: outfile, reason: "exists" });
    expect(await readFile(outfile, "utf8")).toBe("existing");
    expect(await readdir(root)).toEqual(["cli.txt"]);
  });

  it("replaces an existing file by default", async () => {
    const outfile = join(root, "cli.txt");
    await writeFile(outfile, "existing");
    const artifact = await run(Commit.atomic(outfile, (staged) => write(staged, "replacement")));
    expect(await readFile(outfile, "utf8")).toBe("replacement");
    expect(await readdir(root)).toEqual(["cli.txt"]);
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
  });

  it("keeps a dangling destination symlink when onExists is fail", async () => {
    const outfile = join(root, "cli.txt");
    const target = join(root, "missing");
    await symlink(target, outfile, process.platform === "win32" ? "junction" : "file");
    const before = await readlink(outfile);
    const failure = await run(Commit.atomic(outfile, (staged) => write(staged, "replacement"), {
      onExists: "fail",
    }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "exists" });
    expect(await readlink(outfile)).toBe(before);
    expect(await readdir(root)).toEqual(["cli.txt"]);
  });

  it("replaces a nonempty directory with the produced tree", async () => {
    const outdir = join(root, "bundle");
    await mkdir(outdir);
    await writeFile(join(outdir, "old.txt"), "old");
    const artifact = await run(Commit.atomic(outdir, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(staged);
      yield* fs.writeFileString(path.join(staged, "new.txt"), "new");
      return yield* Artifact.directory(staged, producer);
    })));
    expect(artifact.path).toBe(outdir);
    expect(await readdir(outdir)).toEqual(["new.txt"]);
    expect(await readFile(join(outdir, "new.txt"), "utf8")).toBe("new");
    expect(await readdir(root)).toEqual(["bundle"]);
  });

  it("rejects a producer returning a different path", async () => {
    const outfile = join(root, "cli.txt");
    const different = join(root, "different.txt");
    const failure = await run(Commit.atomic(outfile, () => write(different, "different")).pipe(Effect.flip));
    expect(failure).toMatchObject({
      _tag: "CommitError", destination: outfile, reason: "staged-path-mismatch", detail: different,
    });
    expect(await readdir(root)).toEqual(["different.txt"]);
  });

  it("preserves existing bytes and removes staging when rename fails", async () => {
    const outfile = join(root, "cli.txt");
    await writeFile(outfile, "existing");
    const failure = await run(Commit.atomic(outfile, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const artifact = yield* write(staged, "replacement");
      // Removing the real staged file makes the operating system reject rename.
      yield* fs.remove(staged);
      return artifact;
    })).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", destination: outfile, reason: "rename-failed" });
    expect(await readFile(outfile, "utf8")).toBe("existing");
    expect(await readdir(root)).toEqual(["cli.txt"]);
  });
});

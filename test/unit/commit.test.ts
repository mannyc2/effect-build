import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, FileSystem, Path } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as Commit from "effect-build/Commit";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
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

  it("keeps the previous release when a later build in the staged tree fails", async () => {
    const outdir = join(root, "release");
    await mkdir(outdir);
    await writeFile(join(outdir, "cli"), "previous release");
    const previous = await run(Artifact.directory(outdir, producer));
    const failure = await run(Commit.atomic(outdir, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(staged);
      yield* write(path.join(staged, "cli"), "first target compiled");
      return yield* Effect.fail("second target failed");
    })).pipe(Effect.flip));
    expect(failure).toBe("second target failed");
    expect(await run(Artifact.verify(previous))).toEqual(previous);
    expect(await readFile(join(outdir, "cli"), "utf8")).toBe("previous release");
    expect(await readdir(root)).toEqual(["release"]);
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

  it("restores the previous directory when committing the replacement fails", async () => {
    const outdir = join(root, "release");
    await mkdir(outdir);
    await writeFile(join(outdir, "previous"), "recover me");
    const previous = await run(Artifact.directory(outdir, producer));
    const failure = await run(Commit.atomic(outdir, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(staged);
      const artifact = yield* Artifact.directory(staged, producer);
      yield* fs.remove(staged, { recursive: true });
      return artifact;
    })).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "rename-failed" });
    expect(await run(Artifact.verify(previous))).toEqual(previous);
    expect(await readdir(root)).toEqual(["release"]);
  });

  it("retains the previous directory outside scoped cleanup when rollback also fails", async () => {
    const outdir = join(root, "release");
    await mkdir(outdir);
    await writeFile(join(outdir, "previous"), "recover me");
    const failure = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      let moves = 0;
      return yield* Commit.atomic(outdir, (staged) => Effect.gen(function*() {
        yield* fs.makeDirectory(staged);
        return yield* Artifact.directory(staged, producer);
      })).pipe(Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        rename: (from, to) => ++moves === 1 ? fs.rename(from, to) : fs.rename(join(root, "missing"), to),
      }), Effect.flip);
    }));
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "rollback-failed", recoveryPath: expect.any(String) });
    if (!(failure instanceof Commit.CommitError)) throw new Error("expected a commit failure");
    expect(await readFile(join(failure.recoveryPath!, "previous"), "utf8")).toBe("recover me");
  });

  it("allows exactly one concurrent file commit with onExists fail", async () => {
    for (let trial = 0; trial < 20; trial++) {
      const outfile = join(root, `winner-${trial}`);
      let ready = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const exits = await run(Effect.all(["first", "second"].map((value) => Commit.atomic(outfile, (staged) => Effect.gen(function*() {
        const artifact = yield* write(staged, value);
        if (++ready === 2) release();
        yield* Effect.promise(() => gate);
        return artifact;
      }), { onExists: "fail" }).pipe(Effect.exit)), { concurrency: "unbounded" }));
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
      expect(["first", "second"]).toContain(await readFile(outfile, "utf8"));
    }
  });

  it("writes at the destination itself, creating its parent, when atomic is false", async () => {
    const outfile = join(root, "dist", "cli.txt");
    const artifact = await run(Commit.output(outfile, (path) => Effect.gen(function*() {
      expect(path).toBe(outfile);
      return yield* write(path, "direct");
    }), { atomic: false }));
    expect(artifact.path).toBe(outfile);
    expect(await readFile(outfile, "utf8")).toBe("direct");
    expect(await readdir(join(root, "dist"))).toEqual(["cli.txt"]);
  });

  it("stages by default and forwards commit options", async () => {
    const outfile = join(root, "cli.txt");
    await writeFile(outfile, "existing");
    const failure = await run(Commit.output(outfile, (staged) => write(staged, "replacement"), { onExists: "fail" }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "exists" });
    expect(await readFile(outfile, "utf8")).toBe("existing");
    const artifact = await run(Commit.output(outfile, (staged) => Effect.gen(function*() {
      expect(staged).not.toBe(outfile);
      return yield* write(staged, "replacement");
    }), { atomic: undefined }));
    expect(artifact.path).toBe(outfile);
    expect(await readFile(outfile, "utf8")).toBe("replacement");
    expect(await readdir(root)).toEqual(["cli.txt"]);
  });

  it("rejects unsupported exclusive directory commits without creating the destination", async () => {
    const outdir = join(root, "release");
    const failure = await run(Commit.atomic(outdir, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(staged);
      return yield* Artifact.directory(staged, producer);
    }), { onExists: "fail" }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", reason: "directory-no-replace-unsupported" });
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses an occupied destination before direct production when onExists is fail", async () => {
    const outfile = join(root, "cli.txt");
    await writeFile(outfile, "existing");
    let produced = false;
    const failure = await run(Commit.output(outfile, (path) => {
      produced = true;
      return write(path, "replacement");
    }, { atomic: false, onExists: "fail" }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "CommitError", destination: outfile, reason: "exists" });
    expect(produced).toBe(false);
    expect(await readFile(outfile, "utf8")).toBe("existing");
    const artifact = await run(Commit.output(join(root, "fresh.txt"), (path) => write(path, "direct"), { atomic: false, onExists: "fail" }));
    expect(await readFile(artifact.path, "utf8")).toBe("direct");
  });

  it("names staging with the caller's prefix while the producer picks its depth", async () => {
    const outfile = join(root, "cli.txt");
    await run(Commit.output(outfile, (staged) => Effect.gen(function*() {
      expect(basename(dirname(staged)).startsWith(".release-")).toBe(true);
      expect(basename(staged)).toBe("cli.txt");
      return yield* write(staged, "nested");
    }), { prefix: ".release-" }));
    const outdir = join(root, "bundle");
    await run(Commit.output(outdir, (staged) => Effect.gen(function*() {
      expect(dirname(staged)).toBe(root);
      expect(basename(staged).startsWith(".release-")).toBe(true);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(staged, { recursive: true });
      return yield* Artifact.directory(staged, producer);
    }), { prefix: ".release-" }, "sibling"));
    expect((await readdir(root)).sort()).toEqual(["bundle", "cli.txt"]);
  });

  it("commits a sibling-staged directory with a readable root", async () => {
    const outdir = join(root, "bundle");
    const artifact = await run(Commit.output(outdir, (staged) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      // Sibling staging hands the producer an existing directory; mkdtemp alone would have made it 0700.
      expect(yield* fs.exists(staged)).toBe(true);
      yield* fs.writeFileString(join(staged, "index.js"), "export {};\n");
      return yield* Artifact.directory(staged, producer);
    }), {}, "sibling"));
    expect(artifact.path).toBe(outdir);
    if (process.platform !== "win32") expect((await stat(outdir)).mode & 0o777).toBe(0o755);
    expect(await readdir(outdir)).toEqual(["index.js"]);
  });

  it("empties the destination before direct sibling output", async () => {
    const outdir = join(root, "bundle");
    await mkdir(outdir);
    await writeFile(join(outdir, "stale.js"), "from an earlier build");
    const artifact = await run(Commit.output(outdir, (out) => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      expect(out).toBe(outdir);
      expect(yield* fs.exists(out)).toBe(false);
      yield* fs.makeDirectory(out);
      yield* fs.writeFileString(join(out, "index.js"), "export {};\n");
      return yield* Artifact.directory(out, producer);
    }), { atomic: false }, "sibling"));
    expect(artifact.entries.map((entry) => entry.path)).toEqual(["index.js"]);
    expect(await readdir(outdir)).toEqual(["index.js"]);
  });
});

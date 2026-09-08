import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Archive from "effect-build-archives";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const gitExecutable = process.env.EFFECT_BUILD_GIT;
const windows = process.platform === "win32";
const formats = ["zip", "tar.gz"] as const;
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const runSource = <A, E>(effect: Effect.Effect<A, E, Archive.Archive | NodeServices.NodeServices>) =>
  run(effect.pipe(Effect.provide(Archive.layer(gitExecutable === undefined ? {} : { executable: gitExecutable }))));
const pack = (format: typeof formats[number], input: Archive.ArchiveInput) =>
  format === "zip" ? Archive.zip(input) : Archive.tarGz(input);
const extract = async (format: typeof formats[number], archive: string, directory: string) => {
  await mkdir(directory, { recursive: true });
  if (windows) return execute("tar", ["-xf", archive, "-C", directory]);
  return execute(format === "zip" ? "unzip" : "tar", format === "zip"
    ? ["-q", archive, "-d", directory]
    : ["-xzf", archive, "-C", directory]);
};
const git = async (repository: string, args: readonly string[]) =>
  (await execute(gitExecutable ?? "git", [...args], { cwd: repository })).stdout.trim();
let root: string;
let payload: Artifact.File;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-archives-"));
  await writeFile(join(root, "payload"), "archive payload\n");
  payload = await run(Artifact.file(join(root, "payload"), { name: "fixture", version: "0.7.0" }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("archives from real files", () => {
  it.each(formats)("keeps a native executable runnable after extracting %s", async (format) => {
    const executable = await run(Artifact.executable(process.execPath, { name: "fixture", version: "0.7.0" }));
    const name = windows ? "tool.exe" : "tool";
    const archived = await run(pack(format, {
      entries: [{ artifact: executable, path: name }], outfile: join(root, `executable.${format}`),
    }));
    const directory = join(root, "extracted");
    await extract(format, archived.path, directory);
    expect((await execute(join(directory, name), ["-e", "console.log(42)"])).stdout.trim()).toBe("42");
    if (!windows) expect((await stat(join(directory, name))).mode & 0o777).toBe(0o755);
  }, 60_000);

  it.each(formats)("makes deterministic %s archives with executable modes and long paths", async (format) => {
    const longPath = `${"long-".repeat(28)}/${"é".repeat(55)}/payload.txt`;
    const unicodePaths = ["café.txt", `prefix/${"é".repeat(55)}/payload.txt`];
    const entries = [
      { artifact: payload, path: longPath },
      ...unicodePaths.map((path) => ({ artifact: payload, path })),
      { artifact: payload, path: "bin/tool", executable: true },
    ];
    const first = await run(pack(format, { entries, outfile: join(root, `one.${format}`) }));
    const second = await run(pack(format, { entries: [...entries].reverse(), outfile: join(root, `two.${format}`) }));
    expect(await readFile(first.path)).toEqual(await readFile(second.path));
    expect(await run(Artifact.verify(first))).toEqual(first);
    const directory = join(root, "extracted");
    await extract(format, first.path, directory);
    expect(await readFile(join(directory, longPath), "utf8")).toBe("archive payload\n");
    for (const path of unicodePaths) expect(await readFile(join(directory, path), "utf8")).toBe("archive payload\n");
    expect(await readFile(join(directory, "bin/tool"), "utf8")).toBe("archive payload\n");
    if (!windows) {
      expect((await stat(join(directory, "bin/tool"))).mode & 0o777).toBe(0o755);
      expect((await stat(join(directory, longPath))).mode & 0o777).toBe(0o644);
    }
  });

  const unsafe = [
    ["parent traversal", ["../escape", "safe"]],
    ["absolute path", ["/absolute", "safe"]],
    ["Windows path", ["C:\\escape", "safe"]],
    ["duplicate path", ["same", "same"]],
    ["case collision", ["Readme", "README"]],
    ["case-folded ancestor", ["Bin", "bin/tool"]],
    ["Unicode-equivalent ancestor", ["café", "cafe\u0301/tool"]],
  ] as const;
  it.each(formats.flatMap((format) => unsafe.map(([label, paths]) => ({ format, label, paths }))))(
    "rejects $label in $format without creating output",
    async ({ format, paths }) => {
      const outfile = join(root, `invalid.${format}`);
      for (const ordered of [paths, [...paths].reverse()]) {
        const failure = await run(pack(format, {
          entries: ordered.map((path) => ({ artifact: payload, path })), outfile,
        }).pipe(Effect.flip));
        expect(failure._tag).toBe("ArchiveInputInvalid");
      }
      expect(await readdir(root)).toEqual(["payload"]);
    },
  );

  it.each(formats)("refuses changed input bytes and preserves an existing %s output", async (format) => {
    const outfile = join(root, `existing.${format}`);
    await writeFile(outfile, "previous output");
    await writeFile(payload.path, "changed payload\n");
    const failure = await run(pack(format, {
      entries: [{ artifact: payload, path: "payload" }], outfile,
    }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
    expect(await readFile(outfile, "utf8")).toBe("previous output");
    expect((await readdir(root)).sort()).toEqual([`existing.${format}`, "payload"]);
  });
});

describe("archives from a Git tree", () => {
  it.each(formats)("keeps %s bytes independent of checkout line-ending preferences", async (format) => {
    const repository = join(root, "repository");
    await mkdir(repository);
    await git(repository, ["init", "--initial-branch=main"]);
    await git(repository, ["config", "core.autocrlf", "false"]);
    await git(repository, ["config", "core.eol", "lf"]);
    const binary = Buffer.from([0, 13, 10, 255]);
    await writeFile(join(repository, "plain.txt"), "selected tree\n");
    await writeFile(join(repository, "text.txt"), "tracked text\n");
    await writeFile(join(repository, "windows.txt"), "tracked CRLF\n");
    await writeFile(join(repository, "binary.bin"), binary);
    await writeFile(join(repository, ".gitattributes"), "text.txt text\nwindows.txt text eol=crlf\nbinary.bin -text\n");
    await git(repository, ["add", "."]);
    const tree = await git(repository, ["write-tree"]);
    const input = { repository, tree, project: "fixture", version: "1.2.3", format };
    const first = await runSource(Archive.source({ ...input, outfile: join(root, `lf.${format}`) }));
    await git(repository, ["config", "core.autocrlf", "true"]);
    await git(repository, ["config", "core.eol", "crlf"]);
    const second = await runSource(Archive.source({ ...input, outfile: join(root, `crlf.${format}`) }));
    expect(await readFile(second.path)).toEqual(await readFile(first.path));
    const directory = join(root, "extracted");
    await extract(format, second.path, directory);
    const project = join(directory, "fixture-1.2.3");
    expect(await readFile(join(project, "plain.txt"), "utf8")).toBe("selected tree\n");
    expect(await readFile(join(project, "text.txt"), "utf8")).toBe("tracked text\n");
    expect(await readFile(join(project, "windows.txt"), "utf8")).toBe("tracked CRLF\r\n");
    expect(await readFile(join(project, "binary.bin"))).toEqual(binary);
  });

  it.each(formats)("preserves the selected tree's files and symlinks in deterministic %s output", async (format) => {
    const repository = join(root, "repository");
    await mkdir(join(repository, "dist"), { recursive: true });
    await git(repository, ["init", "--initial-branch=main"]);
    await git(repository, ["config", "user.name", "archive fixture"]);
    await git(repository, ["config", "user.email", "archive@example.test"]);
    await writeFile(join(repository, "README.md"), "committed readme\n");
    await writeFile(join(repository, "café.txt"), "short Unicode path\n");
    await writeFile(join(repository, "secret"), "excluded by git attributes\n");
    await writeFile(join(repository, ".gitattributes"), "secret export-ignore\n");
    await writeFile(join(repository, "dist/compiled.js"), "excluded build output\n");
    const lfs = `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 17\n`;
    await writeFile(join(repository, "asset.lfs"), lfs);
    const longPath = `${"é".repeat(55)}/${windows ? "long-name" : "trailing-name "}`;
    await mkdir(join(repository, "é".repeat(55)));
    await writeFile(join(repository, longPath), "long path contents\n");
    if (!windows) {
      await symlink(longPath, join(repository, "long.link"));
      await symlink("café.txt", join(repository, "short.link"));
    }
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "add source fixture"]);
    const commit = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["update-index", "--add", "--cacheinfo", `160000,${commit},submodule`]);
    const tree = await git(repository, ["write-tree"]);
    await writeFile(join(repository, "README.md"), "uncommitted contents must not be packaged\n");
    const input = { repository, tree, project: "fixture", version: "1.2.3", format };
    const first = await runSource(Archive.source({ ...input, outfile: join(root, `source-one.${format}`) }));
    const second = await runSource(Archive.source({ ...input, outfile: join(root, `source-two.${format}`) }));
    expect(await readFile(first.path)).toEqual(await readFile(second.path));
    expect(await run(Artifact.verify(first))).toEqual(first);
    const directory = join(root, "extracted");
    await extract(format, first.path, directory);
    const project = join(directory, "fixture-1.2.3");
    const names = await readdir(project);
    expect(names).not.toContain("secret");
    expect(names).not.toContain("dist");
    expect(names).not.toContain("submodule");
    expect(await readFile(join(project, "README.md"), "utf8")).toBe("committed readme\n");
    expect(await readFile(join(project, "asset.lfs"), "utf8")).toBe(lfs);
    expect(await readFile(join(project, longPath), "utf8")).toBe("long path contents\n");
    expect(await readFile(join(project, "café.txt"), "utf8")).toBe("short Unicode path\n");
    if (!windows) {
      expect((await readlink(join(project, "long.link"))).normalize("NFC")).toBe(longPath);
      expect((await readlink(join(project, "short.link"))).normalize("NFC")).toBe("café.txt");
    }
  }, 15_000);
});

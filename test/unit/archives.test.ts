import { NodeServices } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { Artifact } from "effect-build";
import * as Archive from "effect-build-archives";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  truncate,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { standaloneProgram } from "../fixtures/standalone-program.js";

const execute = promisify(execFile);
const gitExecutable = process.env.EFFECT_BUILD_GIT;
const windows = process.platform === "win32";
const formats = ["zip", "tar.gz"] as const;
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const runSource = <A, E>(effect: Effect.Effect<A, E, Archive.Archive | NodeServices.NodeServices>) =>
  run(effect.pipe(Effect.provide(Archive.layer({ executable: gitExecutable }))));
const pack = (format: typeof formats[number], input: Archive.ArchiveInput) =>
  format === "zip" ? Archive.zip(input) : Archive.tarGz(input);
const extract = async (format: typeof formats[number], archive: string, directory: string) => {
  await mkdir(directory, { recursive: true });
  if (windows) return execute("tar", ["-xf", archive, "-C", directory]);
  return execute(
    format === "zip" ? "unzip" : "tar",
    format === "zip"
      ? ["-q", archive, "-d", directory]
      : ["-xzf", archive, "-C", directory],
  );
};
const git = async (repository: string, args: readonly string[]) =>
  (await execute(gitExecutable ?? "git", [...args], { cwd: repository })).stdout.trim();
/** 200,000 bytes that neither repeat nor compress away, so DEFLATE block boundaries matter. */
const largePayload = Buffer.alloc(200_000, 0).map((_, index) => (index * 7919) & 0xff);
const pinned = { zip: "3afa1bda0aec2f5c36411189bb1c4e83ed3988a273b0dc4633b19f4f577dbe2a" };
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let root: string;
let payload: Artifact.File;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-archives-"));
  await writeFile(join(root, "payload"), "archive payload\n");
  payload = await run(Artifact.file(join(root, "payload"), { name: "fixture", version: "0.7.0" }));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("archives from real files", () => {
  it.each(formats)("reports an unwritable %s destination and preserves its directory", async (format) => {
    const outfile = join(root, `blocked.${format}`);
    await mkdir(outfile);
    await writeFile(join(outfile, "retained"), "existing tree");
    const failure = await run(
      pack(format, { entries: [{ artifact: payload, path: "payload" }], outfile, atomic: false }).pipe(Effect.flip),
    );
    expect(failure).toMatchObject({ _tag: "ArtifactError", path: outfile, reason: "unwritable" });
    expect(await readFile(join(outfile, "retained"), "utf8")).toBe("existing tree");
    expect((await readdir(root)).sort()).toEqual([`blocked.${format}`, "payload"]);
  });

  it("rejects more entries than ZIP32 can index before reading artifact contents", async () => {
    const entries = Array.from({ length: 65_536 }, (_, index) => ({ artifact: payload, path: `file-${index}` }));
    expect(await run(Archive.zip({ entries, outfile: join(root, "overflow.zip") }).pipe(Effect.flip))).toMatchObject({
      _tag: "ArchiveFormatLimit",
      format: "zip",
      limit: "entries",
      maximum: 65_535,
    });
    expect(await readdir(root)).toEqual(["payload"]);
  });

  it.each(formats)("refuses to replace an existing %s archive when onExists is fail", async (format) => {
    const outfile = join(root, `archive.${format}`);
    const first = await run(pack(format, { entries: [{ artifact: payload, path: "payload" }], outfile }));
    for (const atomic of [true, false]) {
      const failure = await run(
        pack(format, { entries: [{ artifact: payload, path: "payload" }], outfile, atomic, onExists: "fail" }).pipe(
          Effect.flip,
        ),
      );
      expect(failure).toMatchObject({ _tag: "CommitError", destination: outfile, reason: "exists" });
    }
    expect(await run(Artifact.verify(first))).toEqual(first);
    expect((await readdir(root)).sort()).toEqual([`archive.${format}`, "payload"]);
  });

  it("streams an input larger than any fixed buffer into a zip", async () => {
    const size = 600 * 1024 * 1024, large = join(root, "large.bin");
    await writeFile(large, "");
    await truncate(large, size);
    const artifact = await run(Artifact.file(large, payload.producedBy));
    const archived = await run(
      Archive.zip({ entries: [{ artifact, path: "large.bin" }], outfile: join(root, "large.zip") }),
    );
    expect(archived.bytes).toBeLessThan(4 * 1024 * 1024);
    const directory = join(root, "extracted");
    await extract("zip", archived.path, directory);
    expect((await stat(join(directory, "large.bin"))).size).toBe(size);
  }, 300_000);
  it.each(formats)("compresses repeated input in deterministic %s output", async (format) => {
    await writeFile(payload.path, "x".repeat(1024 * 1024));
    const artifact = await run(Artifact.file(payload.path, payload.producedBy));
    const input = { entries: [{ artifact, path: "large.txt" }], outfile: join(root, `compressed.${format}`) };
    const first = await run(pack(format, input));
    expect(first.bytes).toBeLessThan(10_000);
    const second = await run(pack(format, { ...input, outfile: join(root, `repeat.${format}`) }));
    expect(await readFile(first.path)).toEqual(await readFile(second.path));
    const directory = join(root, "extracted");
    await extract(format, first.path, directory);
    expect(await readFile(join(directory, "large.txt"), "utf8")).toBe("x".repeat(1024 * 1024));
  });

  it.each(
    [
      ["zip", pinned.zip],
      // Changed once, in 0.7: gzip now sees the tar in 64 KiB pieces instead of one push per header or payload chunk.
      ["tar.gz", "ff0200c272dcbd0f12bca15bf503c730b36de663ce9fa46ec9362df1915c6491"],
    ] as const,
  )("writes the same %s bytes as the previous release for a fixed input", async (format, sha256) => {
    // A changed digest here is a format change: extractors still work, but persisted checksums no longer match.
    await writeFile(join(root, "large"), largePayload);
    const large = await run(Artifact.file(join(root, "large"), payload.producedBy));
    const entries = [
      { artifact: payload, path: "docs/café.txt" },
      { artifact: large, path: `${"long-".repeat(28)}/payload.bin` },
      { artifact: payload, path: "bin/tool", executable: true },
    ];
    const archived = await run(pack(format, { entries, outfile: join(root, `pinned.${format}`) }));
    expect(archived.sha256).toBe(sha256);
  });

  it.each([["zip", 0x1_0000_0000], ["tar.gz", 0o100000000000]] as const)(
    "rejects an entry %s cannot represent before reading artifact contents",
    async (format, bytes) => {
      const artifact = { ...payload, bytes };
      const failure = await run(
        pack(format, { entries: [{ artifact, path: "data" }], outfile: join(root, "output") }).pipe(Effect.flip),
      );
      expect(failure).toBeInstanceOf(Archive.FormatLimit);
      expect(failure).toMatchObject({ format: format === "zip" ? "zip" : "tar", limit: "entry-bytes", path: "data" });
      expect(await readdir(root)).toEqual(["payload"]);
    },
  );

  it.each(formats)("keeps a native executable runnable after extracting %s", async (format) => {
    const name = windows ? "tool.exe" : "tool";
    const program = join(root, name);
    await standaloneProgram(program);
    const executable = await run(Artifact.executable(program, { name: "fixture", version: "0.7.0" }));
    const archived = await run(pack(format, {
      entries: [{ artifact: executable, path: name }],
      outfile: join(root, `executable.${format}`),
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
    ["implicit directory case collision", ["Docs/a", "docs/b"]],
    ["implicit directory Unicode collision", ["café/a", "cafe\u0301/b"]],
    ["case-folded ancestor", ["Bin", "bin/tool"]],
    ["Unicode-equivalent ancestor", ["café", "cafe\u0301/tool"]],
  ] as const;
  it.each(formats.flatMap((format) => unsafe.map(([label, paths]) => ({ format, label, paths }))))(
    "rejects $label in $format without creating output",
    async ({ format, paths }) => {
      const outfile = join(root, `invalid.${format}`);
      for (const ordered of [paths, [...paths].reverse()]) {
        const failure = await run(
          pack(format, {
            entries: ordered.map((path) => ({ artifact: payload, path })),
            outfile,
          }).pipe(Effect.flip),
        );
        expect(failure._tag).toBe("InputInvalid");
      }
      expect(await readdir(root)).toEqual(["payload"]);
    },
  );

  it.each(formats)("refuses changed input bytes and preserves an existing %s output", async (format) => {
    const outfile = join(root, `existing.${format}`);
    await writeFile(outfile, "previous output");
    await writeFile(payload.path, "changed payload\n");
    const failure = await run(
      pack(format, {
        entries: [{ artifact: payload, path: "payload" }],
        outfile,
      }).pipe(Effect.flip),
    );
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
    expect(await readFile(outfile, "utf8")).toBe("previous output");
    expect((await readdir(root)).sort()).toEqual([`existing.${format}`, "payload"]);
  });
});

describe("archives from real directories", () => {
  it.each(formats)(
    "round-trips executable trees, links, empty directories and modes through deterministic %s",
    async (format) => {
      const source = join(root, "source"), tool = windows ? "tool.exe" : "tool";
      await mkdir(join(source, "share"), { recursive: true });
      await mkdir(join(source, "empty"));
      await standaloneProgram(join(source, tool));
      await writeFile(join(source, "share/data.txt"), "directory payload\n");
      if (!windows) {
        await chmod(source, 0o700);
        await chmod(join(source, tool), 0o751);
        await chmod(join(source, "share/data.txt"), 0o640);
        await chmod(join(source, "empty"), 0o750);
        await symlink("share", join(source, "current"));
        await symlink("missing", join(source, "dangling"));
      }
      const artifact = await run(Artifact.directory(source, payload.producedBy));
      const entries = [{ artifact, path: "app" }, { artifact: payload, path: "README" }];
      const first = await run(pack(format, { entries, outfile: join(root, `one.${format}`) }));
      await utimes(join(source, "share/data.txt"), 0, 0);
      await utimes(join(source, "empty"), 0, 0);
      const second = await run(pack(format, { entries: [...entries].reverse(), outfile: join(root, `two.${format}`) }));
      expect((await readFile(second.path)).equals(await readFile(first.path))).toBe(true);
      const directory = join(root, "extracted");
      await extract(format, first.path, directory);
      expect((await execute(join(directory, "app", tool), ["-e", "console.log(42)"])).stdout.trim()).toBe("42");
      expect(await readFile(join(directory, "app/share/data.txt"), "utf8")).toBe("directory payload\n");
      expect(await readdir(join(directory, "app/empty"))).toEqual([]);
      expect(await readFile(join(directory, "README"), "utf8")).toBe("archive payload\n");
      if (!windows) {
        expect((await stat(join(directory, "app"))).mode & 0o777).toBe(0o755);
        expect((await stat(join(directory, "app", tool))).mode & 0o777).toBe(0o751);
        expect((await stat(join(directory, "app/share/data.txt"))).mode & 0o777).toBe(0o640);
        expect((await stat(join(directory, "app/empty"))).mode & 0o777).toBe(0o750);
        expect(await readlink(join(directory, "app/current"))).toBe("share");
        expect(await readlink(join(directory, "app/dangling"))).toBe("missing");
      }
    },
    60_000,
  );

  it.each(formats)("refuses changed tree contents or membership before replacing %s", async (format) => {
    const source = join(root, "source"), outfile = join(root, `existing.${format}`);
    await mkdir(source);
    await writeFile(join(source, "file"), "original");
    const artifact = await run(Artifact.directory(source, payload.producedBy));
    await writeFile(outfile, "previous output");
    for (const change of ["contents", "addition", "removal"] as const) {
      if (change === "contents") await writeFile(join(source, "file"), "modified");
      if (change === "addition") {
        await writeFile(join(source, "file"), "original");
        await mkdir(join(source, "added"));
      }
      if (change === "removal") {
        await rm(join(source, "added"), { recursive: true });
        await rm(join(source, "file"));
      }
      const failure = await run(pack(format, { entries: [{ artifact, path: "app" }], outfile }).pipe(Effect.flip));
      expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
      expect(await readFile(outfile, "utf8")).toBe("previous output");
    }
    expect((await readdir(root)).sort()).toEqual([`existing.${format}`, "payload", "source"]);
  });

  it.each(formats)("uses the verified tree instead of forged manifest paths when producing %s", async (format) => {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "inside"), "real tree\n");
    const artifact = await run(Artifact.directory(source, payload.producedBy));
    const forged: Artifact.Directory = {
      ...artifact,
      entries: [{ path: "../payload", kind: "file", bytes: payload.bytes, sha256: payload.sha256, mode: 0o644 }],
    };
    const first = await run(
      pack(format, { entries: [{ artifact, path: "app" }], outfile: join(root, `real.${format}`) }),
    );
    const second = await run(
      pack(format, { entries: [{ artifact: forged, path: "app" }], outfile: join(root, `forged.${format}`) }),
    );
    expect(await readFile(second.path)).toEqual(await readFile(first.path));
    const directory = join(root, "extracted");
    await extract(format, second.path, directory);
    expect(await readdir(directory)).toEqual(["app"]);
    expect(await readdir(join(directory, "app"))).toEqual(["inside"]);
    expect(await readFile(join(directory, "app/inside"), "utf8")).toBe("real tree\n");
  });

  it.each(formats)("rejects directory prefix traversal, overrides and mixed-entry collisions in %s", async (format) => {
    const source = join(root, "source"), outfile = join(root, `invalid.${format}`);
    await mkdir(source);
    await writeFile(join(source, "file"), "inside\n");
    const artifact = await run(Artifact.directory(source, payload.producedBy));
    const invalid: readonly (readonly Archive.ArchiveEntry[])[] = [
      ...["", "../escape", "/absolute", "C:\\escape"].map((path) => [{ artifact, path }]),
      [{ artifact, path: "app", executable: true }],
      ...["app/file", "APP/file", "APP/other", "APP", "app/file/child"].map((path) => [
        { artifact, path: "app" },
        { artifact: payload, path },
      ]),
    ];
    for (const entries of invalid) {
      for (const ordered of [entries, [...entries].reverse()]) {
        const failure = await run(pack(format, { entries: ordered, outfile }).pipe(Effect.flip));
        expect(failure._tag).toBe("InputInvalid");
      }
    }
    expect((await readdir(root)).sort()).toEqual(["payload", "source"]);
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
    await writeFile(join(repository, ".gitattributes"), "secret export-ignore\ndist export-ignore\n");
    await writeFile(join(repository, "dist/compiled.js"), "excluded build output\n");
    for (const directory of ["build", "target", "out"]) {
      await mkdir(join(repository, directory));
      await writeFile(join(repository, directory, "source.ts"), "tracked source\n");
    }
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
    for (const directory of ["build", "target", "out"]) {
      expect(await readFile(join(project, directory, "source.ts"), "utf8")).toBe("tracked source\n");
    }
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

describe("Zip.encode", () => {
  const small = new TextEncoder().encode("archive payload\n");
  const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
    Effect.runPromise(Stream.runCollect(stream).pipe(Effect.map((chunks) => Buffer.concat(chunks))));
  const chunked = (bytes: Uint8Array, size: number) =>
    Stream.fromIterable(
      Array.from({ length: Math.ceil(bytes.byteLength / size) }, (_, index) =>
        bytes.subarray(index * size, (index + 1) * size)),
    );
  const entries = (size: number): Archive.Zip.FileEntry[] => [
    { kind: "file", path: "docs/café.txt", mode: 0o644, bytes: small.byteLength, contents: chunked(small, size) },
    {
      kind: "file",
      path: `${"long-".repeat(28)}/payload.bin`,
      mode: 0o644,
      bytes: largePayload.byteLength,
      contents: chunked(largePayload, size),
    },
    { kind: "file", path: "bin/tool", mode: 0o755, bytes: small.byteLength, contents: chunked(small, size) },
  ];

  it.each([1, 7, 4096, 64 * 1024, 200_000])(
    "writes the pinned bytes when payloads arrive in %d-byte chunks",
    async (size) => {
      expect(sha256(await collect(Archive.Zip.encode(entries(size))))).toBe(pinned.zip);
    },
  );

  it("compresses afresh on every run of the same stream", async () => {
    const stream = Archive.Zip.encode(entries(4096));
    expect(sha256(await collect(stream))).toBe(pinned.zip);
    expect(sha256(await collect(stream))).toBe(pinned.zip);
  });

  it.each([-1, 1])("fails with the counted bytes when a payload is off by %d", async (delta) => {
    const [first, ...rest] = entries(4096);
    const stream = Archive.Zip.encode([{ ...first!, bytes: small.byteLength + delta }, ...rest]);
    expect(await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.flip))).toMatchObject({
      _tag: "ArchiveEntrySizeMismatch",
      path: "docs/café.txt",
      expected: small.byteLength + delta,
      actual: small.byteLength,
    });
  });

  it("fails with the limit that Zip.limit reports before emitting anything", async () => {
    const many: Archive.Zip.Entry[] = Array.from(
      { length: 65_536 },
      (_, index) => ({ kind: "file", path: `file-${index}`, mode: 0o644, bytes: 0, contents: Stream.empty }),
    );
    const limit = { _tag: "ArchiveFormatLimit", format: "zip", limit: "entries", maximum: 65_535 };
    expect(Archive.Zip.limit(many)).toMatchObject(limit);
    const emitted: Uint8Array[] = [];
    const stream = Archive.Zip.encode(many).pipe(Stream.tap((chunk) => Effect.sync(() => emitted.push(chunk))));
    expect(await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.flip))).toMatchObject(limit);
    expect(emitted).toEqual([]);
  });

  it.skipIf(windows)("writes directories and symlinks that unzip restores", async () => {
    const outfile = join(root, "tree.zip");
    await writeFile(
      outfile,
      await collect(Archive.Zip.encode([
        { kind: "directory", path: "app", mode: 0o750 },
        { kind: "file", path: "app/data.txt", mode: 0o640, bytes: small.byteLength, contents: Stream.make(small) },
        { kind: "symlink", path: "app/current", mode: 0o777, target: "data.txt" },
      ])),
    );
    const directory = join(root, "extracted");
    await extract("zip", outfile, directory);
    expect(await readFile(join(directory, "app/data.txt"), "utf8")).toBe("archive payload\n");
    expect(await readlink(join(directory, "app/current"))).toBe("data.txt");
    expect((await stat(join(directory, "app"))).mode & 0o777).toBe(0o750);
    expect((await stat(join(directory, "app/data.txt"))).mode & 0o777).toBe(0o640);
  });
});

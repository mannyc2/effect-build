import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Archive from "../../packages/effect-build-archives/src/Archive.js";
import { decodeGitTar, encodeTar } from "../../packages/effect-build-archives/src/internal/archive.js";
import * as SourceArchive from "../../packages/effect-build-archives/src/SourceArchive.js";
import { finalizedFile } from "../fixtures/finalized-artifacts.js";
import { installFixtureExecutable } from "../fixtures/tools/install-fixture-executable.js";

const decoder = new TextDecoder();
const gitTreeProjectionTest =
  "projects one exact Git tree into both source formats without worktree, submodule, or build-output bytes";

const uint16 = (bytes: Uint8Array, offset: number): number => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);

const uint32 = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16)
    | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;

interface ZipEntry {
  readonly name: string;
  readonly mode: number;
  readonly contents: Uint8Array;
  readonly modifiedTime: number;
  readonly modifiedDate: number;
}

const readZip = (bytes: Uint8Array): readonly ZipEntry[] => {
  let end = bytes.byteLength - 22;
  while (end >= 0 && uint32(bytes, end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("missing ZIP end record");
  const count = uint16(bytes, end + 10);
  let offset = uint32(bytes, end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (uint32(bytes, offset) !== 0x02014b50) throw new Error("invalid ZIP central record");
    const nameLength = uint16(bytes, offset + 28);
    const extraLength = uint16(bytes, offset + 30);
    const commentLength = uint16(bytes, offset + 32);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const local = uint32(bytes, offset + 42);
    if (uint32(bytes, local) !== 0x04034b50) throw new Error("invalid ZIP local record");
    const localNameLength = uint16(bytes, local + 26);
    const localExtraLength = uint16(bytes, local + 28);
    const size = uint32(bytes, local + 22);
    const data = local + 30 + localNameLength + localExtraLength;
    entries.push({
      name,
      mode: uint32(bytes, offset + 38) >>> 16,
      contents: bytes.slice(data, data + size),
      modifiedTime: uint16(bytes, offset + 12),
      modifiedDate: uint16(bytes, offset + 14),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

interface TarEntry {
  readonly name: string;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly modified: number;
  readonly type: string;
  readonly link: string;
  readonly contents: Uint8Array;
}

const tarField = (header: Uint8Array, offset: number, length: number): string =>
  (() => {
    const value = decoder.decode(header.subarray(offset, offset + length));
    const nul = value.indexOf("\0");
    return (nul === -1 ? value : value.slice(0, nul)).trimEnd();
  })();

const tarNumber = (header: Uint8Array, offset: number, length: number): number => {
  const value = tarField(header, offset, length).trim();
  return value === "" ? 0 : Number.parseInt(value, 8);
};

const readTarGzip = (archive: Uint8Array): readonly TarEntry[] => {
  const bytes = new Uint8Array(gunzipSync(archive));
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const prefix = tarField(header, 345, 155);
    const local = tarField(header, 0, 100);
    const size = tarNumber(header, 124, 12);
    const contents = bytes.slice(offset + 512, offset + 512 + size);
    entries.push({
      name: prefix === "" ? local : `${prefix}/${local}`,
      mode: tarNumber(header, 100, 8),
      uid: tarNumber(header, 108, 8),
      gid: tarNumber(header, 116, 8),
      modified: tarNumber(header, 136, 12),
      type: tarField(header, 156, 1) || "0",
      link: tarField(header, 157, 100),
      contents,
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
};

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-git-archive-hard-cut.mjs", import.meta.url)));
const tree = "1".repeat(40);
let root = "";
let git = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-archives-hard-cut-"));
  git = await installFixtureExecutable({ fixture, root, name: "git" });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const regularArtifact = async (name: string, contents: string) => {
  const path = join(root, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, contents);
  return finalizedFile(path);
};

const runArchive = <A, E>(effect: Effect.Effect<A, E, Archive.Archiver>) =>
  Effect.runPromiseExit(
    effect.pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>,
  );

const runSource = <A, E>(effect: Effect.Effect<A, E, SourceArchive.SourceArchiver>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(SourceArchive.layer({ executable: git })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

describe.sequential("deterministic archive hard cut", () => {
  it("round-trips trailing spaces and byte-counted non-ASCII PAX path/link fields", () => {
    const longPart = `pax-${"é".repeat(60)}`;
    const longTarget = `${"目标".repeat(45)}/payload.txt`;
    const encoded = encodeTar([
      {
        path: "trailing-name ",
        kind: "file",
        mode: 0o644,
        contents: new TextEncoder().encode("exact"),
      },
      {
        path: `${longPart}/payload.link`,
        kind: "symlink",
        mode: 0o777,
        contents: new Uint8Array(),
        linkTarget: longTarget,
      },
      {
        path: "trailing-link",
        kind: "symlink",
        mode: 0o777,
        contents: new Uint8Array(),
        linkTarget: "target ",
      },
    ]);
    const decoded = decodeGitTar(encoded);
    expect(decoded.map(({ path }) => path)).toEqual([
      `${longPart}/payload.link`,
      "trailing-link",
      "trailing-name ",
    ]);
    expect(decoded.find(({ path }) => path.endsWith("payload.link"))?.linkTarget).toBe(longTarget);
    expect(decoded.find(({ path }) => path === "trailing-link")?.linkTarget).toBe("target ");

    const paxSize = tarNumber(encoded.subarray(0, 512), 124, 12);
    const symlinkHeaderOffset = 512 + Math.ceil(paxSize / 512) * 512;
    const symlinkHeader = encoded.subarray(symlinkHeaderOffset, symlinkHeaderOffset + 512);
    expect(tarField(symlinkHeader, 156, 1)).toBe("2");
    expect(tarField(symlinkHeader, 157, 100)).toBe("././@LongSymLink");
  });

  it("emits byte-identical ZIP and tar.gz with normalized metadata and independent listings", async () => {
    const executable = await regularArtifact("inputs/tool", "#!/bin/sh\necho ok\n");
    const readme = await regularArtifact("inputs/README.md", "portable fixture\n");
    const entries = [
      new Archive.ArchiveEntry({ artifact: readme, path: "docs/README.md" }),
      new Archive.ArchiveEntry({ artifact: executable, path: "bin/tool", executable: true }),
    ] as const;
    const exit = await runArchive(
      Effect.all([
        Archive.archive(new Archive.ArchiveInput({ format: "zip", entries, outfile: join(root, "one.zip") })),
        Archive.archive(
          new Archive.ArchiveInput({
            format: "zip",
            entries: [entries[1], entries[0]],
            outfile: join(root, "two.zip"),
          }),
        ),
        Archive.archive(new Archive.ArchiveInput({ format: "tar.gz", entries, outfile: join(root, "one.tar.gz") })),
        Archive.archive(
          new Archive.ArchiveInput({
            format: "tar.gz",
            entries: [entries[1], entries[0]],
            outfile: join(root, "two.tar.gz"),
          }),
        ),
      ], { concurrency: 1 }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const oneZip = new Uint8Array(await readFile(join(root, "one.zip")));
    const twoZip = new Uint8Array(await readFile(join(root, "two.zip")));
    const oneTar = new Uint8Array(await readFile(join(root, "one.tar.gz")));
    const twoTar = new Uint8Array(await readFile(join(root, "two.tar.gz")));
    expect(oneZip).toEqual(twoZip);
    expect(oneTar).toEqual(twoTar);
    const zip = readZip(oneZip);
    expect(zip.map((entry) => entry.name)).toEqual(["bin/tool", "docs/README.md"]);
    expect(zip.map((entry) => entry.mode)).toEqual([0o100755, 0o100644]);
    expect(zip.every((entry) => entry.modifiedTime === 0 && entry.modifiedDate === 0x21)).toBe(true);
    expect(decoder.decode(zip[0]?.contents)).toContain("echo ok");
    expect(Array.from(oneTar.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(oneTar[9]).toBe(0xff);
    const tar = readTarGzip(oneTar);
    expect(tar.map((entry) => entry.name)).toEqual(["bin/tool", "docs/README.md"]);
    expect(tar.map((entry) => entry.mode)).toEqual([0o755, 0o644]);
    expect(tar.every((entry) => entry.uid === 0 && entry.gid === 0 && entry.modified === 0)).toBe(true);
  });

  it.each([
    ["traversal", ["../escape", "safe"]],
    ["duplicate", ["same", "same"]],
    ["case collision", ["Readme", "README"]],
    ["Unicode normalization collision", ["café", "cafe\u0301"]],
    ["file prefix collision", ["bin", "bin/tool"]],
  ])("rejects %s layouts before publication", async (_label, paths) => {
    const first = await regularArtifact(`negative/${Math.random()}/first`, "one");
    const second = await regularArtifact(`negative/${Math.random()}/second`, "two");
    const outfile = join(root, `negative-${Math.random()}.zip`);
    const exit = await runArchive(
      Archive.archive(
        new Archive.ArchiveInput({
          format: "zip",
          entries: [
            new Archive.ArchiveEntry({ artifact: first, path: paths[0] ?? "" }),
            new Archive.ArchiveEntry({ artifact: second, path: paths[1] ?? "" }),
          ],
          outfile,
        }),
      ),
    );
    expect((failureOf(exit) as { readonly _tag: string })._tag).toBe("UnsafeArchiveLayout");
    await expect(readFile(outfile)).rejects.toThrow();
  });

  it("rejects an artifact path changed after finalization", async () => {
    const artifact = await regularArtifact("mutated/input", "original");
    await writeFile(artifact.path, "changed!");
    const exit = await runArchive(Archive.archive(
      new Archive.ArchiveInput({
        format: "zip",
        entries: [new Archive.ArchiveEntry({ artifact, path: "input" })],
        outfile: join(root, "mutated.zip"),
      }),
    ));
    expect((failureOf(exit) as { readonly _tag: string })._tag).toBe("FileVerificationFailed");
    await expect(readFile(join(root, "mutated.zip"))).rejects.toThrow();
  });

  it("rejects an unrecognized archive format at the runtime boundary", async () => {
    const artifact = await regularArtifact("invalid-format/input", "payload");
    const outfile = join(root, "invalid-format.bin");
    const exit = await runArchive(Archive.archive({
      format: "rar",
      entries: [{ artifact, path: "input" }],
      outfile,
    } as unknown as Archive.ArchiveInput));
    expect((failureOf(exit) as { readonly _tag: string })._tag).toBe("ArchiveFailed");
    await expect(readFile(outfile)).rejects.toThrow();
  });

  it("rejects archive format/output mismatches at both operation boundaries", async () => {
    const artifact = await regularArtifact("mismatched-extension/input", "payload");
    const binaryOutfile = join(root, "mismatched-extension.tar.gz");
    const binary = await runArchive(Archive.archive(
      new Archive.ArchiveInput({
        format: "zip",
        entries: [new Archive.ArchiveEntry({ artifact, path: "input" })],
        outfile: binaryOutfile,
      }),
    ));
    expect(failureOf(binary)).toMatchObject({ _tag: "ArchiveFailed", operation: "validate input" });
    await expect(readFile(binaryOutfile)).rejects.toThrow();

    const sourceOutfile = join(root, "mismatched-source.zip");
    const source = await runSource(SourceArchive.sourceArchive(
      new SourceArchive.SourceArchiveInput({
        repository: join(root, "repository"),
        tree,
        project: "project",
        version: "1.0.0",
        format: "tar.gz",
        outfile: sourceOutfile,
      }),
    ));
    expect(failureOf(source)).toMatchObject({ _tag: "SourceArchiveFailed" });
    await expect(readFile(sourceOutfile)).rejects.toThrow();
  });

  it("reauthenticates the selected Git bytes immediately before every Git launch", async () => {
    const original = await readFile(git);
    const program = Effect.gen(function*() {
      yield* Effect.promise(() => writeFile(git, "#!/bin/sh\nexit 0\n"));
      return yield* SourceArchive.sourceArchive(
        new SourceArchive.SourceArchiveInput({
          repository: join(root, "changed-tool-repository"),
          tree,
          project: "project",
          version: "1.0.0",
          format: "zip",
          outfile: join(root, "changed-tool.zip"),
        }),
      );
    }).pipe(
      Effect.provide(SourceArchive.layer({ executable: git })),
      Effect.provide(NodeServices.layer),
    );
    try {
      const failure = failureOf(await Effect.runPromiseExit(program)) as { readonly _tag: string };
      expect(failure._tag).toBe("GitToolChanged");
    } finally {
      await writeFile(git, original);
    }
  });

  it(gitTreeProjectionTest, async () => {
    const log = join(root, "git.log");
    await writeFile(log, "");
    process.env.FAKE_GIT_ARCHIVE_LOG = log;
    try {
      const repository = join(root, "repository");
      await mkdir(repository, { recursive: true });
      const exit = await runSource(
        Effect.all([
          SourceArchive.sourceArchive(
            new SourceArchive.SourceArchiveInput({
              repository,
              tree,
              project: "project",
              version: "1.2.3",
              format: "zip",
              outfile: join(root, "source-one.zip"),
            }),
          ),
          SourceArchive.sourceArchive(
            new SourceArchive.SourceArchiveInput({
              repository,
              tree,
              project: "project",
              version: "1.2.3",
              format: "zip",
              outfile: join(root, "source-two.zip"),
            }),
          ),
          SourceArchive.sourceArchive(
            new SourceArchive.SourceArchiveInput({
              repository,
              tree,
              project: "project",
              version: "1.2.3",
              format: "tar.gz",
              outfile: join(root, "source-one.tar.gz"),
            }),
          ),
          SourceArchive.sourceArchive(
            new SourceArchive.SourceArchiveInput({
              repository,
              tree,
              project: "project",
              version: "1.2.3",
              format: "tar.gz",
              outfile: join(root, "source-two.tar.gz"),
            }),
          ),
        ], { concurrency: 1 }),
      );
      expect(Exit.isSuccess(exit), Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "").toBe(true);
      const zipBytes = new Uint8Array(await readFile(join(root, "source-one.zip")));
      expect(zipBytes).toEqual(new Uint8Array(await readFile(join(root, "source-two.zip"))));
      const tarBytes = new Uint8Array(await readFile(join(root, "source-one.tar.gz")));
      expect(tarBytes).toEqual(new Uint8Array(await readFile(join(root, "source-two.tar.gz"))));
      const zip = readZip(zipBytes);
      const names = zip.map((entry) => entry.name);
      expect(names).toContain("project-1.2.3/");
      expect(names).toContain("project-1.2.3/bin/tool");
      expect(names).toContain("project-1.2.3/README.link");
      expect(names).not.toContain("project-1.2.3/secret.txt");
      expect(names.some((name) => {
        const segments = name.split("/");
        return segments.includes(".git") || segments.includes("dist");
      })).toBe(false);
      expect(names.some((name) => name.includes("vendor/submodule"))).toBe(false);
      const executable = zip.find((entry) => entry.name.endsWith("bin/tool"));
      const symlink = zip.find((entry) => entry.name.endsWith("README.link"));
      const pointer = zip.find((entry) => entry.name.endsWith("asset.lfs"));
      expect(executable?.mode).toBe(0o100755);
      expect(symlink?.mode).toBe(0o120777);
      expect(decoder.decode(symlink?.contents)).toBe("README.md");
      expect(decoder.decode(pointer?.contents)).toContain("version https://git-lfs.github.com/spec/v1");
      const tar = readTarGzip(tarBytes);
      expect(tar.find((entry) => entry.name.endsWith("README.link"))).toMatchObject({ type: "2", link: "README.md" });
      expect(tar.find((entry) => entry.name.endsWith("bin/tool"))?.mode).toBe(0o755);
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) =>
        JSON.parse(line) as {
          readonly argv: readonly string[];
        }
      );
      expect(invocations.filter(({ argv }) => argv[0] === "--version")).toHaveLength(1);
      expect(invocations.filter(({ argv }) => argv[0] === "cat-file")).toHaveLength(4);
      expect(invocations.filter(({ argv }) => argv[0] === "ls-tree")).toHaveLength(4);
      expect(invocations.filter(({ argv }) => argv[0] === "archive")).toHaveLength(4);
      expect(invocations.filter(({ argv }) => argv.includes("--worktree-attributes"))).toHaveLength(0);
    } finally {
      delete process.env.FAKE_GIT_ARCHIVE_LOG;
    }
  }, 30_000);

  it("does not apply the diagnostic byte cap to exact ls-tree protocol stdout", async () => {
    const repository = join(root, "exact-protocol-repository");
    await mkdir(repository, { recursive: true });
    const outfile = join(root, "exact-protocol.zip");
    const exit = await Effect.runPromiseExit(
      SourceArchive.sourceArchive(
        new SourceArchive.SourceArchiveInput({
          repository,
          tree,
          project: "project",
          version: "1.0.0",
          format: "zip",
          outfile,
        }),
      ).pipe(
        Effect.provide(SourceArchive.layer({ executable: git, outputLimitBytes: 32 })),
        Effect.provide(NodeServices.layer),
      ),
    );

    expect(Exit.isSuccess(exit), Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "").toBe(true);
    expect((await readFile(outfile)).byteLength).toBeGreaterThan(0);
  });

  it("rejects symbolic and non-tree sources", async () => {
    const repository = join(root, "repository");
    const invalidFormatPath = join(root, "invalid-source-format.bin");
    const invalidFormat = await runSource(
      SourceArchive.sourceArchive({
        repository,
        tree,
        project: "project",
        version: "1.0.0",
        format: "rar",
        outfile: invalidFormatPath,
      } as unknown as SourceArchive.SourceArchiveInput),
    );
    expect((failureOf(invalidFormat) as { readonly _tag: string })._tag).toBe("SourceArchiveFailed");
    await expect(readFile(invalidFormatPath)).rejects.toThrow();

    const symbolic = await runSource(
      SourceArchive.sourceArchive({
        repository,
        tree: "HEAD",
        project: "project",
        version: "1.0.0",
        format: "zip",
        outfile: join(root, "symbolic.zip"),
      } as unknown as SourceArchive.SourceArchiveInput),
    );
    expect((failureOf(symbolic) as { readonly _tag: string })._tag).toBe("SourceArchiveFailed");
    process.env.FAKE_GIT_ARCHIVE_TYPE = "commit";
    try {
      const commit = await runSource(
        SourceArchive.sourceArchive(
          new SourceArchive.SourceArchiveInput({
            repository,
            tree,
            project: "project",
            version: "1.0.0",
            format: "zip",
            outfile: join(root, "commit.zip"),
          }),
        ),
      );
      expect((failureOf(commit) as { readonly _tag: string })._tag).toBe("SourceArchiveFailed");
    } finally {
      delete process.env.FAKE_GIT_ARCHIVE_TYPE;
    }
  });
});

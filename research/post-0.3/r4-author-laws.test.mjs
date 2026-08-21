import { describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuthorLawFailure,
  assertDecimalByteCounts,
  borrowFile,
  borrowTree,
  classifyCommitError,
  createDrainingAuthority,
  normalizeRelative,
  publishExecutable,
} from "./r4-author-laws.mjs";
import { decimalBytes, sha256Digest } from "./author/Tool.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const withRoot = async (name, use) => {
  const root = await mkdtemp(join(tmpdir(), `effect-build-${name}-`));
  try {
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const expectedTarget = () => ({
  os: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
  architecture: process.arch === "arm64" ? "arm64" : "x64",
});

const expectTag = async (operation, tag) => {
  try {
    await operation();
    throw new Error(`expected ${tag}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AuthorLawFailure);
    expect(error._tag).toBe(tag);
    return error;
  }
};

describe("R4 rents exactly three Author contracts", () => {
  test("the research surface is Tool, BorrowedOutput, and Executable only", async () => {
    const entries = await Array.fromAsync(
      new Bun.Glob("*.ts").scan({ cwd: join(here, "author"), absolute: false }),
    );
    expect(entries.sort()).toEqual(["BorrowedOutput.ts", "Executable.ts", "Tool.ts"]);
    for (const entry of entries) {
      const source = await readFile(join(here, "author", entry), "utf8");
      expect(source).toContain("Proposed public contract");
      expect(source).not.toContain("node:");
      expect(source).not.toContain("Effect.runPromise");
    }
  });

  test("unhashed variants cannot accidentally carry optional digest authority", async () => {
    const borrowed = await readFile(join(here, "author", "BorrowedOutput.ts"), "utf8");
    const executable = await readFile(join(here, "author", "Executable.ts"), "utf8");
    expect(borrowed).not.toMatch(/digest\?:/);
    expect(executable).not.toMatch(/digest\?:/);
  });

  test("all three contracts share canonical unbounded byte counts and one digest grammar", () => {
    expect(decimalBytes("0")).toBe("0");
    expect(decimalBytes("1234567890123456789012345678901234567890")).toBe(
      "1234567890123456789012345678901234567890",
    );
    expect(() => decimalBytes("00")).toThrow(TypeError);
    expect(() => decimalBytes("-1")).toThrow(TypeError);
    expect(sha256Digest("a".repeat(64))).toEqual({ algorithm: "sha256", value: "a".repeat(64) });
    expect(() => sha256Digest(`sha256:${"a".repeat(64)}`)).toThrow(TypeError);
    expect(() => sha256Digest("A".repeat(64))).toThrow(TypeError);
    expect(() => sha256Digest("a".repeat(63))).toThrow(TypeError);
  });
});

describe("Author/BorrowedOutput acquisition and close laws", () => {
  test("close rejects new acquisition, drains the winner, then closes once", async () => {
    let releaseOperation;
    let enteredOperation;
    let closes = 0;
    const gate = new Promise((resolveRelease) => {
      releaseOperation = resolveRelease;
    });
    const entered = new Promise((resolveEntered) => {
      enteredOperation = resolveEntered;
    });
    const authority = createDrainingAuthority(async () => {
      closes += 1;
    });
    const winner = authority.use(async () => {
      enteredOperation();
      await gate;
      return "observed";
    });
    await entered;
    expect(authority.active()).toBe(1);
    const close = authority.close();
    expect(authority.state()).toBe("closing");
    await expectTag(() => authority.use(async () => "late"), "BorrowedOutputExpired");
    expect(await Promise.race([close.then(() => "closed"), sleep(25).then(() => "draining")])).toBe("draining");
    releaseOperation();
    expect(await winner).toBe("observed");
    await close;
    await authority.close();
    expect(authority.state()).toBe("closed");
    expect(authority.active()).toBe(0);
    expect(closes).toBe(1);
  });
});

describe("Author/BorrowedOutput file and tree laws", () => {
  for (const mode of ["unhashed", "hashed"]) {
    test(`${mode} file observations are bounded and detect same-size replacement`, () =>
      withRoot(`r4-file-${mode}`, async (root) => {
        const path = join(root, "output.bin");
        await writeFile(path, Buffer.alloc(3 * 1024 * 1024, 0x61));
        const traversals = [];
        const borrowed = await borrowFile(path, mode, {
          highWaterMark: 32 * 1024,
          onTraversal: (metrics) => traversals.push(metrics),
        });
        expect(assertDecimalByteCounts(borrowed.initial.bytes)).toBe(String(3 * 1024 * 1024));
        expect(traversals[0].chunks).toBeGreaterThan(1);
        expect(traversals[0].maxChunkBytes).toBeLessThanOrEqual(32 * 1024);
        expect(traversals[0].bufferedWholeFile).toBe(false);
        expect("digest" in borrowed.initial).toBe(mode === "hashed");
        const replacement = join(root, "replacement.bin");
        await writeFile(replacement, Buffer.alloc(3 * 1024 * 1024, 0x62));
        await Bun.write(path, Bun.file(replacement));
        await expectTag(borrowed.observe, "BorrowedOutputChanged");
        await borrowed.close();
        await expectTag(borrowed.observe, "BorrowedOutputExpired");
      }));

    test(`${mode} tree observations are contained, sorted, bounded, and mutation-sensitive`, () =>
      withRoot(`r4-tree-${mode}`, async (root) => {
        const tree = join(root, "tree");
        await mkdir(join(tree, "nested"), { recursive: true });
        await writeFile(join(tree, "z.bin"), Buffer.alloc(96 * 1024, 0x7a));
        await writeFile(join(tree, "nested", "a.bin"), Buffer.alloc(80 * 1024, 0x61));
        const traversals = [];
        const borrowed = await borrowTree(tree, mode, {
          highWaterMark: 16 * 1024,
          onTraversal: (metrics) => traversals.push(metrics),
        });
        expect(borrowed.initial.entries.map((entry) => entry.relativePath)).toEqual([
          "nested",
          "nested/a.bin",
          "z.bin",
        ]);
        expect(assertDecimalByteCounts(borrowed.initial.totalBytes)).toBe(String(176 * 1024));
        expect(traversals[0].chunks).toBeGreaterThan(2);
        expect(traversals[0].maxChunkBytes).toBeLessThanOrEqual(16 * 1024);
        expect(traversals[0].bufferedWholeFile).toBe(false);
        for (const entry of borrowed.initial.entries) {
          if (entry.kind === "file") expect("digest" in entry).toBe(mode === "hashed");
        }
        expect("manifestDigest" in borrowed.initial).toBe(mode === "hashed");
        await writeFile(join(tree, "nested", "a.bin"), Buffer.alloc(80 * 1024, 0x62));
        await expectTag(borrowed.observe, "BorrowedOutputChanged");
        await borrowed.close();
      }));
  }

  test("portable containment rejects traversal, absolute paths, and symlinks", () =>
    withRoot("r4-containment", async (root) => {
      expect(normalizeRelative("nested\\file.js")).toBe("nested/file.js");
      for (const candidate of ["../../escape", "/absolute", "C:\\absolute", "..\\escape"]) {
        expect(() => normalizeRelative(candidate)).toThrow(AuthorLawFailure);
      }
      const tree = join(root, "tree");
      const outside = join(root, "outside.bin");
      await mkdir(tree);
      await writeFile(outside, "outside");
      try {
        await symlink(outside, join(tree, "escape"));
        await symlink(outside, join(root, "file-link"));
        await symlink(tree, join(root, "tree-link"));
      } catch (error) {
        if (process.platform === "win32") return;
        throw error;
      }
      await expectTag(() => borrowTree(tree, "unhashed"), "BorrowedOutputEscaped");
      await expectTag(() => borrowFile(join(root, "file-link"), "unhashed"), "BorrowedOutputEscaped");
      await expectTag(() => borrowTree(join(root, "tree-link"), "unhashed"), "BorrowedOutputEscaped");
    }));
});

describe("Author/Executable publication laws", () => {
  for (const mode of ["unhashed", "hashed"]) {
    test(`${mode} publication streams inspection and commits by same-parent rename`, () =>
      withRoot(`r4-executable-${mode}`, async (root) => {
        const destination = join(root, "published-tool");
        await writeFile(destination, "old-destination");
        const traversals = [];
        const artifact = await publishExecutable({
          destination,
          observation: mode,
          runtime: { name: "node", version: process.version },
          target: expectedTarget(),
          highWaterMark: 32 * 1024,
          onTraversal: (metrics) => traversals.push(metrics),
          produce: (candidate) => copyFile(process.execPath, candidate),
        });
        expect(artifact.path).toBe(destination);
        expect(artifact.publication).toEqual({ commit: "same-parent-rename", committed: true });
        expect("digest" in artifact).toBe(mode === "hashed");
        expect(BigInt(assertDecimalByteCounts(artifact.bytes))).toBeGreaterThan(0n);
        expect(traversals[0].chunks).toBeGreaterThan(1);
        expect(traversals[0].maxChunkBytes).toBeLessThanOrEqual(32 * 1024);
        expect(traversals[0].bufferedWholeFile).toBe(false);
        expect((await readFile(destination)).subarray(0, 2).equals((await readFile(process.execPath)).subarray(0, 2))).toBe(true);
      }));
  }

  test("provider failure leaves the old destination and removes its private partial candidate", () =>
    withRoot("r4-partial-candidate", async (root) => {
      const destination = join(root, "published-tool");
      await writeFile(destination, "old-destination");
      let candidate;
      const providerFailure = new Error("provider-stopped-after-partial-write");
      await expect(
        publishExecutable({
          destination,
          observation: "unhashed",
          runtime: { name: "node", version: process.version },
          target: expectedTarget(),
          produce: async (path) => {
            candidate = path;
            await writeFile(path, "partial");
            throw providerFailure;
          },
        }),
      ).rejects.toBe(providerFailure);
      expect(await readFile(destination, "utf8")).toBe("old-destination");
      expect(await Bun.file(candidate).exists()).toBe(false);
    }));

  test("the Windows lock model fails closed without replacing the destination", () =>
    withRoot("r4-windows-lock", async (root) => {
      const destination = join(root, "published-tool.exe");
      await writeFile(destination, "old-destination");
      let candidate;
      const lock = Object.assign(new Error("sharing violation"), { code: "EPERM" });
      const error = await expectTag(() => publishExecutable({
        destination,
        observation: "unhashed",
        runtime: { name: "node", version: process.version },
        target: expectedTarget(),
        platform: "win32",
        produce: async (path) => {
          candidate = path;
          await copyFile(process.execPath, path);
        },
        renameOperation: async () => {
          throw lock;
        },
      }), "ExecutableDestinationLocked");
      expect(error.code).toBe("EPERM");
      expect(await readFile(destination, "utf8")).toBe("old-destination");
      expect(await Bun.file(candidate).exists()).toBe(false);
      expect(classifyCommitError("linux", lock, destination)._tag).toBe("ExecutableCommitFailed");
    }));
});

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Archive from "../../packages/effect-build-archives/src/Archive.js";
import * as SourceArchive from "../../packages/effect-build-archives/src/SourceArchive.js";
import { finalizedFile } from "../fixtures/finalized-artifacts.js";
import { requiredExecutable } from "./acceptance-support.js";

const execute = promisify(execFile);
const git = requiredExecutable("EFFECT_BUILD_GIT_BIN");
const unzip = requiredExecutable("EFFECT_BUILD_UNZIP_BIN");
const zipinfo = requiredExecutable("EFFECT_BUILD_ZIPINFO_BIN");
const tar = requiredExecutable("EFFECT_BUILD_TAR_BIN");
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-archives-acceptance-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const sha256 = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");

const fileArtifact = finalizedFile;

const runArchive = <A, E>(effect: Effect.Effect<A, E, Archive.Archiver>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Archive.layer),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const runSourceArchive = <A, E>(
  effect: Effect.Effect<A, E, SourceArchive.SourceArchiver>,
  options?: SourceArchive.LayerOptions,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(SourceArchive.layer({ executable: git, ...options })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const gitRun = async (repository: string, args: readonly string[]): Promise<string> => {
  const completion = await execute(git, [...args], {
    cwd: repository,
    env: { ...process.env, LC_ALL: "C" },
    maxBuffer: 8 * 1024 * 1024,
  });
  return completion.stdout.trim();
};

const gitRunWithInput = (repository: string, args: readonly string[], input: string): Promise<string> =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(git, [...args], {
      cwd: repository,
      env: { ...process.env, LC_ALL: "C" },
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error !== null) {
        rejectPromise(new Error(`git ${args.join(" ")} failed: ${stderr}`, { cause: error }));
      } else {
        resolvePromise(stdout.trim());
      }
    });
    if (child.stdin === null) {
      rejectPromise(new Error(`git ${args.join(" ")} did not expose stdin`));
    } else {
      child.stdin.end(input);
    }
  });

describe.sequential("real archive and exact-Git-tree acceptance", () => {
  it("builds deterministic ZIP and tar.gz archives verified by independent system readers", async () => {
    const inputs = join(root, "binary-inputs");
    await mkdir(inputs, { recursive: true });
    const executablePath = join(inputs, "effect-build-acceptance");
    const readmePath = join(inputs, "README.md");
    await writeFile(executablePath, "#!/bin/sh\nprintf 'effect-build-archive-ok\\n'\n");
    await chmod(executablePath, 0o755);
    await writeFile(readmePath, "archive acceptance fixture\n");
    const executable = await fileArtifact(executablePath);
    const readme = await fileArtifact(readmePath);
    const entries = [
      new Archive.ArchiveEntry({ artifact: readme, path: "share/doc/README.md" }),
      new Archive.ArchiveEntry({
        artifact: executable,
        path: "bin/effect-build-acceptance",
        executable: true,
      }),
    ] as const;
    const outputs = join(root, "binary-outputs");
    await mkdir(outputs, { recursive: true });

    const artifacts = await runArchive(Effect.all([
      Archive.archive(new Archive.ArchiveInput({ format: "zip", entries, outfile: join(outputs, "one.zip") })),
      Archive.archive(
        new Archive.ArchiveInput({
          format: "zip",
          entries: [entries[1], entries[0]],
          outfile: join(outputs, "two.zip"),
        }),
      ),
      Archive.archive(new Archive.ArchiveInput({ format: "tar.gz", entries, outfile: join(outputs, "one.tar.gz") })),
      Archive.archive(
        new Archive.ArchiveInput({
          format: "tar.gz",
          entries: [entries[1], entries[0]],
          outfile: join(outputs, "two.tar.gz"),
        }),
      ),
    ], { concurrency: 1 }));

    for (const artifact of artifacts) {
      expect(artifact.provenance).toEqual({
        _tag: "IntrinsicProvenance",
        producer: "effect-build-archives",
      });
      expect(artifact.digest.value).toBe(await sha256(artifact.path));
      expect(artifact.bytes).toBe(String((await stat(artifact.path)).size));
    }

    expect(await sha256(join(outputs, "one.zip"))).toBe(await sha256(join(outputs, "two.zip")));
    expect(await sha256(join(outputs, "one.tar.gz"))).toBe(await sha256(join(outputs, "two.tar.gz")));

    const zipNames = (await execute(unzip, ["-Z1", join(outputs, "one.zip")])).stdout.trim().split("\n");
    expect(zipNames).toEqual(["bin/effect-build-acceptance", "share/doc/README.md"]);
    const zipModes = (await execute(zipinfo, ["-l", join(outputs, "one.zip")])).stdout;
    expect(zipModes).toMatch(/-rwxr-xr-x[^\n]*bin\/effect-build-acceptance/);
    expect(zipModes).toMatch(/-rw-r--r--[^\n]*share\/doc\/README\.md/);
    expect(zipModes).toMatch(/-rwxr-xr-x[^\n]*80-Jan-01 00:00[^\n]*bin\/effect-build-acceptance/);
    expect(zipModes).toMatch(/-rw-r--r--[^\n]*80-Jan-01 00:00[^\n]*share\/doc\/README\.md/);
    expect((await execute(unzip, ["-p", join(outputs, "one.zip"), "bin/effect-build-acceptance"])).stdout)
      .toContain("effect-build-archive-ok");

    const tarNames = (await execute(tar, ["-tzf", join(outputs, "one.tar.gz")])).stdout.trim().split("\n");
    expect(tarNames).toEqual(["bin/effect-build-acceptance", "share/doc/README.md"]);
    const tarDetails = (await execute(tar, ["-tvzf", join(outputs, "one.tar.gz")], {
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
    })).stdout;
    const epoch = String.raw`(?:Jan\s+1\s+1970|1970-01-01)`;
    expect(tarDetails).toMatch(
      new RegExp(String.raw`-rwxr-xr-x\s+(?:0\/0|0\s+0)[^\n]*${epoch}[^\n]*bin/effect-build-acceptance`),
    );
    expect(tarDetails).toMatch(
      new RegExp(String.raw`-rw-r--r--\s+(?:0\/0|0\s+0)[^\n]*${epoch}[^\n]*share/doc/README\.md`),
    );
  });

  it.each(
    [
      ["traversal", ["../escape", "safe"]],
      ["duplicate", ["same", "same"]],
      ["case collision", ["Readme", "README"]],
    ] as const,
  )("rejects a %s layout without publishing bytes", async (label, paths) => {
    const inputs = join(root, `negative-${label.replace(" ", "-")}`);
    await mkdir(inputs, { recursive: true });
    const firstPath = join(inputs, "first");
    const secondPath = join(inputs, "second");
    await writeFile(firstPath, "first\n");
    await writeFile(secondPath, "second\n");
    const outfile = join(inputs, "rejected.zip");
    await expect(runArchive(Archive.archive(
      new Archive.ArchiveInput({
        format: "zip",
        entries: [
          new Archive.ArchiveEntry({ artifact: await fileArtifact(firstPath), path: paths[0] }),
          new Archive.ArchiveEntry({ artifact: await fileArtifact(secondPath), path: paths[1] }),
        ],
        outfile,
      }),
    ))).rejects.toMatchObject({ _tag: "UnsafeArchiveLayout" });
    await expect(stat(outfile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("projects one canonical Git tree twice into both formats and preserves tree semantics", async () => {
    const repository = join(root, "source-repository");
    await mkdir(join(repository, "bin"), { recursive: true });
    await mkdir(join(repository, "dist"), { recursive: true });
    await mkdir(join(repository, "vendor"), { recursive: true });
    await gitRun(repository, ["init", "--initial-branch=main"]);
    await gitRun(repository, ["config", "user.name", "effect-build acceptance"]);
    await gitRun(repository, ["config", "user.email", "acceptance@example.test"]);
    await writeFile(join(repository, ".gitattributes"), "secret.txt export-ignore\n");
    await writeFile(join(repository, "README.md"), "exact Git tree acceptance\n");
    await writeFile(join(repository, "secret.txt"), "export-ignore must remove this\n");
    await writeFile(join(repository, "dist", "tracked-output.txt"), "build output must be excluded\n");
    await writeFile(
      join(repository, "asset.lfs"),
      [
        "version https://git-lfs.github.com/spec/v1",
        `oid sha256:${"a".repeat(64)}`,
        "size 17",
        "",
      ].join("\n"),
    );
    const executable = join(repository, "bin", "effect-build-acceptance");
    await writeFile(executable, "#!/bin/sh\nprintf 'effect-build-source-ok\\n'\n");
    await chmod(executable, 0o755);
    await symlink("README.md", join(repository, "README.link"));
    await gitRun(repository, ["add", "."]);
    await gitRun(repository, ["commit", "-m", "fixture tree base"]);
    const gitlink = await gitRun(repository, ["rev-parse", "HEAD"]);
    await gitRun(repository, ["update-index", "--add", "--cacheinfo", `160000,${gitlink},vendor/submodule`]);
    await gitRun(repository, ["commit", "-m", "add exact gitlink"]);
    const tree = await gitRun(repository, ["rev-parse", "HEAD^{tree}"]);
    expect(tree).toMatch(/^[0-9a-f]{40}$/);

    const outputs = join(root, "source-outputs");
    await mkdir(outputs, { recursive: true });
    const request = (format: "zip" | "tar.gz", outfile: string) =>
      SourceArchive.sourceArchive(
        new SourceArchive.SourceArchiveInput({
          repository,
          tree,
          project: "effect-build-fixture",
          version: "1.2.3",
          format,
          outfile,
        }),
      );
    const artifacts = await runSourceArchive(Effect.all([
      request("zip", join(outputs, "one.zip")),
      request("zip", join(outputs, "two.zip")),
      request("tar.gz", join(outputs, "one.tar.gz")),
      request("tar.gz", join(outputs, "two.tar.gz")),
    ], { concurrency: 1 }));

    const gitVersion = /^git version\s+(\S+)/.exec(await gitRun(repository, ["--version"]))?.[1];
    expect(gitVersion).toBeDefined();
    for (const artifact of artifacts) {
      expect(artifact.provenance).toMatchObject({
        name: "git",
        participants: [{ name: "git", version: gitVersion }],
      });
      expect(artifact.digest.value).toBe(await sha256(artifact.path));
      expect(artifact.bytes).toBe(String((await stat(artifact.path)).size));
    }

    expect(await sha256(join(outputs, "one.zip"))).toBe(await sha256(join(outputs, "two.zip")));
    expect(await sha256(join(outputs, "one.tar.gz"))).toBe(await sha256(join(outputs, "two.tar.gz")));
    const prefix = "effect-build-fixture-1.2.3/";
    const expectedZip = [
      prefix,
      `${prefix}.gitattributes`,
      `${prefix}README.link`,
      `${prefix}README.md`,
      `${prefix}asset.lfs`,
      `${prefix}bin/`,
      `${prefix}bin/effect-build-acceptance`,
      `${prefix}vendor/`,
    ];
    const zipNames = (await execute(unzip, ["-Z1", join(outputs, "one.zip")])).stdout.trim().split("\n");
    const tarNames = (await execute(tar, ["-tzf", join(outputs, "one.tar.gz")])).stdout.trim().split("\n");
    expect(zipNames).toEqual(expectedZip);
    expect(tarNames).toEqual(expectedZip.map((name) => name.endsWith("/") ? name.slice(0, -1) : name));
    expect(
      zipNames.some((name) => name.includes("secret.txt") || name.includes("dist/") || name.includes("submodule/")),
    )
      .toBe(false);
    const zipDetails = (await execute(zipinfo, ["-l", join(outputs, "one.zip")])).stdout;
    expect(zipDetails).toMatch(/lrwxrwxrwx[^\n]*README\.link/);
    expect(zipDetails).toMatch(/-rwxr-xr-x[^\n]*bin\/effect-build-acceptance/);
    expect(zipDetails).toMatch(/lrwxrwxrwx[^\n]*80-Jan-01 00:00[^\n]*README\.link/);
    expect(zipDetails).toMatch(/-rwxr-xr-x[^\n]*80-Jan-01 00:00[^\n]*bin\/effect-build-acceptance/);
    expect((await execute(unzip, ["-p", join(outputs, "one.zip"), `${prefix}README.link`])).stdout).toBe("README.md");
    expect((await execute(unzip, ["-p", join(outputs, "one.zip"), `${prefix}asset.lfs`])).stdout)
      .toContain("version https://git-lfs.github.com/spec/v1");
    const tarDetails = (await execute(tar, ["-tvzf", join(outputs, "one.tar.gz")])).stdout;
    expect(tarDetails).toMatch(/README\.link -> README\.md/);
    expect(tarDetails).toMatch(/-rwxr-xr-x[^\n]*bin\/effect-build-acceptance/);
  }, 120_000);

  it("preserves trailing spaces and non-ASCII PAX paths and link targets byte-for-byte", async () => {
    const repository = join(root, "pax-source-repository");
    await mkdir(repository, { recursive: true });
    await gitRun(repository, ["init", "--initial-branch=main"]);
    await gitRun(repository, ["config", "user.name", "effect-build acceptance"]);
    await gitRun(repository, ["config", "user.email", "acceptance@example.test"]);

    const trailingName = "trailing-name ";
    const trailingLink = "trailing-target.link";
    const paxDirectory = `pax-${"é".repeat(52)}`;
    const paxPath = `${paxDirectory}/payload.txt`;
    const paxLink = "non-ascii-pax-target.link";
    await writeFile(join(repository, trailingName), "trailing-space-name\n");
    await symlink(trailingName, join(repository, trailingLink));
    await mkdir(join(repository, paxDirectory));
    await writeFile(join(repository, paxPath), "non-ascii-pax-path\n");
    await symlink(paxPath, join(repository, paxLink));
    await gitRun(repository, ["add", "."]);
    await gitRun(repository, ["commit", "-m", "adversarial exact tree"]);
    const tree = await gitRun(repository, ["rev-parse", "HEAD^{tree}"]);

    const outputs = join(root, "pax-source-outputs");
    await mkdir(outputs, { recursive: true });
    const zipPath = join(outputs, "exact-tree.zip");
    const tarPath = join(outputs, "exact-tree.tar.gz");
    const request = (format: "zip" | "tar.gz", outfile: string) =>
      SourceArchive.sourceArchive(
        new SourceArchive.SourceArchiveInput({
          repository,
          tree,
          project: "effect-build-pax",
          version: "1.0.0",
          format,
          outfile,
        }),
      );
    const zipArtifact = await runSourceArchive(request("zip", zipPath));
    expect(zipArtifact.digest.value).toBe(await sha256(zipPath));

    const prefix = "effect-build-pax-1.0.0/";
    const zipNames = (await execute(unzip, ["-Z1", zipPath])).stdout.trim().split("\n");
    expect(zipNames).toEqual([
      prefix,
      `${prefix}${paxLink}`,
      `${prefix}${paxDirectory}/`,
      `${prefix}${paxPath}`,
      `${prefix}${trailingName}`,
      `${prefix}${trailingLink}`,
    ]);
    expect((await execute(unzip, ["-p", zipPath, `${prefix}${trailingLink}`])).stdout).toBe(trailingName);
    expect((await execute(unzip, ["-p", zipPath, `${prefix}${paxLink}`])).stdout).toBe(paxPath);

    const tarArtifact = await runSourceArchive(request("tar.gz", tarPath));
    expect(tarArtifact.digest.value).toBe(await sha256(tarPath));
    const tarPaxDetails = (await execute(tar, ["-tvzf", tarPath])).stdout.normalize("NFC");
    expect(tarPaxDetails).toContain(`${paxLink} -> ${paxPath}`);

    const extractedZip = join(outputs, "extracted-zip");
    const extractedTar = join(outputs, "extracted-tar");
    await mkdir(extractedZip);
    await mkdir(extractedTar);
    await execute(unzip, ["-q", zipPath, "-d", extractedZip]);
    await execute(tar, ["-xzf", tarPath, "-C", extractedTar]);
    for (const extracted of [extractedZip, extractedTar]) {
      const projected = join(extracted, "effect-build-pax-1.0.0");
      expect(await readFile(join(projected, trailingName), "utf8")).toBe("trailing-space-name\n");
      expect(await readlink(join(projected, trailingLink))).toBe(trailingName);
      expect(await readFile(join(projected, paxPath), "utf8")).toBe("non-ascii-pax-path\n");
      expect((await readlink(join(projected, paxLink))).normalize("NFC")).toBe(paxPath);
    }
  }, 120_000);

  it("projects a Git tree whose exact listing exceeds the diagnostic capture limit", async () => {
    const repository = join(root, "large-source-repository");
    await mkdir(repository, { recursive: true });
    await gitRun(repository, ["init", "--initial-branch=main"]);
    await gitRun(repository, ["config", "user.name", "effect-build acceptance"]);
    await gitRun(repository, ["config", "user.email", "acceptance@example.test"]);
    const shared = join(repository, "shared.txt");
    await writeFile(shared, "one shared blob\n");
    await gitRun(repository, ["add", "shared.txt"]);
    await gitRun(repository, ["commit", "-m", "object source"]);
    const blob = await gitRun(repository, ["rev-parse", "HEAD:shared.txt"]);
    const gitlink = await gitRun(repository, ["rev-parse", "HEAD"]);
    await gitRun(repository, ["read-tree", "--empty"]);

    const paths = Array.from(
      { length: 4_500 },
      (_, index) => `entry-${index.toString().padStart(5, "0")}-${"x".repeat(180)}.txt`,
    );
    const index = [
      ...paths.map((path) => `100644 ${blob}\t${path}\0`),
      `160000 ${gitlink}\tzzzz-late-submodule\0`,
    ].join("");
    await gitRunWithInput(repository, ["update-index", "-z", "--index-info"], index);
    const tree = await gitRun(repository, ["write-tree"]);
    const exactListing = await gitRun(repository, ["ls-tree", "-rz", "--full-tree", tree]);
    expect(Buffer.byteLength(exactListing)).toBeGreaterThan(1024 * 1024);

    const outputs = join(root, "large-source-outputs");
    await mkdir(outputs, { recursive: true });
    const outfile = join(outputs, "large-tree.zip");
    const artifact = await runSourceArchive(
      SourceArchive.sourceArchive(
        new SourceArchive.SourceArchiveInput({
          repository,
          tree,
          project: "effect-build-large",
          version: "1.0.0",
          format: "zip",
          outfile,
        }),
      ),
      { outputLimitBytes: 1024 * 1024 },
    );
    expect(artifact.digest.value).toBe(await sha256(outfile));

    const prefix = "effect-build-large-1.0.0/";
    const names = (await execute(unzip, ["-Z1", outfile], { maxBuffer: 8 * 1024 * 1024 })).stdout.trim().split("\n");
    const expectedNames = [prefix, ...paths.map((path) => `${prefix}${path}`)];
    expect(names).toHaveLength(expectedNames.length);
    expect(createHash("sha256").update(names.join("\0")).digest("hex"))
      .toBe(createHash("sha256").update(expectedNames.join("\0")).digest("hex"));
    expect(names.some((name) => name.includes("zzzz-late-submodule"))).toBe(false);
  }, 120_000);
});

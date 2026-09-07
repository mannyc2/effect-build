import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Archive from "../../packages/effect-build-archives/src/Archive.js";
import * as Compile from "../../packages/effect-build-bun/src/Command/CompileExecutable.js";
import * as Runtime from "../../packages/effect-build-bun/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";
import { selectToolFixture } from "./helpers/exact-tool.js";

const execute = promisify(execFile);
const fixture = selectToolFixture("bun");
const selectedBun = fixture.executable;
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
const fullStackEntrypoint = fileURLToPath(
  new URL("../fixtures/bun-positive-findings/fullstack/server.ts", import.meta.url),
);
const executablePath = (name: string): string => join(root, process.platform === "win32" ? `${name}.exe` : name);

const hostTarget = (): Compile.Target => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
  if (process.platform === "win32") return process.arch === "arm64" ? "bun-windows-arm64" : "bun-windows-x64";
  return process.arch === "arm64" ? "bun-linux-arm64" : "bun-linux-x64";
};

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-real-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | Runtime.Runtime
    | import("effect").FileSystem.FileSystem
    | import("effect").Path.Path
    | import("effect").Crypto.Crypto
  >,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: selectedBun as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

describe(`real Bun ${fixture.version} compileExecutable`, () => {
  it("compiles and directly archives the host executable while preserving its identity and exact bytes", async () => {
    const outfile = executablePath("app");
    const artifact = await run(Compile.compileExecutable({
      entrypoints: [entrypoint],
      outfile,
      target: hostTarget(),
      observation: "hashed",
    }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      provider: "bun",
      bytes: `${bytes.byteLength}`,
      bunTarget: hostTarget(),
      runtime: { name: "bun", version: fixture.version },
      publication: { scope: "file", commit: "same-parent-no-replace-link", committed: true },
    });
    expect(await realpath(artifact.path)).toBe(await realpath(outfile));
    expect(artifact.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.digest.value);
    expect(artifact.tool.participants[0].content.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect((await execute(artifact.path, [])).stdout).toBe("effect-build-ok\n");

    const identity = structuredClone(artifact);
    const entryPath = `bin/${basename(artifact.path)}`;
    const entry = new Archive.ArchiveEntry({ artifact, path: entryPath, executable: true });
    expect(entry.artifact).toBe(artifact);
    const archive = await Effect.runPromise(
      Archive.archive(
        new Archive.ArchiveInput({
          format: "tar.gz",
          entries: [entry],
          outfile: join(root, "app.tar.gz"),
        }),
      ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
    );
    const tar = process.env.EFFECT_BUILD_TAR_BIN ?? "tar";
    const listing = await execute(tar, ["-tvzf", archive.path]);
    expect(listing.stdout.trim().split("\n")).toHaveLength(1);
    expect(listing.stdout).toMatch(/^-rwxr-xr-x\s/mu);
    expect(listing.stdout).toContain(entryPath);
    const extracted = join(root, "extracted");
    await mkdir(extracted);
    await execute(tar, ["-xzf", archive.path, "-C", extracted]);
    const extractedExecutable = join(extracted, entryPath);
    const extractedBytes = await readFile(extractedExecutable);
    expect(extractedBytes.equals(bytes)).toBe(true);
    expect(createHash("sha256").update(extractedBytes).digest("hex")).toBe(artifact.digest.value);
    if (process.platform !== "win32") expect((await stat(extractedExecutable)).mode & 0o777).toBe(0o755);
    expect((await execute(extractedExecutable, [])).stdout).toBe("effect-build-ok\n");
    expect(artifact).toEqual(identity);
    expect((await readFile(artifact.path)).equals(bytes)).toBe(true);
    await observeProviderNativeEvidence("CAN-BUN-012");
    await fixture.observe("compile-hash-execute-archive", artifact.tool, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "native",
    });
  }, 120_000);

  it("executes the permanent variable-collision fixture from a compiled executable", async () => {
    const collision = fileURLToPath(new URL("./fixtures/bun-variable-collision.cjs", import.meta.url));
    const artifact = await run(Compile.compileExecutable({
      entrypoints: [collision],
      outfile: executablePath("variable-collision"),
      observation: "hashed",
    }));
    expect((await execute(artifact.path, [])).stdout).toBe("42\n");
    await fixture.observe("collision-compile-execution", artifact.tool, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "native",
    });
  }, 120_000);

  it("compiles and executes the provider-native full-stack HTML request mode", async () => {
    const outfile = executablePath("full-stack-command");
    const artifact = await run(Compile.compileExecutable({
      entrypoints: [fullStackEntrypoint],
      outfile,
      observation: "unhashed",
    }));
    expect(artifact).toMatchObject({
      _tag: "UnhashedExecutable",
      provider: "bun",
      runtime: { name: "bun", version: fixture.version },
      publication: { scope: "file", commit: "same-parent-no-replace-link", committed: true },
      runtimeAcquisition: { _tag: "SelectedHostRuntime", evidence: "selected-command-content" },
    });
    expect(await realpath(artifact.path)).toBe(await realpath(outfile));
    const completion = await execute(artifact.path, [], { timeout: 30_000 });
    const receiptLine = completion.stdout.split("\n").find((line) =>
      line.startsWith("EFFECT_BUILD_FULL_STACK_RECEIPT=")
    );
    expect(JSON.parse(receiptLine?.slice("EFFECT_BUILD_FULL_STACK_RECEIPT=".length) ?? "null")).toEqual({
      htmlStatus: 200,
      htmlMarker: true,
      scriptStatus: 200,
      scriptMarker: true,
      styleStatus: 200,
      styleMarker: true,
      apiStatus: 200,
      apiMarker: true,
    });
    await observeProviderNativeEvidence("B10.1");
    await fixture.observe("compile-full-stack-execution", artifact.tool, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "native",
    });
  }, 120_000);

  it("preserves native diagnostics as the provider-local typed failure", async () => {
    await expect(run(Compile.compileExecutable({
      entrypoints: [join(root, "missing.ts")],
      outfile: join(root, "failure"),
      target: hostTarget(),
      observation: "unhashed",
    }))).rejects.toMatchObject({ _tag: "BunCommandFailed", operation: "compileExecutable" });
  }, 120_000);
});

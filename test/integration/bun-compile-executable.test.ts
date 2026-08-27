import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Compile from "../../packages/effect-build-bun/src/Command/CompileExecutable.js";
import * as Runtime from "../../packages/effect-build-bun/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

const execute = promisify(execFile);
const bundledBun = "/Users/cjpher/.codex/toolchains/bun-1.3.14-arm64/bun-darwin-aarch64/bun";
const selectedBun = process.env.EFFECT_BUILD_BUN ?? bundledBun;
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
const fullStackEntrypoint = fileURLToPath(
  new URL("../fixtures/bun-positive-findings/fullstack/server.ts", import.meta.url),
);
const executablePath = (name: string): string => join(root, process.platform === "win32" ? `${name}.exe` : name);

const exactBunAvailable = (): boolean => {
  try {
    return execFileSync(selectedBun, ["--version"], { encoding: "utf8" }).trim() === "1.3.14";
  } catch {
    return false;
  }
};

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

describe.skipIf(!exactBunAvailable())("real Bun 1.3.14 compileExecutable", () => {
  it("compiles, authenticates, atomically publishes, hashes, and executes the host artifact", async () => {
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
      runtime: { name: "bun", version: "1.3.14" },
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect(await realpath(artifact.path)).toBe(await realpath(outfile));
    expect(artifact.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(artifact.tool.participants[0].content.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect((await execute(artifact.path, [])).stdout).toBe("effect-build-ok\n");
    await observeProviderNativeEvidence("CAN-BUN-012");
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
      runtime: { name: "bun", version: "1.3.14" },
      publication: { commit: "same-parent-rename", committed: true },
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

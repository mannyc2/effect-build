import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as DenoCompile from "../../packages/effect-build-deno/src/CompileExecutable.js";
import * as Target from "../../packages/effect-build/src/Target.js";

const execute = promisify(execFile);
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));

const denoAvailable = (): boolean => {
  if (process.env.EFFECT_BUILD_DENO !== undefined) return true;
  try {
    execFileSync("deno", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const enabled = denoAvailable();
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const layerOptions: DenoCompile.LayerOptions = process.env.EFFECT_BUILD_DENO === undefined
  ? {}
  : { executable: process.env.EFFECT_BUILD_DENO };

const run = <A, E>(effect: Effect.Effect<A, E, DenoCompile.Compiler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(DenoCompile.layer(layerOptions)),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.skipIf(!enabled)("real Deno CompileExecutable", () => {
  it("compiles for the host, hashes, atomically publishes, and executes the output", async () => {
    const outfile = join(root, "app");
    const artifact = await run(DenoCompile.compileExecutable({ entrypoint, outfile }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "Executable",
      path: process.platform === "win32" ? `${outfile}.exe` : outfile,
      bytes: bytes.byteLength,
      target: Target.host(),
    });
    expect(artifact.tool.name).toBe("deno");
    expect(artifact.tool.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(artifact.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const completion = await execute(artifact.path, []);
    expect(completion.stdout).toBe("effect-build-ok\n");
  }, 300_000);

  it("surfaces deno diagnostics as ToolFailed", async () => {
    await expect(run(DenoCompile.compileExecutable({
      entrypoint: join(root, "missing.ts"),
      outfile: join(root, "failure"),
      hash: false,
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "deno" });
  }, 300_000);
});

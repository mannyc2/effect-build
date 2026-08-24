import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunCompile from "../../packages/effect-build-bun/src/CompileExecutable.js";
import { hostTarget } from "../host-target.js";

const execute = promisify(execFile);
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const layerOptions: BunCompile.LayerOptions = process.env.EFFECT_BUILD_BUN === undefined
  ? {}
  : { executable: process.env.EFFECT_BUILD_BUN };

const run = <A, E>(effect: Effect.Effect<A, E, BunCompile.Compiler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(BunCompile.layer(layerOptions)),
      Effect.provide(NodeServices.layer),
    ),
  );

describe("real Bun CompileExecutable", () => {
  it("compiles for the host, hashes, atomically publishes, and executes the output", async () => {
    const outfile = join(root, "app");
    const target = hostTarget() as BunCompile.Target;
    const artifact = await run(BunCompile.compileExecutable({ entrypoint, outfile, target }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "Executable",
      path: process.platform === "win32" ? `${outfile}.exe` : outfile,
      bytes: bytes.byteLength,
      target,
    });
    expect(artifact.tool.name).toBe("bun");
    expect(artifact.tool.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(artifact.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const completion = await execute(artifact.path, []);
    expect(completion.stdout).toBe("effect-build-ok\n");
  }, 120_000);

  it("inherits Bun project configuration and preserves native diagnostics", async () => {
    const project = fileURLToPath(new URL("../fixtures/app/bun-config/", import.meta.url));
    const artifact = await run(BunCompile.compileExecutable({
      entrypoint: "entry.ts",
      outfile: join(root, "configured"),
      cwd: project,
      target: hostTarget() as BunCompile.Target,
    }));
    expect(artifact.sha256).toHaveLength(64);
    expect((await execute(artifact.path, [])).stdout).toBe("bun-config-ok\n");
    await expect(run(BunCompile.compileExecutable({
      entrypoint: join(project, "missing.ts"),
      outfile: join(root, "failure"),
      target: hostTarget() as BunCompile.Target,
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "bun" });
  }, 120_000);
});

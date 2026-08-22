import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunCompile from "../../packages/effect-build-bun/src/CompileExecutable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const execute = promisify(execFile);
const entrypoint = new URL("../fixtures/standalone/hello.ts", import.meta.url).pathname;
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-v04-bun-real-"));
  executable = process.env.PLAN041_BUN_EXECUTABLE ?? "";
  if (!isAbsolute(executable)) throw new Error("PLAN041_BUN_EXECUTABLE must be absolute");
  await access(executable, constants.X_OK);
  const version = (await execute(executable, ["--version"])).stdout.trim();
  if (version !== "1.3.9") throw new Error(`Plan 041 requires Bun 1.3.9, received ${version}`);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, BunCompile.Compiler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(BunCompile.layer({
        executable: executable as AbsolutePath,
        allowUntestedVersion: true,
      })),
      Effect.provide(NodeServices.layer),
    ),
  );

describe("real staged 0.4 Bun CompileExecutable", () => {
  it("compiles, inspects, hashes, atomically publishes, and executes Bun 1.3.9 output", async () => {
    const outfile = join(root, "app");
    const artifact = await run(BunCompile.compileExecutable({
      entrypoint,
      outfile,
      observation: "hashed",
      target: "linux-x64-gnu",
    }));
    const bytes = await readFile(outfile);
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      path: outfile,
      bytes: String(bytes.byteLength),
      nativeFormat: "elf",
      provider: "bun",
      runtime: { name: "bun", version: "1.3.9" },
      target: "linux-x64-gnu",
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect(artifact.digest.value).toBe(createHash("sha256").update(bytes).digest("hex"));
    const completion = await execute(outfile, []);
    expect(completion.stdout).toBe("effect-build-ok\n");
  }, 120_000);

  it("inherits Bun project configuration and preserves native diagnostics", async () => {
    const project = new URL("../fixtures/standalone/bun-config/", import.meta.url).pathname;
    const artifact = await run(BunCompile.compileExecutable({
      entrypoint: "entry.ts",
      outfile: join(root, "configured"),
      cwd: project,
      observation: "unhashed",
    }));
    expect((await execute(artifact.path, [])).stdout).toBe("bun-config-ok\n");
    await expect(run(BunCompile.compileExecutable({
      entrypoint: join(project, "missing.ts"),
      outfile: join(root, "failure"),
      observation: "unhashed",
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "bun" });
  }, 120_000);
});

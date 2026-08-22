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
import * as DenoCompile from "../../packages/effect-build-deno/src/CompileExecutable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const execute = promisify(execFile);
const entrypoint = new URL("../fixtures/standalone/hello.ts", import.meta.url).pathname;
const executable = process.env.PLAN042_DENO_EXECUTABLE ?? "";
const enabled = process.platform === "linux" && process.arch === "x64" && isAbsolute(executable);
let root = "";

beforeAll(async () => {
  if (!enabled) return;
  root = await mkdtemp(join(tmpdir(), "effect-build-v04-deno-real-"));
  await access(executable, constants.X_OK);
  const version = (await execute(executable, ["--version"])).stdout.match(/^deno\s+([^\s]+)/m)?.[1];
  if (version !== "2.9.3") throw new Error("Plan 042 requires Deno 2.9.3, received " + (version ?? "<none>"));
});

afterAll(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, DenoCompile.Compiler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(DenoCompile.layer({
        executable: executable as AbsolutePath,
        allowUntestedVersion: true,
      })),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.skipIf(!enabled)("real staged 0.4 Deno CompileExecutable", () => {
  it(
    "compiles, preflights denort, inspects, hashes, atomically publishes, and executes Deno 2.9.3 output",
    async () => {
      const outfile = join(root, "app");
      const artifact = await run(DenoCompile.compileExecutable({
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
        provider: "deno",
        runtime: { name: "deno", version: "2.9.3" },
        target: "linux-x64-gnu",
        publication: { commit: "same-parent-rename", committed: true },
      });
      expect(artifact.digest.value).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect((await execute(outfile, [])).stdout).toBe("effect-build-ok\n");
    },
    120_000,
  );

  it("keeps Deno diagnostics native when compilation fails after preflight", async () => {
    await expect(run(DenoCompile.compileExecutable({
      entrypoint: join(root, "missing.ts"),
      outfile: join(root, "failure"),
      observation: "unhashed",
      target: "linux-x64-gnu",
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "deno" });
  }, 120_000);
});

import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { Command } from "effect-build-bun";
import * as Artifact from "effect-build/Artifact";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "../src/Compile.ts";

const selectedBun = process.env.EFFECT_BUILD_BUN;
const directory = fileURLToPath(new URL("..", import.meta.url));
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));

test("compiled CLI preserves source output, errors, and exit status", {
  timeout: 120_000,
}, async () => {
  assert.ok(selectedBun, "Set EFFECT_BUILD_BUN to an absolute Bun 1.3.14 executable path");
  assert.equal(execFileSync(selectedBun, ["--version"], { encoding: "utf8" }).trim(), "1.3.14");
  const temporary = await mkdtemp(join(tmpdir(), "effect-build-cli-compile-"));
  try {
    const compiler = Command.layer({
      executable: Schema.decodeUnknownSync(Artifact.AbsolutePath)(selectedBun),
    });
    const artifact = await Effect.runPromise(
      compile(join(temporary, "bundle-report.exe")).pipe(
        Effect.provide(compiler),
        Effect.provide(NodeServices.layer),
      ),
    );
    assert.equal(artifact._tag, "HashedExecutable");
    assert.equal(artifact.digest.value, createHash("sha256").update(await readFile(artifact.path)).digest("hex"));

    for (
      const args of [
        ["fixtures/bundles.json", "--format", "json", "--check"],
        ["fixtures/over-budget.json", "--format", "json", "--check"],
        ["fixtures/invalid.json"],
        ["--help"],
      ]
    ) {
      const options = {
        cwd: directory,
        encoding: "utf8" as const,
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 10_000,
      };
      const source = spawnSync(process.execPath, [main, ...args], options);
      // The executable consumes report files without finding Node or Bun on PATH.
      const built = spawnSync(artifact.path, args, { ...options, env: { ...options.env, PATH: "" } });
      assert.equal(source.error, undefined);
      assert.equal(built.error, undefined);
      assert.equal(built.signal, null);
      assert.equal(built.status, source.status, args.join(" "));
      assert.equal(built.stdout, source.stdout);
      assert.equal(built.stderr, source.stderr);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

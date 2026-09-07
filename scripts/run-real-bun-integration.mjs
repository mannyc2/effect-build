import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (process.env.EFFECT_BUILD_TOOL_FIXTURE !== undefined && process.env.EFFECT_BUILD_BUN === undefined) {
  throw new Error("an exact Bun matrix fixture requires EFFECT_BUILD_BUN; the orchestration runtime is not a fallback");
}

const result = spawnSync(
  "node",
  [
    resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "test/integration/bun-compile-executable.test.ts",
    "test/integration/bun-bundle.test.ts",
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, EFFECT_BUILD_BUN: process.env.EFFECT_BUILD_BUN ?? process.execPath },
    stdio: "inherit",
  },
);

if (result.error !== undefined) throw result.error;
if (result.signal !== null) throw new Error(`real Bun integration runner terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;

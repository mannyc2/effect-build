import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { writeReceipt } from "./receipt.mjs";
import { assertion, repository, sourceSha } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);

const locateBun = async () => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? "bun.exe" : "bun");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through explicit absolute PATH entries.
    }
  }
  throw new Error("Bun is unavailable for contract certification");
};

const bun = await locateBun();
try {
  await execFileAsync(bun, ["test", "research/post-0.3/compatibility.test.ts"], {
    cwd: repository,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
} catch (error) {
  const stderr = typeof error.stderr === "string" ? error.stderr : "";
  const stdout = typeof error.stdout === "string" ? error.stdout : "";
  throw new Error(
    `compatibility certification failed: ${stderr || stdout || (error instanceof Error ? error.message : String(error))}`,
    { cause: error },
  );
}

await writeReceipt({
  id: "compatibility-model",
  sourceSha,
  claims: [{
    id: "operation-specific-compatibility",
    classification: "established",
    conclusion: "one-pure-evaluator-distinguishes-tested-policy-supported-override-and-non-overridable-failures",
    assertions: [
      assertion("host-and-command-share-evaluator"),
      assertion("tested-policy-and-override-distinguished"),
      assertion("known-missing-and-relational-failures-have-no-override"),
    ],
  }],
  evidence: { command: [bun, "test", "research/post-0.3/compatibility.test.ts"] },
});

process.env.EFFECT_BUILD_PACKAGE_MANAGER_BIN = bun;
await import("./certify-effect-contract-endpoints.mjs");

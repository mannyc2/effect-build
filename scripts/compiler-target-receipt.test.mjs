import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerTargetReceipt } from "./compiler-target-receipt.mjs";
import { researchCompleteContract } from "./research-evidence-accounting.mjs";

const observedHost = Object.freeze({
  certificationHost: "linux-x64",
  platform: "linux",
  architecture: "x64",
  libc: "glibc",
  systemTarget: "linux-x64-gnu",
});

test("accounts for every exact Bun and Deno compiler-target coordinate without an execution overclaim", () => {
  const rule = researchCompleteContract.evidenceControl.coordinateRules.compilerTargets;
  const receipts = rule.coordinates.map(({ compiler, target }) =>
    createCompilerTargetReceipt({
      compiler,
      target,
      toolVersion: compiler === "bun" ? "1.3.14" : "2.9.5",
      artifactBytes: "123",
      artifactSha256: "a".repeat(64),
      observedHost,
    })
  );
  assert.equal(receipts.length, 12);
  assert.equal(new Set(receipts.map(({ compiler, target }) => `${compiler}/${target}`)).size, 12);
  assert.ok(receipts.every(({ operationIds }) => operationIds.length === 1));
  assert.ok(receipts.every(({ claim }) => claim.endsWith("no-target-execution-claim")));
});

test("rejects invented targets, tool drift, malformed identities, and the wrong construction host", () => {
  const base = {
    compiler: "bun",
    target: "linux-x64-gnu",
    toolVersion: "1.3.14",
    artifactBytes: "123",
    artifactSha256: "a".repeat(64),
    observedHost,
  };
  assert.throws(() => createCompilerTargetReceipt({ ...base, target: "windows-aarch64" }), /outside/u);
  assert.throws(() => createCompilerTargetReceipt({ ...base, toolVersion: "1.3.15" }), /version mismatch/u);
  assert.throws(() => createCompilerTargetReceipt({ ...base, artifactSha256: "A".repeat(64) }), /lowercase/u);
  assert.throws(
    () => createCompilerTargetReceipt({
      ...base,
      observedHost: { ...observedHost, certificationHost: "macos-arm64" },
    }),
    /construction host/u,
  );
});

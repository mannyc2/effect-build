import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  loadExpectedConclusions,
  loadReceiptProducers,
  validateProducerCoverage,
  validateReceiptSet,
} from "./receipt-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const execFileAsync = promisify(execFile);
const expectations = await loadExpectedConclusions(here);
const manifest = await loadReceiptProducers(here);
const sourceSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const releaseSha = "c".repeat(40);
const laneResults = Object.fromEntries(
  [...new Set(manifest.producers.map((producer) => producer.lane).filter((lane) => lane !== "aggregate"))]
    .map((lane) => [lane, "success"]),
);
const laneArtifacts = Object.fromEntries(
  Object.keys(laneResults).map((lane, index) => [lane, {
    id: String(index + 1),
    digest: `sha256:${String(index + 1).repeat(64)}`,
  }]),
);

const receipts = expectations.receiptIds.map((receiptId) => ({
  entry: `${receiptId}.json`,
  receipt: {
    schema: "effect-build/architecture-receipt@2",
    id: receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectations.claims.filter((claim) => claim.receipt === receiptId).map((claim) => ({
      id: claim.id,
      classification: claim.classification,
      conclusion: claim.conclusion,
      assertions: [{ name: "synthetic-deterministic-fixture", passed: true }],
    })),
    evidence: receiptId === "repository-scope"
      ? { result: "passed", sourceSha, baseSha, releaseSha, changedPaths: [] }
      : receiptId === "remote-head"
      ? { result: "passed", observedSha: sourceSha }
      : {},
  },
}));

const validationInput = () => ({
  baseSha,
  expectations,
  laneArtifacts: structuredClone(laneArtifacts),
  laneResults: { ...laneResults },
  manifest,
  receipts: structuredClone(receipts),
  releaseSha,
  sourceSha,
});

test("every expected receipt has exactly one declared producer", () => {
  assert.doesNotThrow(() => validateProducerCoverage(expectations, manifest));
});

test("a complete same-source receipt set with successful lanes certifies", () => {
  const result = validateReceiptSet(validationInput());
  assert.equal(result.actualClaims, expectations.claims.length);
});

test("missing and unexpected receipts fail closed", () => {
  const missing = validationInput();
  missing.receipts.pop();
  assert.throws(() => validateReceiptSet(missing), /receipt set was not reproduced/);

  const unexpected = validationInput();
  unexpected.receipts.push({
    entry: "unexpected.json",
    receipt: {
      schema: "effect-build/architecture-receipt@2",
      id: "unexpected",
      sourceSha,
      status: "reproduced",
      claims: [{
        id: "unexpected",
        classification: "established",
        conclusion: "unexpected",
        assertions: [{ name: "unexpected", passed: true }],
      }],
      evidence: {},
    },
  });
  assert.throws(() => validateReceiptSet(unexpected), /receipt set was not reproduced/);
});

test("a stale receipt or skipped required lane cannot certify", () => {
  const stale = validationInput();
  stale.receipts[0].receipt.sourceSha = "d".repeat(40);
  assert.throws(() => validateReceiptSet(stale), /stale or foreign source SHA/);

  const skipped = validationInput();
  skipped.laneResults[Object.keys(skipped.laneResults)[0]] = "skipped";
  assert.throws(() => validateReceiptSet(skipped), /did not succeed/);

  const missingArtifact = validationInput();
  missingArtifact.laneArtifacts[Object.keys(missingArtifact.laneArtifacts)[0]].digest = "";
  assert.throws(() => validateReceiptSet(missingArtifact), /no artifact digest/);
});

test("an expected receipt without a declared producer is structural drift", () => {
  const drifted = structuredClone(expectations);
  drifted.receiptIds.push("unproduced-receipt");
  drifted.receiptIds.sort();
  assert.throws(() => validateProducerCoverage(drifted, manifest), /declared producers drifted/);
});

test("importing a receipt producer dependency cannot emit that producer's receipt", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "effect-build-nested-receipt-"));
  try {
    const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    const environment = {
      ...process.env,
      RESEARCH_RECEIPTS_DIR: directory,
      SOURCE_SHA: head,
    };
    await execFileAsync(
      process.execPath,
      ["research/post-0.3/check-contract-markdown.mjs"],
      { cwd: repository, env: environment },
    );
    assert.deepEqual(await readdir(directory), ["contract-declarations.json"]);
    const receipt = await readFile(resolve(directory, "contract-declarations.json"));
    await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'await import("./research/post-0.3/check-contract-markdown.mjs")',
      ],
      {
        cwd: repository,
        env: environment,
      },
    );
    assert.deepEqual(await readdir(directory), ["contract-declarations.json"]);
    assert.deepEqual(await readFile(resolve(directory, "contract-declarations.json")), receipt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

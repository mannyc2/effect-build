import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { receiptDirectory } from "./receipt.mjs";
import {
  loadExpectedConclusions,
  loadReceiptProducers,
  validateProducerCoverage,
  validateReceiptSet,
} from "./receipt-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expectations = await loadExpectedConclusions(here);
const manifest = await loadReceiptProducers(here);
validateProducerCoverage(expectations, manifest);

const sourceSha = process.env.SOURCE_SHA;
const baseSha = process.env.RESEARCH_BASE_SHA;
const releaseSha = process.env.RESEARCH_RELEASE_SHA;
assert.match(sourceSha ?? "", /^[0-9a-f]{40}$/, "SOURCE_SHA is missing");
assert.match(baseSha ?? "", /^[0-9a-f]{40}$/, "RESEARCH_BASE_SHA is missing");
assert.match(releaseSha ?? "", /^[0-9a-f]{40}$/, "RESEARCH_RELEASE_SHA is missing");

const requiredLanes = [...new Set(
  manifest.producers.map((producer) => producer.lane).filter((lane) => lane !== "aggregate"),
)].sort();
const laneResults = Object.fromEntries(requiredLanes.map((lane) => [
  lane,
  process.env[`${lane.toUpperCase().replaceAll("-", "_")}_RESEARCH_RESULT`],
]));
const laneArtifacts = Object.fromEntries(requiredLanes.map((lane) => {
  const prefix = `${lane.toUpperCase().replaceAll("-", "_")}_RESEARCH_ARTIFACT`;
  return [lane, {
    id: process.env[`${prefix}_ID`],
    digest: process.env[`${prefix}_DIGEST`],
  }];
}));

const directory = receiptDirectory();
const entries = (await readdir(directory))
  .filter((entry) => entry.endsWith(".json") && entry !== "certification.json")
  .sort();
assert.ok(entries.length > 0, "no architecture receipts were produced");
const receipts = await Promise.all(entries.map(async (entry) => {
  const bytes = await readFile(join(directory, entry));
  return {
    entry,
    receipt: JSON.parse(bytes.toString("utf8")),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}));

const validated = validateReceiptSet({
  baseSha,
  expectations,
  laneArtifacts,
  laneResults,
  manifest,
  receipts,
  releaseSha,
  sourceSha,
});

const certification = {
  schema: "effect-build/architecture-certification@3",
  sourceSha,
  baseSha,
  releaseSha,
  workflow: {
    repository: process.env.GITHUB_REPOSITORY ?? "local",
    workflow: process.env.GITHUB_WORKFLOW ?? "local",
    runId: process.env.GITHUB_RUN_ID ?? "local",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "local",
    eventName: process.env.GITHUB_EVENT_NAME ?? "local",
  },
  requiredJobs: Object.fromEntries(requiredLanes.map((lane) => [`${lane}-research`, laneResults[lane]])),
  artifacts: Object.fromEntries(requiredLanes.map((lane) => {
    const artifact = validated.laneArtifacts[lane];
    return [`${lane}-research`, {
      id: artifact.id,
      digest: artifact.digest.startsWith("sha256:") ? artifact.digest : `sha256:${artifact.digest}`,
    }];
  })),
  expectedDocuments: expectations.files,
  repositoryScope: validated.repositoryScope,
  remoteHead: validated.remoteHead,
  receipts: receipts.map(({ entry, receipt, sha256 }) => ({
    id: receipt.id,
    file: entry,
    digest: `sha256:${sha256}`,
  })),
  claims: validated.actualClaims,
  result: "certified",
};
await writeFile(
  join(directory, "certification.json"),
  `${JSON.stringify(certification, null, 2)}\n`,
  { flag: "wx" },
);
console.log(`EFFECT_BUILD_ARCHITECTURE_CERTIFIED=${JSON.stringify(certification)}`);

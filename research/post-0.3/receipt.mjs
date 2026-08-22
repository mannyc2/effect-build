import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export class ResearchInfrastructureFailure extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ResearchInfrastructureFailure";
  }
}

export class ResearchConclusionMismatch extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ResearchConclusionMismatch";
  }
}

export const receiptDirectory = () => {
  const directory = process.env.RESEARCH_RECEIPTS_DIR;
  if (directory === undefined || !isAbsolute(directory)) {
    throw new ResearchInfrastructureFailure("RESEARCH_RECEIPTS_DIR must be an absolute path");
  }
  return directory;
};

export const conclusion = (condition, message) => {
  if (!condition) throw new ResearchConclusionMismatch(message);
};

export const infrastructure = (condition, message) => {
  if (!condition) throw new ResearchInfrastructureFailure(message);
};

const validateClaim = (claim) => {
  assert.equal(typeof claim.id, "string");
  assert.ok(claim.id.length > 0);
  assert.ok(["established", "falsified", "sequenced", "unproven"].includes(claim.classification));
  assert.equal(typeof claim.conclusion, "string");
  assert.ok(claim.conclusion.length > 0);
  assert.ok(Array.isArray(claim.assertions));
  assert.ok(claim.assertions.length > 0);
  for (const assertion of claim.assertions) {
    assert.equal(typeof assertion.name, "string");
    assert.equal(assertion.passed, true);
  }
};

export const writeReceipt = async ({ id, sourceSha, claims, evidence = {} }) => {
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
  assert.equal(typeof sourceSha, "string");
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(claims));
  assert.ok(claims.length > 0);
  for (const claim of claims) validateClaim(claim);

  const directory = receiptDirectory();
  await mkdir(directory, { recursive: true });
  const value = {
    schema: "effect-build/architecture-receipt@2",
    id,
    sourceSha,
    status: "reproduced",
    claims,
    evidence,
  };
  const path = join(directory, `${id}.json`);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  return value;
};

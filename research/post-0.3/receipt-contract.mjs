import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const expectedConclusionName = /^expected(?:-[a-z0-9]+)*-conclusions\.json$/;
const allowedClassifications = new Set(["established", "falsified", "sequenced", "unproven"]);
const allowedLanes = new Set(["linux", "windows", "aggregate"]);

const sorted = (values) => [...values].sort();

const assertString = (value, message) => {
  assert.equal(typeof value, "string", message);
  assert.ok(value.length > 0, message);
};

export const loadExpectedConclusions = async (directory) => {
  const files = (await readdir(directory))
    .filter((entry) => expectedConclusionName.test(entry))
    .sort();
  assert.ok(files.length > 0, "no expected architecture conclusion documents were found");

  const claims = [];
  const keys = new Set();
  for (const file of files) {
    const document = JSON.parse(await readFile(resolve(directory, file), "utf8"));
    assert.equal(
      document.schema,
      "effect-build/expected-architecture-conclusions@2",
      `${file}: invalid expected-conclusion schema`,
    );
    assert.ok(Array.isArray(document.claims) && document.claims.length > 0, `${file}: claims missing`);
    for (const claim of document.claims) {
      assertString(claim.receipt, `${file}: receipt id missing`);
      assertString(claim.id, `${file}: claim id missing`);
      assert.ok(
        allowedClassifications.has(claim.classification),
        `${file}:${claim.receipt}:${claim.id}: invalid classification`,
      );
      assertString(claim.conclusion, `${file}:${claim.receipt}:${claim.id}: conclusion missing`);
      const key = `${claim.receipt}:${claim.id}`;
      assert.equal(keys.has(key), false, `duplicate expected architecture claim: ${key}`);
      keys.add(key);
      claims.push(claim);
    }
  }

  return {
    files,
    claims,
    receiptIds: sorted(new Set(claims.map((claim) => claim.receipt))),
  };
};

export const loadReceiptProducers = async (directory) => {
  const path = resolve(directory, "receipt-producers.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(
    manifest.schema,
    "effect-build/architecture-receipt-producers@1",
    "invalid receipt-producer manifest schema",
  );
  assert.ok(Array.isArray(manifest.producers) && manifest.producers.length > 0, "receipt producers missing");

  const repository = resolve(directory, "../..");
  const receiptIds = new Set();
  for (const [index, producer] of manifest.producers.entries()) {
    assert.ok(allowedLanes.has(producer.lane), `producer ${index}: invalid lane`);
    assertString(producer.script, `producer ${index}: script missing`);
    assert.match(
      producer.script,
      /^research\/post-0\.3\/[a-z0-9-]+\.mjs$/,
      `producer ${index}: script must be a repository-relative research module`,
    );
    await access(resolve(repository, producer.script));
    assert.ok(Array.isArray(producer.receipts) && producer.receipts.length > 0, `producer ${index}: receipts missing`);
    const local = new Set();
    for (const receipt of producer.receipts) {
      assertString(receipt, `producer ${index}: receipt id missing`);
      assert.equal(local.has(receipt), false, `producer ${index}: duplicate receipt ${receipt}`);
      assert.equal(receiptIds.has(receipt), false, `receipt ${receipt} has multiple producers`);
      local.add(receipt);
      receiptIds.add(receipt);
    }
  }

  return { ...manifest, receiptIds: sorted(receiptIds) };
};

export const validateProducerCoverage = (expectations, manifest) => {
  assert.deepEqual(
    manifest.receiptIds,
    expectations.receiptIds,
    "expected architecture receipts and declared producers drifted",
  );
};

const validateReceiptClaim = (claim, entry) => {
  assertString(claim.id, `${entry}: claim id missing`);
  assert.ok(allowedClassifications.has(claim.classification), `${entry}:${claim.id}: invalid classification`);
  assertString(claim.conclusion, `${entry}:${claim.id}: conclusion missing`);
  assert.ok(Array.isArray(claim.assertions) && claim.assertions.length > 0, `${entry}:${claim.id}: assertions missing`);
  assert.ok(
    claim.assertions.every((item) => typeof item.name === "string" && item.name.length > 0 && item.passed === true),
    `${entry}:${claim.id}: failed or malformed assertion recorded`,
  );
};

export const validateReceiptSet = ({
  baseSha,
  expectations,
  laneArtifacts,
  laneResults,
  manifest,
  receipts,
  releaseSha,
  sourceSha,
}) => {
  assert.match(sourceSha, /^[0-9a-f]{40}$/, "invalid expected source SHA");
  assert.match(baseSha, /^[0-9a-f]{40}$/, "invalid approved base SHA");
  assert.match(releaseSha, /^[0-9a-f]{40}$/, "invalid released source SHA");
  validateProducerCoverage(expectations, manifest);

  const requiredLanes = sorted(new Set(
    manifest.producers.map((producer) => producer.lane).filter((lane) => lane !== "aggregate"),
  ));
  assert.deepEqual(sorted(Object.keys(laneResults)), requiredLanes, "required research lane result set drifted");
  for (const lane of requiredLanes) {
    assert.equal(laneResults[lane], "success", `required research lane ${lane} did not succeed`);
  }
  assert.deepEqual(sorted(Object.keys(laneArtifacts)), requiredLanes, "required research artifact set drifted");
  for (const lane of requiredLanes) {
    const artifact = laneArtifacts[lane];
    assert.match(artifact?.id ?? "", /^[1-9][0-9]*$/, `required research lane ${lane} has no artifact id`);
    assert.match(
      artifact?.digest ?? "",
      /^(?:sha256:)?[0-9a-f]{64}$/,
      `required research lane ${lane} has no artifact digest`,
    );
  }

  const expected = new Map(expectations.claims.map((claim) => [`${claim.receipt}:${claim.id}`, claim]));
  const actual = new Map();
  const byId = new Map();
  for (const receiptRecord of receipts) {
    const { entry, receipt } = receiptRecord;
    assert.equal(receipt.schema, "effect-build/architecture-receipt@2", `${entry}: invalid receipt schema`);
    assertString(receipt.id, `${entry}: receipt id missing`);
    assert.equal(entry, `${receipt.id}.json`, `${entry}: filename does not match receipt id`);
    assert.equal(byId.has(receipt.id), false, `duplicate architecture receipt: ${receipt.id}`);
    assert.equal(receipt.status, "reproduced", `${entry}: conclusion set was not reproduced`);
    assert.equal(receipt.sourceSha, sourceSha, `${entry}: stale or foreign source SHA`);
    assert.ok(Array.isArray(receipt.claims) && receipt.claims.length > 0, `${entry}: claims missing`);
    byId.set(receipt.id, receiptRecord);
    for (const claim of receipt.claims) {
      validateReceiptClaim(claim, entry);
      const key = `${receipt.id}:${claim.id}`;
      assert.equal(actual.has(key), false, `duplicate architecture claim: ${key}`);
      actual.set(key, claim);
    }
  }

  assert.deepEqual(sorted(byId.keys()), expectations.receiptIds, "expected architecture receipt set was not reproduced");
  for (const [key, expectedClaim] of expected) {
    const claim = actual.get(key);
    assert.ok(claim, `missing expected architecture claim: ${key}`);
    assert.equal(claim.classification, expectedClaim.classification, `${key}: classification changed`);
    assert.equal(claim.conclusion, expectedClaim.conclusion, `${key}: conclusion changed`);
  }
  for (const key of actual.keys()) {
    assert.equal(expected.has(key), true, `unexpected architecture claim: ${key}`);
  }
  assert.equal(actual.size, expected.size, "architecture claim count changed");

  const repositoryScope = byId.get("repository-scope")?.receipt.evidence;
  assert.equal(repositoryScope?.result, "passed", "repository scope was not certified");
  assert.equal(repositoryScope?.sourceSha, sourceSha, "repository scope source SHA changed");
  assert.equal(repositoryScope?.baseSha, baseSha, "repository scope base SHA changed");
  assert.equal(repositoryScope?.releaseSha, releaseSha, "repository scope release SHA changed");
  assert.ok(Array.isArray(repositoryScope?.changedPaths), "repository scope changed paths missing");

  const remoteHead = byId.get("remote-head")?.receipt.evidence;
  assert.equal(remoteHead?.result, "passed", "fresh remote head was not certified");
  assert.equal(remoteHead?.observedSha, sourceSha, "fresh remote head does not equal source SHA");

  return {
    actualClaims: actual.size,
    laneArtifacts,
    remoteHead,
    repositoryScope,
    requiredLanes,
  };
};

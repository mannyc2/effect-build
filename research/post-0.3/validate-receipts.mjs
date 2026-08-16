import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { receiptDirectory } from "./receipt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expectedFiles = [
  "expected-conclusions.json",
  "expected-contract-conclusions.json",
];
const expectedDocuments = await Promise.all(expectedFiles.map(async (name) =>
  JSON.parse(await readFile(resolve(here, name), "utf8"))
));
for (const document of expectedDocuments) {
  assert.equal(document.schema, "effect-build/expected-architecture-conclusions@2");
  assert.ok(Array.isArray(document.claims));
}
const expectedClaims = expectedDocuments.flatMap((document) => document.claims);

const directory = receiptDirectory();
const entries = (await readdir(directory))
  .filter((entry) => entry.endsWith(".json") && entry !== "certification-summary.json")
  .sort();
assert.ok(entries.length > 0, "no architecture receipts were produced");

const actual = new Map();
const sourceShas = new Set();
for (const entry of entries) {
  const receipt = JSON.parse(await readFile(join(directory, entry), "utf8"));
  assert.equal(receipt.schema, "effect-build/architecture-receipt@2", `${entry}: invalid receipt schema`);
  assert.equal(receipt.status, "reproduced", `${entry}: conclusion set was not reproduced`);
  assert.match(receipt.sourceSha, /^[0-9a-f]{40}$/, `${entry}: invalid source SHA`);
  sourceShas.add(receipt.sourceSha);
  assert.ok(Array.isArray(receipt.claims) && receipt.claims.length > 0, `${entry}: claims missing`);
  for (const claim of receipt.claims) {
    assert.ok(Array.isArray(claim.assertions), `${entry}:${claim.id}: assertions missing`);
    assert.ok(claim.assertions.length > 0, `${entry}:${claim.id}: no executable assertion`);
    assert.ok(
      claim.assertions.every((item) => item.passed === true),
      `${entry}:${claim.id}: failed assertion recorded`,
    );
    const key = `${receipt.id}:${claim.id}`;
    assert.equal(actual.has(key), false, `duplicate architecture claim: ${key}`);
    actual.set(key, claim);
  }
}
assert.equal(sourceShas.size, 1, `receipts came from multiple source SHAs: ${[...sourceShas].join(", ")}`);

const expectedKeys = new Set();
for (const expected of expectedClaims) {
  const key = `${expected.receipt}:${expected.id}`;
  expectedKeys.add(key);
  const claim = actual.get(key);
  assert.ok(claim, `missing expected architecture claim: ${key}`);
  assert.equal(claim.classification, expected.classification, `${key}: classification changed`);
  assert.equal(claim.conclusion, expected.conclusion, `${key}: conclusion changed`);
}
for (const key of actual.keys()) {
  assert.equal(expectedKeys.has(key), true, `unexpected architecture claim: ${key}`);
}
assert.equal(actual.size, expectedKeys.size, "architecture claim count changed");

const summary = {
  schema: "effect-build/architecture-certification-summary@2",
  sourceSha: [...sourceShas][0],
  receipts: entries,
  claims: actual.size,
  result: "reproduced",
};
await writeFile(
  join(directory, "certification-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`EFFECT_BUILD_ARCHITECTURE_CERTIFIED=${JSON.stringify(summary)}`);

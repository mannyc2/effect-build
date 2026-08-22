import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { receiptDirectory } from "./receipt.mjs";
import {
  loadExpectedConclusions,
  loadReceiptProducers,
  validateProducerCoverage,
} from "./receipt-contract.mjs";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const laneIndex = process.argv.indexOf("--lane");
assert.ok(laneIndex >= 0 && laneIndex + 1 < process.argv.length, "usage: run-receipt-producers.mjs --lane <lane>");
const lane = process.argv[laneIndex + 1];

const expectations = await loadExpectedConclusions(here);
const manifest = await loadReceiptProducers(here);
validateProducerCoverage(expectations, manifest);
const producers = manifest.producers.filter((producer) => producer.lane === lane);
assert.ok(producers.length > 0, `no receipt producers are declared for lane ${lane}`);

const directory = receiptDirectory();
const receiptFiles = async () => {
  const entries = await readdir(directory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const state = new Map();
  for (const entry of entries) {
    assert.ok(entry.endsWith(".json"), `receipt directory contains a non-JSON entry: ${entry}`);
    const bytes = await readFile(resolve(directory, entry));
    state.set(entry, createHash("sha256").update(bytes).digest("hex"));
  }
  return state;
};

for (const producer of producers) {
  const expectedFiles = producer.receipts.map((receipt) => `${receipt}.json`).sort();
  const before = await receiptFiles();
  for (const entry of expectedFiles) {
    assert.equal(before.has(entry), false, `${producer.script}: target receipt already exists: ${entry}`);
  }

  const { stdout, stderr } = await execFileAsync(process.execPath, [resolve(repository, producer.script)], {
    cwd: repository,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);

  const after = await receiptFiles();
  for (const [entry, digest] of before) {
    assert.equal(after.get(entry), digest, `${producer.script}: modified an existing receipt: ${entry}`);
  }
  const added = [...after.keys()].filter((entry) => !before.has(entry)).sort();
  assert.deepEqual(added, expectedFiles, `${producer.script}: produced an undeclared or incomplete receipt set`);
  for (const entry of expectedFiles) {
    const receipt = JSON.parse(await readFile(resolve(directory, entry), "utf8"));
    assert.equal(receipt.id, entry.slice(0, -".json".length), `${producer.script}: receipt id changed`);
    assert.equal(receipt.sourceSha, process.env.SOURCE_SHA, `${producer.script}: receipt source SHA changed`);
  }
}

const finalFiles = await receiptFiles();
for (const producer of producers) {
  for (const receipt of producer.receipts) {
    assert.equal(finalFiles.has(`${receipt}.json`), true, `lane ${lane} is missing receipt ${receipt}`);
  }
}
console.log(`EFFECT_BUILD_RECEIPT_LANE_REPRODUCED=${lane}`);

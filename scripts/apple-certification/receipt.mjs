import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  canonicalBytes,
  contract,
  decodeCanonical,
  hex,
  positiveDecimal,
  sha256,
} from "../node-finalizer/common.mjs";

export const receiptFields = [
  "protocol",
  "version",
  "category",
  "coordinate",
  "sourceSha",
  "checkedOutSourceSha",
  "candidateWorkflowRunId",
  "candidateDescriptorDigest",
  "certificationWorkflowRunId",
  "certificationWorkflowRunAttempt",
  "runnerOs",
  "runnerArch",
  "evidenceBytes",
  "evidenceSha256",
  "verdict",
];

export const categoryCoordinates = Object.freeze({
  cell: contract.release.appleCertificationEvidence.certificationCells,
  distribution: contract.release.appleCertificationEvidence.appleDistributionCoordinates,
  "clean-host": contract.release.appleCertificationEvidence.appleCleanHostCoordinates,
});

export const coordinateSlug = (category, coordinate) => `${category}-${coordinate.replaceAll("|", "--")}`;

const targetFromCoordinate = (category, coordinate) =>
  category === "cell" ? undefined : coordinate.slice(coordinate.lastIndexOf("|") + 1);

export const validateReceipt = ({ receiptBytes, evidenceBytes, expected, runner }) => {
  const receipt = decodeCanonical(receiptBytes, receiptFields);
  if (
    receipt.protocol !== "effect-build/apple-certification-receipt@1" || receipt.version !== "0.5.0"
    || receipt.category !== expected.category || receipt.coordinate !== expected.coordinate
    || receipt.sourceSha !== expected.sourceSha || receipt.checkedOutSourceSha !== expected.sourceSha
    || receipt.candidateWorkflowRunId !== expected.candidateWorkflowRunId
    || receipt.candidateDescriptorDigest !== expected.candidateDescriptorDigest
    || receipt.certificationWorkflowRunId !== expected.certificationWorkflowRunId
    || receipt.certificationWorkflowRunAttempt !== "1" || receipt.verdict !== "certified"
  ) throw new Error(`certification receipt binding mismatch for ${expected.coordinate}`);
  if (!Object.hasOwn(categoryCoordinates, receipt.category) || !categoryCoordinates[receipt.category].includes(receipt.coordinate)) {
    throw new Error(`unknown certification coordinate ${receipt.coordinate}`);
  }
  hex(receipt.sourceSha, 40, "sourceSha");
  hex(receipt.checkedOutSourceSha, 40, "checkedOutSourceSha");
  hex(receipt.candidateDescriptorDigest, 64, "candidateDescriptorDigest");
  positiveDecimal(receipt.candidateWorkflowRunId, "candidateWorkflowRunId");
  positiveDecimal(receipt.certificationWorkflowRunId, "certificationWorkflowRunId");
  positiveDecimal(receipt.certificationWorkflowRunAttempt, "certificationWorkflowRunAttempt");
  positiveDecimal(receipt.evidenceBytes, "evidenceBytes");
  hex(receipt.evidenceSha256, 64, "evidenceSha256");
  if (!Buffer.isBuffer(evidenceBytes) || evidenceBytes.length === 0 || evidenceBytes.length > 64 * 1024 * 1024) {
    throw new Error(`certification evidence size is invalid for ${receipt.coordinate}`);
  }
  if (String(evidenceBytes.length) !== receipt.evidenceBytes || sha256(evidenceBytes) !== receipt.evidenceSha256) {
    throw new Error(`certification evidence digest mismatch for ${receipt.coordinate}`);
  }
  if (runner !== undefined && (receipt.runnerOs !== runner.os || receipt.runnerArch !== runner.arch)) {
    throw new Error(`certification runner mismatch for ${receipt.coordinate}`);
  }
  const target = targetFromCoordinate(receipt.category, receipt.coordinate);
  if (target === "macos-x64" && (receipt.runnerOs !== "macOS" || receipt.runnerArch !== "X64")) {
    throw new Error(`x64 coordinate ran on the wrong host: ${receipt.coordinate}`);
  }
  if (target === "macos-aarch64" && (receipt.runnerOs !== "macOS" || receipt.runnerArch !== "ARM64")) {
    throw new Error(`arm64 coordinate ran on the wrong host: ${receipt.coordinate}`);
  }
  return receipt;
};

const collectFiles = async (root) => {
  const result = new Map();
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        if (result.has(entry.name)) throw new Error(`duplicate certification evidence filename ${entry.name}`);
        result.set(entry.name, path);
      } else throw new Error(`non-regular certification evidence entry ${path}`);
    }
  };
  await visit(root);
  return result;
};

export const assembleBundle = async ({ root, expected }) => {
  const files = await collectFiles(root);
  const records = [];
  const bodies = [];
  const expectedFiles = [];
  for (const entry of expected) {
    const slug = coordinateSlug(entry.category, entry.coordinate);
    const receiptName = `${slug}.receipt.json`;
    const evidenceName = `${slug}.evidence.bin`;
    expectedFiles.push(receiptName, evidenceName);
    const receiptPath = files.get(receiptName);
    const evidencePath = files.get(evidenceName);
    if (receiptPath === undefined || evidencePath === undefined) throw new Error(`missing certification evidence for ${entry.coordinate}`);
    const receiptBytes = await readFile(receiptPath);
    const evidenceBytes = await readFile(evidencePath);
    const receipt = validateReceipt({ receiptBytes, evidenceBytes, expected: entry });
    records.push({
      category: entry.category,
      coordinate: entry.coordinate,
      receiptName,
      receiptBytes: String(receiptBytes.length),
      receiptSha256: sha256(receiptBytes),
      evidenceName,
      evidenceBytes: receipt.evidenceBytes,
      evidenceSha256: receipt.evidenceSha256,
    });
    bodies.push(receiptBytes, evidenceBytes);
  }
  const actual = [...files.keys()].sort();
  const wanted = expectedFiles.sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`certification evidence file set mismatch: ${actual.join(",")}`);
  const header = canonicalBytes({ protocol: "effect-build/apple-certification-bundle@1", records });
  return Buffer.concat([header, ...bodies]);
};

export const receiptBasename = (path) => basename(path);

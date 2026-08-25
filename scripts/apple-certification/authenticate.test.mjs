import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { appleCertification, canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import { validateAppleCertification } from "./authenticate.mjs";

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (records) => {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, contents] of records) {
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(contents);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(contents), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(contents.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc32(contents), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(contents.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    local.push(header, filename, compressed);
    central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
};

const bundle = Buffer.from("opaque redacted evidence\n");
const apple = appleCertification;
const sourceSha = "1".repeat(40);
const candidate = {
  descriptor: {
    sourceSha,
    workflowRunId: "2",
    workflowRunAttempt: "1",
    payloadArtifactId: "4",
    payloadArtifactDigest: `sha256:${"5".repeat(64)}`,
  },
  descriptorDigest: "6".repeat(64),
};
const subject = {
  descriptorArtifactId: "3",
  descriptorArtifactDigest: `sha256:${"7".repeat(64)}`,
  workflowRunId: "8",
};
const index = () => ({
  schema: apple.protocols.index,
  version: apple.packageVersion,
  sourceSha,
  candidateWorkflowRunId: "2",
  candidateWorkflowRunAttempt: "1",
  descriptorArtifactId: "3",
  descriptorArtifactDigest: subject.descriptorArtifactDigest,
  payloadArtifactId: "4",
  payloadArtifactDigest: candidate.descriptor.payloadArtifactDigest,
  candidateDescriptorDigest: candidate.descriptorDigest,
  certificationWorkflowRepository: apple.workflowRepository,
  certificationWorkflowPath: apple.workflowPath,
  certificationWorkflowRef: apple.workflowRef,
  certificationWorkflowRunId: "8",
  certificationWorkflowRunAttempt: "1",
  certificationWorkflowRunHeadSha: sourceSha,
  certificationWorkflowEvent: apple.workflowEvent,
  checkedOutSourceSha: sourceSha,
  bundleFileName: apple.bundleFileName,
  bundleBytes: String(bundle.length),
  bundleSha256: sha256(bundle),
  verdict: "certified",
  certificationCells: apple.certificationCells,
  appleDistributionCoordinates: apple.appleDistributionCoordinates,
  appleCleanHostCoordinates: apple.appleCleanHostCoordinates,
});

test("release authentication accepts only the exact Apple envelope", () => {
  const wrapperBytes = zip([
    [apple.indexFileName, canonicalBytes(index())],
    [apple.bundleFileName, bundle],
  ]);
  assert.equal(validateAppleCertification({ wrapperBytes, candidate, subject }).index.verdict, "certified");
});

test("release authentication rejects pruned Apple evidence", () => {
  const pruned = index();
  pruned.appleCleanHostCoordinates = pruned.appleCleanHostCoordinates.slice(1);
  const wrapperBytes = zip([
    [apple.indexFileName, canonicalBytes(pruned)],
    [apple.bundleFileName, bundle],
  ]);
  assert.throws(() => validateAppleCertification({ wrapperBytes, candidate, subject }), /coordinate set mismatch/u);
});

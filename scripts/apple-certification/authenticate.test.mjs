import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { appleCertification, canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import { authenticateAppleCertification, validateAppleCertification } from "./authenticate.mjs";

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
const workflowRunHeadSha = "a".repeat(40);
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
  workflowRunHeadSha,
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
  certificationWorkflowRunHeadSha: workflowRunHeadSha,
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

test("release authentication binds the distinct workflow control-plane head", () => {
  const mismatched = index();
  mismatched.certificationWorkflowRunHeadSha = "b".repeat(40);
  const wrapperBytes = zip([
    [apple.indexFileName, canonicalBytes(mismatched)],
    [apple.bundleFileName, bundle],
  ]);
  assert.throws(() => validateAppleCertification({ wrapperBytes, candidate, subject }), /authority mismatch/u);
});

test("release authentication admits a candidate checkout behind the workflow control-plane head", async () => {
  const wrapperBytes = zip([
    [apple.indexFileName, canonicalBytes(index())],
    [apple.bundleFileName, bundle],
  ]);
  const artifactDigest = `sha256:${sha256(wrapperBytes)}`;
  const artifact = {
    id: 9,
    name: apple.artifactName,
    digest: artifactDigest,
    workflow_run: { id: 8, head_sha: workflowRunHeadSha },
    expired: false,
    expires_at: "2100-01-01T00:00:00Z",
    archive_download_url: "https://artifacts.example/apple.zip",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/actions/runs/8")) {
      return Response.json({
        id: 8,
        run_attempt: 1,
        event: apple.workflowEvent,
        path: apple.workflowPath,
        head_repository: { full_name: apple.workflowRepository },
        head_branch: "main",
        head_sha: workflowRunHeadSha,
        conclusion: "success",
      });
    }
    if (url.endsWith("/actions/artifacts/9")) return Response.json(artifact);
    if (url === artifact.archive_download_url) return new Response(wrapperBytes);
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const authenticated = await authenticateAppleCertification({
      repository: apple.workflowRepository,
      token: "token",
      inputs: {
        appleCertificationWorkflowRunId: "8",
        appleCertificationWorkflowRunAttempt: "1",
        appleCertificationArtifactId: "9",
        appleCertificationArtifactDigest: artifactDigest,
        descriptorArtifactId: subject.descriptorArtifactId,
        descriptorArtifactDigest: subject.descriptorArtifactDigest,
      },
      candidate,
      now: new Date("2026-08-27T00:00:00Z"),
    });
    assert.equal(authenticated.index.sourceSha, sourceSha);
    assert.equal(authenticated.index.certificationWorkflowRunHeadSha, workflowRunHeadSha);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

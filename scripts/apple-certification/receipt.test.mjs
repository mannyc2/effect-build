import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import { categoryCoordinates, validateReceipt } from "./receipt.mjs";

const evidence = Buffer.from("redacted evidence\n");
const expected = {
  category: "distribution",
  coordinate: categoryCoordinates.distribution[0],
  sourceSha: "1".repeat(40),
  candidateWorkflowRunId: "2",
  candidateDescriptorDigest: "3".repeat(64),
  certificationWorkflowRunId: "4",
};

const receipt = () => ({
  protocol: "effect-build/apple-certification-receipt@1",
  version: "0.5.0",
  category: expected.category,
  coordinate: expected.coordinate,
  sourceSha: expected.sourceSha,
  checkedOutSourceSha: expected.sourceSha,
  candidateWorkflowRunId: expected.candidateWorkflowRunId,
  candidateDescriptorDigest: expected.candidateDescriptorDigest,
  certificationWorkflowRunId: expected.certificationWorkflowRunId,
  certificationWorkflowRunAttempt: "1",
  runnerOs: "macOS",
  runnerArch: "X64",
  evidenceBytes: String(evidence.length),
  evidenceSha256: sha256(evidence),
  verdict: "certified",
});

test("certification receipts bind exact evidence and host", () => {
  assert.equal(
    validateReceipt({
      receiptBytes: canonicalBytes(receipt()),
      evidenceBytes: evidence,
      expected,
      runner: { os: "macOS", arch: "X64" },
    }).coordinate,
    expected.coordinate,
  );
});

test("certification receipts reject wrong evidence or architecture", () => {
  assert.throws(
    () => validateReceipt({ receiptBytes: canonicalBytes(receipt()), evidenceBytes: Buffer.from("wrong"), expected }),
    /evidence digest mismatch/u,
  );
  const wrongHost = { ...receipt(), runnerArch: "ARM64" };
  assert.throws(
    () => validateReceipt({ receiptBytes: canonicalBytes(wrongHost), evidenceBytes: evidence, expected }),
    /wrong host/u,
  );
});

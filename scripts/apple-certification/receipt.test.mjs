import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { canonicalBytes, sha256 } from "../node-finalizer/common.mjs";
import {
  assembleBundle,
  bundleProtocol,
  categoryCoordinates,
  coordinateSlug,
  evidenceProtocol,
  packageVersion,
  priorEvidenceManifestProtocol,
  receiptProtocol,
  requestProtocol,
  validateEvidence,
  validateReceipt,
  validateRequest,
} from "./receipt.mjs";

const expectedBase = {
  category: "distribution",
  coordinate: categoryCoordinates.distribution[0],
  sourceSha: "1".repeat(40),
  candidateWorkflowRunId: "2",
  candidateDescriptorDigest: "3".repeat(64),
  certificationWorkflowRunId: "4",
  certifierPath: resolve("fixtures/apple-certifier"),
  certifierSha256: "5".repeat(64),
  bunLockSha256: "6".repeat(64),
  requestSha256: "7".repeat(64),
  runnerOs: "macOS",
  runnerArch: "X64",
};

const priorEvidenceManifest = (binding, entries = []) => ({
  protocol: priorEvidenceManifestProtocol,
  packageVersion,
  category: binding.category,
  coordinate: binding.coordinate,
  sourceSha: binding.sourceSha,
  candidateWorkflowRunId: binding.candidateWorkflowRunId,
  candidateDescriptorDigest: binding.candidateDescriptorDigest,
  certificationWorkflowRunId: binding.certificationWorkflowRunId,
  bunLockSha256: binding.bunLockSha256,
  entries,
});

const emptyPriorEvidenceManifestBytes = canonicalBytes(priorEvidenceManifest(expectedBase));
const expected = {
  ...expectedBase,
  priorEvidenceManifestPath: resolve("fixtures/prior-evidence-manifest.json"),
  priorEvidenceManifestSha256: sha256(emptyPriorEvidenceManifestBytes),
};

const artifact = (role, digest) => ({
  role,
  kind: "mach-o",
  identityKind: "file-sha256",
  identitySha256: digest,
  bytes: "1",
});
const step = (name, digest) => ({
  name,
  status: "passed",
  inputSha256: digest,
  outputSha256: digest,
  detailsSha256: digest,
});

const evidence = (overrides = {}) => ({
  protocol: evidenceProtocol,
  packageVersion,
  category: expected.category,
  coordinate: expected.coordinate,
  sourceSha: expected.sourceSha,
  candidateDescriptorDigest: expected.candidateDescriptorDigest,
  certifierPath: expected.certifierPath,
  certifierSha256: expected.certifierSha256,
  bunLockSha256: expected.bunLockSha256,
  priorEvidenceManifestSha256: expected.priorEvidenceManifestSha256,
  requestSha256: expected.requestSha256,
  runner: { os: "macOS", arch: "X64", osVersion: "15.0" },
  payload: {
    artifacts: [artifact("input", "8".repeat(64)), artifact("distributed", "9".repeat(64))],
    credentials: [{
      kind: "developer-id-application",
      fingerprint: "A".repeat(40),
      teamId: "TEAMID1234",
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
    }],
    notary: [],
    steps: [
      step("sign", "a".repeat(64)),
      step("signature-verify", "b".repeat(64)),
      step("runtime-exercise", "c".repeat(64)),
    ],
    tools: [{ name: "codesign", path: resolve("fixtures/codesign"), version: "1", sha256: "d".repeat(64) }],
  },
  ...overrides,
});

const receipt = (evidenceBytes, overrides = {}) => ({
  protocol: receiptProtocol,
  packageVersion,
  category: expected.category,
  coordinate: expected.coordinate,
  sourceSha: expected.sourceSha,
  checkedOutSourceSha: expected.sourceSha,
  candidateWorkflowRunId: expected.candidateWorkflowRunId,
  candidateDescriptorDigest: expected.candidateDescriptorDigest,
  certificationWorkflowRunId: expected.certificationWorkflowRunId,
  certificationWorkflowRunAttempt: "1",
  certifierPath: expected.certifierPath,
  certifierSha256: expected.certifierSha256,
  bunLockSha256: expected.bunLockSha256,
  cleanWorktree: true,
  priorEvidenceManifestSha256: expected.priorEvidenceManifestSha256,
  requestSha256: expected.requestSha256,
  runnerOs: "macOS",
  runnerArch: "X64",
  evidenceBytes: String(evidenceBytes.length),
  evidenceSha256: sha256(evidenceBytes),
  verdict: "certified",
  ...overrides,
});

const request = () => ({
  protocol: requestProtocol,
  packageVersion,
  category: expected.category,
  coordinate: expected.coordinate,
  sourceSha: expected.sourceSha,
  checkedOutSourceSha: expected.sourceSha,
  candidateWorkflowRunId: expected.candidateWorkflowRunId,
  candidateDescriptorDigest: expected.candidateDescriptorDigest,
  certificationWorkflowRunId: expected.certificationWorkflowRunId,
  certificationWorkflowRunAttempt: "1",
  certifierPath: expected.certifierPath,
  certifierSha256: expected.certifierSha256,
  bunLockSha256: expected.bunLockSha256,
  cleanWorktree: true,
  runnerOs: expected.runnerOs,
  runnerArch: expected.runnerArch,
  candidateDirectory: resolve("fixtures/candidate"),
  priorEvidenceDirectory: resolve("fixtures/prior-evidence"),
  priorEvidenceManifestPath: expected.priorEvidenceManifestPath,
  priorEvidenceManifestSha256: expected.priorEvidenceManifestSha256,
  receiptPath: resolve("fixtures/distribution.receipt.json"),
  evidencePath: resolve("fixtures/distribution.evidence.json"),
});

const validateDistributionReceipt = (options) => validateReceipt({
  priorEvidenceManifestBytes: emptyPriorEvidenceManifestBytes,
  ...options,
});

test("certification request and receipt bind the exact @2 source and certifier identity", () => {
  assert.equal(validateRequest({ requestBytes: canonicalBytes(request()), expected }).protocol, requestProtocol);
  const evidenceBytes = canonicalBytes(evidence());
  assert.equal(
    validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(evidenceBytes)),
      evidenceBytes,
      expected,
      runner: { os: "macOS", arch: "X64" },
    }).coordinate,
    expected.coordinate,
  );
});

test("certification receipts reject @1, wrong evidence, worktree, digest, or architecture", () => {
  const evidenceBytes = canonicalBytes(evidence());
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(evidenceBytes, { protocol: "effect-build/apple-certification-receipt@1" })),
      evidenceBytes,
      expected,
    }),
    /binding mismatch/u,
  );
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(evidenceBytes)),
      evidenceBytes: Buffer.from("wrong"),
      expected,
    }),
    /evidence digest mismatch/u,
  );
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(evidenceBytes, { cleanWorktree: false })),
      evidenceBytes,
      expected,
    }),
    /binding mismatch/u,
  );
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(evidenceBytes, { certifierSha256: "e".repeat(64) })),
      evidenceBytes,
      expected,
    }),
    /binding mismatch/u,
  );
  const wrongHost = receipt(evidenceBytes, { runnerArch: "ARM64" });
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(wrongHost),
      evidenceBytes,
      expected: { ...expected, runnerArch: "ARM64" },
    }),
    /wrong host/u,
  );
});

test("opaque verdict wrappers and pruned category evidence cannot certify", () => {
  const wrapperBytes = canonicalBytes({ verdict: "certified" });
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(wrapperBytes)),
      evidenceBytes: wrapperBytes,
      expected,
    }),
    /field mismatch/u,
  );
  const pruned = evidence();
  pruned.payload.steps = pruned.payload.steps.slice(0, 1);
  const prunedBytes = canonicalBytes(pruned);
  assert.throws(
    () => validateDistributionReceipt({
      receiptBytes: canonicalBytes(receipt(prunedBytes)),
      evidenceBytes: prunedBytes,
      expected,
    }),
    /omit required operation/u,
  );
});

test("clean-host and cell payloads require their category-specific proof", () => {
  const appDistributionCoordinate = categoryCoordinates.distribution.find((coordinate) =>
    coordinate.startsWith("notarized-stapled-app-bundle|macos-x64")
  );
  const cleanPriorEntry = {
    category: "distribution",
    coordinate: appDistributionCoordinate,
    priorEvidenceManifestSha256: "a".repeat(64),
    receiptSha256: "b".repeat(64),
    evidenceSha256: "c".repeat(64),
    artifactIdentityKind: "file-sha256",
    artifactBytes: "1",
    artifactSha256: "8".repeat(64),
  };
  const cleanExpected = {
    ...expected,
    category: "clean-host",
    coordinate: categoryCoordinates["clean-host"][0],
    certifierPath: resolve("fixtures/clean-host-certifier"),
    certifierSha256: "e".repeat(64),
    priorEvidenceManifestSha256: "f".repeat(64),
    priorEvidenceEntries: [cleanPriorEntry],
  };
  const cleanEvidence = {
    protocol: evidenceProtocol,
    packageVersion,
    category: cleanExpected.category,
    coordinate: cleanExpected.coordinate,
    sourceSha: cleanExpected.sourceSha,
    candidateDescriptorDigest: cleanExpected.candidateDescriptorDigest,
    certifierPath: cleanExpected.certifierPath,
    certifierSha256: cleanExpected.certifierSha256,
    bunLockSha256: cleanExpected.bunLockSha256,
    priorEvidenceManifestSha256: cleanExpected.priorEvidenceManifestSha256,
    requestSha256: cleanExpected.requestSha256,
    runner: { os: "macOS", arch: "X64", osVersion: "15.0" },
    payload: {
      artifacts: [artifact("transport", "8".repeat(64)), artifact("acquired-product", "9".repeat(64))],
      priorEvidence: [cleanPriorEntry],
      quarantine: {
        transportSha256: "8".repeat(64),
        attributeSha256: "c".repeat(64),
        decision: "accepted",
      },
      steps: ["acquire", "quarantine-verify", "gatekeeper", "launch", "runtime-exercise"].map((name) =>
        step(name, "d".repeat(64))
      ),
      tools: [{ name: "spctl", path: resolve("fixtures/spctl"), version: "1", sha256: "e".repeat(64) }],
    },
  };
  assert.equal(
    validateEvidence({
      evidenceBytes: canonicalBytes(cleanEvidence),
      expected: cleanExpected,
      runner: { os: "macOS", arch: "X64" },
    }).category,
    "clean-host",
  );
  cleanEvidence.payload.priorEvidence[0].coordinate = categoryCoordinates.distribution.find((coordinate) =>
    coordinate.startsWith("notarized-stapled-app-bundle|macos-aarch64")
  );
  assert.throws(
    () => validateEvidence({ evidenceBytes: canonicalBytes(cleanEvidence), expected: cleanExpected }),
    /dependency mismatch/u,
  );

  const cellExpected = {
    ...expected,
    category: "cell",
    coordinate: "A0",
    priorEvidenceManifestSha256: "f".repeat(64),
    priorEvidenceEntries: [],
  };
  const cellEvidence = {
    protocol: evidenceProtocol,
    packageVersion,
    category: "cell",
    coordinate: "A0",
    sourceSha: cellExpected.sourceSha,
    candidateDescriptorDigest: cellExpected.candidateDescriptorDigest,
    certifierPath: cellExpected.certifierPath,
    certifierSha256: cellExpected.certifierSha256,
    bunLockSha256: cellExpected.bunLockSha256,
    priorEvidenceManifestSha256: cellExpected.priorEvidenceManifestSha256,
    requestSha256: cellExpected.requestSha256,
    runner: { os: "macOS", arch: "ARM64", osVersion: "15.0" },
    payload: {
      artifacts: [artifact("candidate", "8".repeat(64))],
      priorEvidence: [],
      claims: [{ name: "deterministic-implementation", status: "passed", evidenceSha256: "c".repeat(64) }],
      steps: [step("evaluate", "d".repeat(64))],
      tools: [{ name: "bun", path: resolve("fixtures/bun"), version: "1.3.14", sha256: "e".repeat(64) }],
    },
  };
  assert.equal(validateEvidence({ evidenceBytes: canonicalBytes(cellEvidence), expected: cellExpected }).coordinate, "A0");
  cellEvidence.payload.claims[0].name = "verdict-only";
  assert.throws(
    () => validateEvidence({ evidenceBytes: canonicalBytes(cellEvidence), expected: cellExpected }),
    /claims omit deterministic-implementation/u,
  );
});

test("bundle aggregation accepts only the exact receipt/evidence file set", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-apple-receipt-"));
  try {
    const evidenceBytes = canonicalBytes(evidence());
    const receiptBytes = canonicalBytes(receipt(evidenceBytes));
    const slug = coordinateSlug(expected.category, expected.coordinate);
    await writeFile(join(root, `${slug}.prior-evidence.json`), emptyPriorEvidenceManifestBytes);
    await writeFile(join(root, `${slug}.receipt.json`), receiptBytes);
    await writeFile(join(root, `${slug}.evidence.json`), evidenceBytes);
    const bundle = await assembleBundle({ root, expected: [expected] });
    assert.match(bundle.toString("utf8", 0, bundle.indexOf(0x0a) + 1), new RegExp(bundleProtocol, "u"));
    await writeFile(join(root, "unexpected"), "no");
    await assert.rejects(() => assembleBundle({ root, expected: [expected] }), /file set mismatch/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

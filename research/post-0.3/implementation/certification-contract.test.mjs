import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedReceiptClaims,
  loadProfileDocuments,
  sha256,
  validateCurrentHandoffState,
  validateCurrentReceipt,
  validateHistoricalApi,
  validateHistoricalArchive,
  validateImplementationCertificate,
  validateProfileDocuments,
} from "./certification-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const documents = await loadProfileDocuments(repository);

const historicalApiFixture = () => ({
  run: {
    id: Number(documents.anchor.workflow.runId),
    run_attempt: Number(documents.anchor.workflow.runAttempt),
    name: documents.anchor.workflow.name,
    path: documents.anchor.workflow.path,
    event: documents.anchor.workflow.eventName,
    status: "completed",
    conclusion: documents.anchor.workflow.conclusion,
    head_sha: documents.anchor.sourceSha,
    repository: { full_name: documents.anchor.workflow.repository },
  },
  artifact: {
    id: Number(documents.anchor.aggregateArtifact.id),
    name: documents.anchor.aggregateArtifact.name,
    size_in_bytes: documents.anchor.aggregateArtifact.sizeInBytes,
    digest: documents.anchor.aggregateArtifact.digest,
    expired: false,
    workflow_run: {
      id: Number(documents.anchor.workflow.runId),
      head_sha: documents.anchor.sourceSha,
    },
  },
});

const historicalArchiveFixture = () => {
  const anchor = structuredClone(documents.anchor);
  const receiptBytes = new Map(anchor.receipts.map((receipt) => {
    const bytes = Buffer.from(`${JSON.stringify({
      schema: "effect-build/architecture-receipt@2",
      id: receipt.id,
      sourceSha: anchor.sourceSha,
      status: "reproduced",
      claims: [{ id: "fixture", classification: "established", conclusion: "fixture", assertions: [] }],
      evidence: {},
    }, null, 2)}\n`);
    receipt.digest = sha256(bytes);
    return [receipt.file, bytes];
  }));
  const certificate = {
    schema: anchor.certification.schema,
    sourceSha: anchor.sourceSha,
    baseSha: anchor.baseSha,
    releaseSha: anchor.releaseSha,
    workflow: {
      repository: anchor.workflow.repository,
      workflow: anchor.workflow.name,
      runId: anchor.workflow.runId,
      runAttempt: anchor.workflow.runAttempt,
      eventName: anchor.workflow.eventName,
    },
    requiredJobs: anchor.certification.requiredJobs,
    artifacts: anchor.certification.artifacts,
    expectedDocuments: anchor.certification.expectedDocuments,
    repositoryScope: {
      result: anchor.certification.repositoryScope.result,
      changedPathDigest: anchor.certification.repositoryScope.changedPathDigest,
    },
    remoteHead: anchor.certification.remoteHead,
    receipts: anchor.receipts,
    claims: anchor.certification.claims,
    result: anchor.certification.result,
  };
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  anchor.certification.digest = sha256(certificateBytes);
  const archiveBytes = Buffer.from("deterministic synthetic artifact archive");
  anchor.aggregateArtifact.sizeInBytes = archiveBytes.byteLength;
  anchor.aggregateArtifact.digest = sha256(archiveBytes);
  return {
    anchor,
    archiveBytes,
    certificateBytes,
    entries: [anchor.certification.file, ...anchor.receipts.map((receipt) => receipt.file)],
    receiptBytes,
  };
};

test("the durable freeze anchor pins the complete successful certificate chain", () => {
  const { anchor, profile } = documents;
  assert.equal(anchor.sourceSha, "a3017657e0851530892a9f3d2d55ac5736769881");
  assert.equal(anchor.workflow.runId, "32502909677");
  assert.equal(anchor.workflow.runAttempt, "1");
  assert.equal(anchor.aggregateArtifact.id, "9454270941");
  assert.equal(
    anchor.aggregateArtifact.digest,
    "sha256:a502ab64e0cda8fb743f3f6175dfcde4c098eeb9546cc98173a7a6b339002233",
  );
  assert.equal(
    anchor.certification.digest,
    "sha256:363b4981470cc95eb6c43fc8e56623aaca1f5d2f89c2e9ca38bcc8e3b2e0fc5c",
  );
  assert.equal(anchor.receipts.length, 20);
  assert.equal(anchor.receipts.every((receipt) => /^sha256:[0-9a-f]{64}$/.test(receipt.digest)), true);
  assert.equal(anchor.receipts.some((receipt) => receipt.id === "surface-freeze"), true);
  assert.notEqual(anchor.profileId, profile.profileId);
});

test("profile loading uses only the two explicit document paths", async () => {
  const temporaryRepository = await mkdtemp(join(tmpdir(), "effect-build-plan039-profile-"));
  const directory = resolve(temporaryRepository, "research/post-0.3/implementation");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "profile.json"), `${JSON.stringify(documents.profile, null, 2)}\n`);
    await writeFile(resolve(directory, "freeze-trust-anchor.json"), `${JSON.stringify(documents.anchor, null, 2)}\n`);
    await writeFile(resolve(directory, "expected-claims.json"), `${JSON.stringify(documents.expected, null, 2)}\n`);
    await writeFile(resolve(directory, "expected-rogue-conclusions.json"), "{ definitely not valid JSON");
    await assert.doesNotReject(() => loadProfileDocuments(temporaryRepository));
  } finally {
    await rm(temporaryRepository, { recursive: true, force: true });
  }
});

test("profile ids, producer sets, and document coordinates fail closed", () => {
  const mixed = structuredClone(documents);
  mixed.profile.historicalProfileIds = [mixed.profile.profileId];
  assert.throws(() => validateProfileDocuments(mixed), /historical profile|profile ids mix/);

  const wildcard = structuredClone(documents);
  wildcard.profile.expectedClaims = "research/post-0.3/implementation/expected-*.json";
  assert.throws(() => validateProfileDocuments(wildcard), /explicit repository paths/);

  const autoProducer = structuredClone(documents);
  autoProducer.profile.producers.push(structuredClone(autoProducer.profile.producers[0]));
  assert.throws(() => validateProfileDocuments(autoProducer), /one producer/);

  const freezeReceipt = structuredClone(documents);
  freezeReceipt.profile.currentReceiptIds.push("surface-freeze");
  assert.throws(() => validateProfileDocuments(freezeReceipt), /producer and current receipts drifted|forbidden/);
});

test("historical run and artifact metadata authenticate exactly", () => {
  const input = historicalApiFixture();
  assert.doesNotThrow(() => validateHistoricalApi({ anchor: documents.anchor, ...input }));

  const wrongAttempt = historicalApiFixture();
  wrongAttempt.run.run_attempt = 2;
  assert.throws(() => validateHistoricalApi({ anchor: documents.anchor, ...wrongAttempt }), /attempt drifted/);

  const wrongArtifact = historicalApiFixture();
  wrongArtifact.artifact.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateHistoricalApi({ anchor: documents.anchor, ...wrongArtifact }), /digest drifted/);

  const expired = historicalApiFixture();
  expired.artifact.expired = true;
  assert.throws(() => validateHistoricalApi({ anchor: documents.anchor, ...expired }), /expired/);
});

test("archive, certification, and every explicit receipt byte authenticate together", () => {
  const input = historicalArchiveFixture();
  assert.doesNotThrow(() => validateHistoricalArchive(input));

  const staleReceipt = historicalArchiveFixture();
  const first = staleReceipt.anchor.receipts[0];
  staleReceipt.receiptBytes.set(first.file, Buffer.from("changed"));
  assert.throws(() => validateHistoricalArchive(staleReceipt), /receipt digest changed/);

  const missingReceipt = historicalArchiveFixture();
  missingReceipt.entries.pop();
  assert.throws(() => validateHistoricalArchive(missingReceipt), /entry set drifted/);

  const mixedCertificate = historicalArchiveFixture();
  mixedCertificate.certificateBytes = Buffer.from("{}\n");
  assert.throws(() => validateHistoricalArchive(mixedCertificate), /certification bytes changed/);
});

test("the phase handoff is current-head only and leaves production at v0.3", async () => {
  const planSource = await readFile(resolve(repository, "plans/039-establish-core-capability-boundaries.md"), "utf8");
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const input = {
    anchor: documents.anchor,
    changedPaths: [
      ".github/workflows/architecture-research.yml",
      "plans/039-establish-core-capability-boundaries.md",
      "research/post-0.3/implementation/profile.json",
    ],
    freezeIsAncestor: true,
    head: "b".repeat(40),
    planSource,
    productionFreezeDiff: [],
    productionReleaseDiff: [],
    profile: documents.profile,
    releaseIsAncestor: true,
    sourceSha: "b".repeat(40),
    workflowSource,
  };
  assert.doesNotThrow(() => validateCurrentHandoffState(input));

  const productionChange = structuredClone(input);
  productionChange.changedPaths.push("packages/effect-build/src/index.ts");
  assert.throws(() => validateCurrentHandoffState(productionChange), /disallowed path/);

  const baselineDrift = structuredClone(input);
  baselineDrift.productionFreezeDiff = ["package.json"];
  assert.throws(() => validateCurrentHandoffState(baselineDrift), /changed production paths/);

  const oldFreezeInvocation = structuredClone(input);
  oldFreezeInvocation.workflowSource += "\nresearch/post-0.3/freeze/validate-freeze.mjs\n";
  assert.throws(() => validateCurrentHandoffState(oldFreezeInvocation), /historical freeze code/);
});

test("historical freeze inputs cannot enter the current receipt set or certificate", () => {
  const sourceSha = "b".repeat(40);
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: documents.profile.profileId,
    id: documents.expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(documents.expected),
    evidence: {
      historicalFreeze: {
        profileId: documents.anchor.profileId,
        receiptCount: 20,
        receiptSetDigest: `sha256:${"1".repeat(64)}`,
      },
      profileSeparation: {
        currentProfileId: documents.profile.profileId,
        currentReceiptDirectoryEnvironment: documents.profile.receiptDirectoryEnvironment,
        currentReceiptIds: documents.profile.currentReceiptIds,
      },
    },
  };
  assert.doesNotThrow(() => validateCurrentReceipt({
    expected: documents.expected,
    profile: documents.profile,
    receipt,
    sourceSha,
  }));
  const mixedReceipt = structuredClone(receipt);
  mixedReceipt.evidence.historicalFreeze.receipts = [{ id: "foreign" }];
  assert.throws(() => validateCurrentReceipt({
    expected: documents.expected,
    profile: documents.profile,
    receipt: mixedReceipt,
    sourceSha,
  }), /entered the current receipt/);
  const digest = sha256(Buffer.from(JSON.stringify(receipt)));
  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: documents.profile.profileId,
    plan: documents.profile.plan,
    phase: documents.profile.phase,
    sourceSha,
    historicalInputs: { freeze: { profileId: documents.anchor.profileId } },
    currentReceipts: [{ id: receipt.id, file: `${receipt.id}.json`, digest }],
    result: "certified",
  };
  assert.doesNotThrow(() => validateImplementationCertificate({
    certificate,
    currentReceiptDigest: digest,
    profile: documents.profile,
    sourceSha,
  }));

  certificate.currentReceipts = [{ id: "surface-freeze", file: "surface-freeze.json", digest }];
  assert.throws(
    () => validateImplementationCertificate({ certificate, currentReceiptDigest: digest, profile: documents.profile, sourceSha }),
    /Expected values|freeze-only receipt/,
  );
});

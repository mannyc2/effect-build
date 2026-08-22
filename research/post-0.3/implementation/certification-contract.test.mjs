import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedReceiptClaims,
  historicalAuthoritySummary,
  loadProfileDocuments,
  requiredImplementationCommands,
  sha256,
  validateActiveInstructions,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateImplementationCertificate,
  validatePlan040Api,
  validatePlan040Anchor,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const documents = await loadProfileDocuments(repository);
const { expected, freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor, profile } = documents;
const handoffManifest = JSON.parse(execFileSync(
  "git",
  ["show", `${profile.productionBaseline.handoffSha}:${profile.workspaceManifest.path}`],
  { cwd: repository, encoding: "utf8" },
));
const currentManifest = JSON.parse(await readFile(resolve(repository, profile.workspaceManifest.path), "utf8"));
const handoffInstructions = execFileSync(
  "git",
  ["show", `${profile.productionBaseline.handoffSha}:AGENTS.md`],
  { cwd: repository, encoding: "utf8" },
);
const currentInstructions = await readFile(resolve(repository, "AGENTS.md"), "utf8");

const clone = (value) => structuredClone(value);
const mustReject = (operation, pattern) => assert.throws(operation, pattern);

test("Plan 041 profile binds the exact historical chain and frozen file sets", () => {
  assert.equal(profile.profileId, "effect-build/plan041-implementation@1");
  assert.equal(profile.productionBaseline.plan040Sha, plan040Anchor.sourceSha);
  assert.equal(profile.bunImplementationFiles.length, 5);
  assert.equal(profile.esbuildImplementationFiles.length, 4);
  assert.equal(profile.coreStagedFiles.length, 6);
  assert.equal(profile.immutablePublicPaths.length, 12);
  assert.equal(requiredImplementationCommands.at(-1), "node research/post-0.3/implementation/certify-current-head.mjs");
  assert.equal(profile.forbiddenCurrentReceiptIds.includes(plan040Anchor.receipt.id), true);
});

test("Plan 040 trust anchor rejects source, artifact, certificate, and parent drift", () => {
  for (const mutate of [
    (value) => value.sourceSha = "0".repeat(40),
    (value) => value.aggregateArtifact.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.certification.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.receipt.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.plan039Input.sourceSha = "0".repeat(40),
  ]) {
    const changed = clone(plan040Anchor);
    mutate(changed);
    mustReject(() => validatePlan040Anchor({ plan039Anchor, plan040Anchor: changed }), /AssertionError|Expected values/);
  }
});

const runFixture = () => ({
  id: Number(plan040Anchor.workflow.runId),
  run_attempt: Number(plan040Anchor.workflow.runAttempt),
  name: plan040Anchor.workflow.name,
  path: plan040Anchor.workflow.path,
  event: "push",
  status: "completed",
  conclusion: "success",
  head_sha: plan040Anchor.sourceSha,
  repository: { full_name: plan040Anchor.workflow.repository },
});

const artifactFixture = () => ({
  id: Number(plan040Anchor.aggregateArtifact.id),
  name: plan040Anchor.aggregateArtifact.name,
  size_in_bytes: plan040Anchor.aggregateArtifact.sizeInBytes,
  digest: plan040Anchor.aggregateArtifact.digest,
  expired: false,
  workflow_run: { id: Number(plan040Anchor.workflow.runId), head_sha: plan040Anchor.sourceSha },
});

test("Plan 040 GitHub API evidence requires the exact successful push artifact", () => {
  validatePlan040Api({ artifact: artifactFixture(), plan040Anchor, run: runFixture() });
  for (const [target, key, value] of [
    [runFixture(), "event", "pull_request"],
    [runFixture(), "head_sha", "0".repeat(40)],
    [artifactFixture(), "digest", `sha256:${"0".repeat(64)}`],
    [artifactFixture(), "expired", true],
  ]) {
    target[key] = value;
    mustReject(
      () => validatePlan040Api({
        artifact: "size_in_bytes" in target ? target : artifactFixture(),
        plan040Anchor,
        run: "head_sha" in target && !("size_in_bytes" in target) ? target : runFixture(),
      }),
      /AssertionError|Expected values/,
    );
  }
});

test("workspace and active instructions admit only the exact Plan 041 staging delta", () => {
  const workspace = validateWorkspaceManifest({ currentManifest, handoffManifest, profile });
  assert.deepEqual(workspace.scriptAdds, profile.workspaceManifest.scriptAdds);
  const instructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  assert.deepEqual(instructions.completedPlans, ["039", "040", "041"]);
  const drifted = clone(currentManifest);
  drifted.scripts.check += " && echo drift";
  mustReject(() => validateWorkspaceManifest({ currentManifest: drifted, handoffManifest, profile }), /workspace manifest/);
});

test("implementation state requires exact Bun additions and frozen older implementation bytes", async () => {
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const planSource = await readFile(resolve(repository, "plans/041-add-bun-api-command-lanes.md"), "utf8");
  const planIndexSource = await readFile(resolve(repository, "plans/README.md"), "utf8");
  const base = {
    ancestry: {
      releaseIsFreezeAncestor: true,
      freezeIsHandoffAncestor: true,
      handoffIsPlan039Ancestor: true,
      plan039IsPlan040Ancestor: true,
      plan040IsCurrentAncestor: true,
    },
    changedPaths: [...profile.bunImplementationFiles],
    coreStagedDiff: [],
    esbuildStagedDiff: [],
    head: "a".repeat(40),
    immutablePublicDiff: [],
    implementationAddedOrModifiedPaths: [...profile.bunImplementationFiles],
    planIndexSource,
    planSource,
    profile,
    sourceSha: "a".repeat(40),
    workflowSource,
  };
  const result = validateCurrentImplementationState(base);
  assert.deepEqual(result.implementationFiles, profile.bunImplementationFiles);
  mustReject(() => validateCurrentImplementationState({ ...base, coreStagedDiff: [profile.coreStagedFiles[0]] }), /Plan 039 core/);
  mustReject(() => validateCurrentImplementationState({ ...base, immutablePublicDiff: [profile.immutablePublicPaths[0]] }), /released 0.3/);
  mustReject(() => validateCurrentImplementationState({ ...base, changedPaths: ["outside.txt"] }), /outside implementation scope/);
});

test("remote evidence binds event, checkout, and fresh remote head", () => {
  const sourceSha = "b".repeat(40);
  const evidence = {
    eventName: "push",
    eventSourceSha: sourceSha,
    observedRef: "refs/heads/codex/plan041-bun-lane",
    observedSha: sourceSha,
    repository: "mannyc2/effect-build",
    sourceSha,
  };
  assert.equal(validateCurrentRemoteEvidence(evidence).observedSha, sourceSha);
  mustReject(() => validateCurrentRemoteEvidence({ ...evidence, observedSha: "c".repeat(40) }), /Expected values/);
});

test("receipt and certificate contain Plan 040 only as historical input", () => {
  const sourceSha = "d".repeat(40);
  const historicalAuthority = historicalAuthoritySummary({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor });
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: profile.profileId,
    id: expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(expected),
    evidence: {
      historicalAuthority,
      plan040Artifact: { sourceSha: plan040Anchor.sourceSha, transport: "github-api" },
      currentHead: { observedSha: sourceSha, repository: plan040Anchor.workflow.repository },
      repositoryScope: {
        planStatus: "DONE",
        implementationFiles: [...profile.bunImplementationFiles].sort(),
        coreStagedDiff: [],
        esbuildStagedDiff: [],
        immutablePublicDiff: [],
        requiredCommands: requiredImplementationCommands,
        workflowDigest: "sha256:fb7a8ec475a2a9bad2c6c0854fb534850c514718142a92014e4a02a4d31677cc",
        activeInstructions: {
          handoffSha: profile.productionBaseline.handoffSha,
          path: "AGENTS.md",
          completedPlans: ["039", "040", "041"],
          nextPlan: "042",
          publicationAuthority: "NONE",
        },
        workspaceManifest: {
          handoffSha: profile.productionBaseline.handoffSha,
          ...profile.workspaceManifest,
        },
      },
      profileSeparation: {
        historicalProfileIds: profile.historicalProfileIds,
        currentProfileId: profile.profileId,
        historicalArtifactsAreInputsOnly: true,
        currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
        currentReceiptIds: profile.currentReceiptIds,
        currentCertificateFile: profile.certificateFile,
      },
    },
  };
  validateCurrentReceipt({
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    profile,
    receipt,
    sourceSha,
  });
  const digest = sha256(Buffer.from(JSON.stringify(receipt)));
  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: profile.profileId,
    plan: "041",
    phase: "implementation",
    sourceSha,
    workflow: {
      repository: plan040Anchor.workflow.repository,
      workflow: "plan-041-implementation-certification",
      runId: "1",
      runAttempt: "1",
      eventName: "push",
    },
    historicalInputs: historicalAuthority,
    currentReceipts: [{ id: expected.receiptId, file: `${expected.receiptId}.json`, digest }],
    claims: expected.claims.length,
    result: "certified",
  };
  validateImplementationCertificate({
    certificate,
    currentReceiptDigest: digest,
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    profile,
    sourceSha,
  });
  mustReject(() => validateCurrentReceipt({
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    profile,
    receipt: { ...receipt, id: plan040Anchor.receipt.id },
    sourceSha,
  }), /Expected values/);
});

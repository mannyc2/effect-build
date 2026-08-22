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
  plan042CertificationRef,
  requiredImplementationCommands,
  sha256,
  sourcePolicyVerifierOrigin,
  sourcePolicyVerifierPaths,
  validateActiveInstructions,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateImplementationCertificate,
  validatePlan041Anchor,
  validatePlan041Api,
  validateSourcePolicyVerifierOrigin,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const documents = await loadProfileDocuments(repository);
const { expected, freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor, plan041Anchor, profile } = documents;
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

test("the Plan 042 certifier is syntactically executable by the CI Node runtime", () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--check", resolve(here, "certify-current-head.mjs")], { encoding: "utf8" })
  );
});

test("Plan 042 profile binds the exact Plan 041 predecessor and frozen file sets", () => {
  assert.equal(profile.profileId, "effect-build/plan042-implementation@1");
  assert.equal(profile.productionBaseline.plan041Sha, plan041Anchor.sourceSha);
  assert.equal(profile.denoImplementationFiles.length, 5);
  assert.equal(profile.bunImplementationFiles.length, 5);
  assert.equal(profile.esbuildImplementationFiles.length, 4);
  assert.equal(profile.coreStagedFiles.length, 6);
  assert.equal(profile.immutablePublicPaths.length, 12);
  assert.equal(requiredImplementationCommands.at(-1), "node research/post-0.3/implementation/certify-current-head.mjs");
  assert.equal(profile.forbiddenCurrentReceiptIds.includes(plan041Anchor.receipt.id), true);
  assert.equal(expected.claims.length, 5);
});

test("Plan 041 trust anchor rejects source, artifact, certificate, receipt, and parent drift", () => {
  for (const mutate of [
    (value) => value.sourceSha = "0".repeat(40),
    (value) => value.aggregateArtifact.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.certification.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.receipt.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.plan040Input.sourceSha = "0".repeat(40),
  ]) {
    const changed = clone(plan041Anchor);
    mutate(changed);
    mustReject(() => validatePlan041Anchor({ plan040Anchor, plan041Anchor: changed }), /AssertionError|Expected values/);
  }
});

const runFixture = () => ({
  id: Number(plan041Anchor.workflow.runId),
  run_attempt: Number(plan041Anchor.workflow.runAttempt),
  name: plan041Anchor.workflow.name,
  path: plan041Anchor.workflow.path,
  event: "pull_request",
  status: "completed",
  conclusion: "success",
  head_sha: plan041Anchor.sourceSha,
  repository: { full_name: plan041Anchor.workflow.repository },
});

const artifactFixture = () => ({
  id: Number(plan041Anchor.aggregateArtifact.id),
  name: plan041Anchor.aggregateArtifact.name,
  size_in_bytes: plan041Anchor.aggregateArtifact.sizeInBytes,
  digest: plan041Anchor.aggregateArtifact.digest,
  expired: false,
  workflow_run: { id: Number(plan041Anchor.workflow.runId), head_sha: plan041Anchor.sourceSha },
});

test("Plan 041 GitHub API evidence requires the exact successful pull-request artifact", () => {
  validatePlan041Api({ artifact: artifactFixture(), plan041Anchor, run: runFixture() });
  for (const [target, key, value] of [
    [runFixture(), "event", "push"],
    [runFixture(), "head_sha", "0".repeat(40)],
    [artifactFixture(), "digest", `sha256:${"0".repeat(64)}`],
    [artifactFixture(), "expired", true],
  ]) {
    target[key] = value;
    mustReject(
      () => validatePlan041Api({
        artifact: "size_in_bytes" in target ? target : artifactFixture(),
        plan041Anchor,
        run: "head_sha" in target && !("size_in_bytes" in target) ? target : runFixture(),
      }),
      /AssertionError|Expected values/,
    );
  }
});

test("Plan 042 records candidate policy and verifier bytes without claiming independent protection", () => {
  const sourceSha = "c".repeat(40);
  const origin = sourcePolicyVerifierOrigin({
    sourceSha,
    documents: sourcePolicyVerifierPaths.map((path) => ({ path, digest: sha256(Buffer.from(path)) })),
  });
  assert.deepEqual(origin, {
    schema: "effect-build/source-policy-verifier-origin@1",
    sourceSha,
    scope: "candidate-source-reproduction",
    independentlyProtected: false,
    independentAuthorityPrerequisite: "separately-reviewed-protected-workflow-or-app-with-an-externally-pinned-verifier",
    documents: sourcePolicyVerifierPaths.map((path) => ({ path, digest: sha256(Buffer.from(path)) })),
  });
  mustReject(() => sourcePolicyVerifierOrigin({
    sourceSha,
    documents: [...origin.documents].reverse(),
  }), /source policy\/verifier document paths/);
  mustReject(() => sourcePolicyVerifierOrigin({
    sourceSha,
    documents: origin.documents.map((document, index) => index === 0
      ? { ...document, digest: "sha256:not-a-digest" }
      : document),
  }), /invalid source policy\/verifier digest/);
  mustReject(
    () => validateSourcePolicyVerifierOrigin({ ...origin, independentlyProtected: true }),
    /source policy\/verifier origin drifted/,
  );
});

test("workspace and active instructions admit only the exact Plan 042 staging delta", () => {
  const workspace = validateWorkspaceManifest({ currentManifest, handoffManifest, profile });
  assert.deepEqual(workspace.scriptAdds, profile.workspaceManifest.scriptAdds);
  const instructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  assert.deepEqual(instructions.completedPlans, ["039", "040", "041", "042"]);
  const drifted = clone(currentManifest);
  drifted.scripts.check += " && echo drift";
  mustReject(() => validateWorkspaceManifest({ currentManifest: drifted, handoffManifest, profile }), /workspace manifest/);
});

test("implementation state requires exact Deno additions and frozen older implementation bytes", async () => {
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const planSource = await readFile(resolve(repository, "plans/042-add-deno-bundle-command-lanes.md"), "utf8");
  const planIndexSource = await readFile(resolve(repository, "plans/README.md"), "utf8");
  const base = {
    ancestry: {
      releaseIsFreezeAncestor: true,
      freezeIsHandoffAncestor: true,
      handoffIsPlan039Ancestor: true,
      plan039IsPlan040Ancestor: true,
      plan040IsPlan041Ancestor: true,
      plan041IsCurrentAncestor: true,
    },
    changedPaths: [...profile.denoImplementationFiles],
    coreStagedDiff: [],
    esbuildStagedDiff: [],
    bunStagedDiff: [],
    head: "a".repeat(40),
    immutablePublicDiff: [],
    implementationAddedOrModifiedPaths: [...profile.denoImplementationFiles],
    planIndexSource,
    planSource,
    profile,
    sourceSha: "a".repeat(40),
    workflowSource,
  };
  const result = validateCurrentImplementationState(base);
  assert.deepEqual(result.implementationFiles, [...profile.denoImplementationFiles].sort());
  mustReject(() => validateCurrentImplementationState({ ...base, coreStagedDiff: [profile.coreStagedFiles[0]] }), /Plan 039 core/);
  mustReject(() => validateCurrentImplementationState({ ...base, bunStagedDiff: [profile.bunImplementationFiles[0]] }), /Plan 041 Bun/);
  mustReject(() => validateCurrentImplementationState({ ...base, immutablePublicDiff: [profile.immutablePublicPaths[0]] }), /released 0.3/);
  mustReject(() => validateCurrentImplementationState({ ...base, changedPaths: ["outside.txt"] }), /outside implementation scope/);
});

test("remote evidence binds event, checkout, and fresh remote head", () => {
  const sourceSha = "b".repeat(40);
  const evidence = {
    eventName: "push",
    eventSourceSha: sourceSha,
    observedRef: plan042CertificationRef,
    observedSha: sourceSha,
    repository: "mannyc2/effect-build",
    ref: plan042CertificationRef,
    refType: "branch",
    sourceSha,
  };
  assert.equal(validateCurrentRemoteEvidence(evidence).observedSha, sourceSha);
  mustReject(() => validateCurrentRemoteEvidence({ ...evidence, observedSha: "c".repeat(40) }), /Expected values/);
  mustReject(() => validateCurrentRemoteEvidence({ ...evidence, refType: "tag" }), /Expected values/);
});

test("receipt and certificate contain Plan 041 only as historical input", () => {
  const sourceSha = "d".repeat(40);
  const policyVerifierOrigin = sourcePolicyVerifierOrigin({
    sourceSha,
    documents: sourcePolicyVerifierPaths.map((path) => ({ path, digest: sha256(Buffer.from(path)) })),
  });
  const historicalAuthority = historicalAuthoritySummary({
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
  });
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: profile.profileId,
    id: expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(expected),
    evidence: {
      historicalAuthority,
      plan041Artifact: { sourceSha: plan041Anchor.sourceSha, transport: "github-api" },
      currentHead: { observedSha: sourceSha, repository: plan041Anchor.workflow.repository },
      sourcePolicyVerifierOrigin: policyVerifierOrigin,
      repositoryScope: {
        planStatus: "DONE",
        implementationFiles: [...profile.denoImplementationFiles].sort(),
        coreStagedDiff: [],
        esbuildStagedDiff: [],
        bunStagedDiff: [],
        immutablePublicDiff: [],
        requiredCommands: requiredImplementationCommands,
        workflowDigest: "sha256:ace9d11e267e08c1e30f98010f1605803a6b52a5be41605fca13ca892dc12fc5",
        activeInstructions: {
          handoffSha: profile.productionBaseline.handoffSha,
          path: "AGENTS.md",
          completedPlans: ["039", "040", "041", "042"],
          nextPlan: "043",
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
    plan041Anchor,
    profile,
    receipt,
    sourceSha,
  });
  const digest = sha256(Buffer.from(JSON.stringify(receipt)));
  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: profile.profileId,
    plan: "042",
    phase: "implementation",
    sourceSha,
    workflow: {
      repository: plan041Anchor.workflow.repository,
      workflow: "plan-042-implementation-certification",
      runId: "1",
      runAttempt: "1",
      eventName: "push",
      ref: plan042CertificationRef,
      refType: "branch",
    },
    historicalInputs: historicalAuthority,
    sourcePolicyVerifierOrigin: policyVerifierOrigin,
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
    plan041Anchor,
    profile,
    sourcePolicyVerifierOrigin: policyVerifierOrigin,
    sourceSha,
  });
  mustReject(() => validateCurrentReceipt({
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    profile,
    receipt: { ...receipt, id: plan041Anchor.receipt.id },
    sourceSha,
  }), /Expected values/);
  mustReject(() => validateCurrentReceipt({
    expected,
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    profile,
    receipt: {
      ...receipt,
      evidence: {
        ...receipt.evidence,
        sourcePolicyVerifierOrigin: { ...policyVerifierOrigin, independentlyProtected: true },
      },
    },
    sourceSha,
  }), /source policy\/verifier origin drifted/);
});

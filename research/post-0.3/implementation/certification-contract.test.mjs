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
  plan043CertificationRef,
  requiredImplementationCommands,
  sha256,
  sourcePolicyVerifierOrigin,
  sourcePolicyVerifierPaths,
  validateActiveInstructions,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateImplementationCertificate,
  validatePlan042Anchor,
  validatePlan042Api,
  validatePlan042Archive,
  validateSourcePolicyVerifierOrigin,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const documents = await loadProfileDocuments(repository);
const { expected, freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor, plan041Anchor, plan042Anchor, profile } = documents;
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

test("the Plan 043 certifier is syntactically executable by the CI Node runtime", () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--check", resolve(here, "certify-current-head.mjs")], { encoding: "utf8" })
  );
});

test("Plan 043 profile binds the exact Plan 042 predecessor and the closed Node SEA scope", () => {
  assert.equal(profile.profileId, "effect-build/plan043-implementation@1");
  assert.equal(profile.productionBaseline.plan042Sha, plan042Anchor.sourceSha);
  assert.deepEqual(profile.nodeSeaImplementationFiles, [
    "packages/effect-build-node-sea/src/AssembleExecutable.ts",
    "packages/effect-build-node-sea/src/internal/v04/compatibility.ts",
    "packages/effect-build-node-sea/src/internal/v04/executable.ts",
    "packages/effect-build-node-sea/src/internal/v04/selected.ts",
  ]);
  assert.equal(profile.nodeSeaScopedPaths.length, 11);
  assert.deepEqual(profile.nodeSeaCompanionPaths, [
    "package.json",
    "research/post-0.3/implementation/staged-node-sea-adapter.mjs",
    "test/architecture/import-boundaries.test.ts",
  ]);
  assert.equal(profile.denoImplementationFiles.length, 5);
  assert.equal(profile.bunImplementationFiles.length, 5);
  assert.equal(profile.esbuildImplementationFiles.length, 4);
  assert.equal(profile.coreStagedFiles.length, 6);
  assert.equal(profile.immutablePublicPaths.length, 12);
  assert.equal(requiredImplementationCommands.at(-1), "node research/post-0.3/implementation/certify-current-head.mjs");
  assert.equal(profile.forbiddenCurrentReceiptIds.includes(plan042Anchor.receipt.id), true);
  assert.equal(expected.claims.length, 5);
});

test("Plan 042 trust anchor rejects source, branch, artifact, certificate, receipt, and parent drift", () => {
  for (const mutate of [
    (value) => value.sourceSha = "0".repeat(40),
    (value) => value.workflow.ref = "refs/heads/main",
    (value) => value.aggregateArtifact.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.certification.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.receipt.digest = `sha256:${"0".repeat(64)}`,
    (value) => value.plan041Input.sourceSha = "0".repeat(40),
  ]) {
    const changed = clone(plan042Anchor);
    mutate(changed);
    mustReject(() => validatePlan042Anchor({ plan041Anchor, plan042Anchor: changed }), /AssertionError|Expected values/);
  }
});

const runFixture = () => ({
  id: Number(plan042Anchor.workflow.runId),
  run_attempt: Number(plan042Anchor.workflow.runAttempt),
  name: plan042Anchor.workflow.name,
  path: plan042Anchor.workflow.path,
  event: "push",
  head_branch: "codex/plan042-deno-lane",
  status: "completed",
  conclusion: "success",
  head_sha: plan042Anchor.sourceSha,
  repository: { full_name: plan042Anchor.workflow.repository },
  head_repository: { full_name: plan042Anchor.workflow.repository },
});

const artifactFixture = () => ({
  id: Number(plan042Anchor.aggregateArtifact.id),
  name: plan042Anchor.aggregateArtifact.name,
  size_in_bytes: plan042Anchor.aggregateArtifact.sizeInBytes,
  digest: plan042Anchor.aggregateArtifact.digest,
  expired: false,
  workflow_run: {
    id: Number(plan042Anchor.workflow.runId),
    head_sha: plan042Anchor.sourceSha,
    head_branch: "codex/plan042-deno-lane",
  },
});

test("Plan 042 GitHub API evidence requires the exact successful push artifact and branch", () => {
  validatePlan042Api({ artifact: artifactFixture(), plan042Anchor, run: runFixture() });
  for (const [target, key, value] of [
    [runFixture(), "event", "pull_request"],
    [runFixture(), "head_branch", "main"],
    [runFixture(), "head_sha", "0".repeat(40)],
    [artifactFixture(), "digest", `sha256:${"0".repeat(64)}`],
    [artifactFixture(), "expired", true],
  ]) {
    target[key] = value;
    mustReject(
      () => validatePlan042Api({
        artifact: "size_in_bytes" in target ? target : artifactFixture(),
        plan042Anchor,
        run: "head_sha" in target && !("size_in_bytes" in target) ? target : runFixture(),
      }),
      /AssertionError|Expected values/,
    );
  }
  mustReject(
    () => validatePlan042Archive({
      archiveBytes: Buffer.alloc(0),
      certificateBytes: Buffer.alloc(0),
      entries: [],
      plan042Anchor,
      receiptBytes: Buffer.alloc(0),
    }),
    /AssertionError|Expected values/,
  );
});

test("Plan 043 records candidate policy and verifier bytes without claiming independent protection", () => {
  const sourceSha = "c".repeat(40);
  const origin = sourcePolicyVerifierOrigin({
    sourceSha,
    documents: sourcePolicyVerifierPaths.map((path) => ({ path, digest: sha256(Buffer.from(path)) })),
  });
  assert.equal(origin.documents.some(({ path }) => path.endsWith("plan042-trust-anchor.json")), true);
  assert.equal(origin.independentlyProtected, false);
  mustReject(() => sourcePolicyVerifierOrigin({ sourceSha, documents: [...origin.documents].reverse() }), /document paths/);
  mustReject(
    () => validateSourcePolicyVerifierOrigin({ ...origin, independentlyProtected: true }),
    /source policy\/verifier origin drifted/,
  );
});

test("workspace and active instructions admit only the exact Plan 043 registrations", () => {
  const workspace = validateWorkspaceManifest({ currentManifest, handoffManifest, profile });
  assert.deepEqual(workspace.scriptAdds, profile.workspaceManifest.scriptAdds);
  const instructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  assert.deepEqual(instructions.completedPlans, ["039", "040", "041", "042", "043"]);
  assert.equal(instructions.nextPlan, "044");
  const drifted = clone(currentManifest);
  drifted.scripts.check += " && echo drift";
  mustReject(() => validateWorkspaceManifest({ currentManifest: drifted, handoffManifest, profile }), /workspace manifest/);
});

test("implementation state requires exact Node SEA additions, companions, and frozen prior lanes", async () => {
  const workflowSource = await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8");
  const planSource = await readFile(resolve(repository, "plans/043-publish-single-node-program-profile.md"), "utf8");
  const planIndexSource = await readFile(resolve(repository, "plans/README.md"), "utf8");
  const base = {
    ancestry: {
      releaseIsFreezeAncestor: true,
      freezeIsHandoffAncestor: true,
      handoffIsPlan039Ancestor: true,
      plan039IsPlan040Ancestor: true,
      plan040IsPlan041Ancestor: true,
      plan041IsPlan042Ancestor: true,
      plan042IsCurrentAncestor: true,
    },
    changedPaths: [...profile.nodeSeaScopedPaths, ...profile.nodeSeaCompanionPaths],
    coreStagedDiff: [],
    denoStagedDiff: [],
    esbuildStagedDiff: [],
    bunStagedDiff: [],
    head: "a".repeat(40),
    immutablePublicDiff: [],
    nodeSeaScopedAddedOrModifiedPaths: [...profile.nodeSeaScopedPaths],
    nodeSeaCompanionAddedOrModifiedPaths: [...profile.nodeSeaCompanionPaths],
    importBoundarySource: await readFile(resolve(repository, "test/architecture/import-boundaries.test.ts"), "utf8"),
    nodeSeaConsumerSource: await readFile(
      resolve(repository, "research/post-0.3/implementation/staged-node-sea-adapter.mjs"),
      "utf8",
    ),
    planIndexSource,
    planSource,
    profile,
    sourceSha: "a".repeat(40),
    workflowSource,
  };
  const result = validateCurrentImplementationState(base);
  assert.deepEqual(result.implementationFiles, [...profile.nodeSeaScopedPaths].sort());
  assert.deepEqual(result.nodeSeaCompanionPaths, [...profile.nodeSeaCompanionPaths].sort());
  mustReject(() => validateCurrentImplementationState({ ...base, denoStagedDiff: [profile.denoImplementationFiles[0]] }), /Plan 042 Deno/);
  mustReject(
    () => validateCurrentImplementationState({ ...base, nodeSeaCompanionAddedOrModifiedPaths: ["package.json"] }),
    /Node SEA registrations/,
  );
  mustReject(() => validateCurrentImplementationState({ ...base, immutablePublicDiff: [profile.immutablePublicPaths[0]] }), /released 0.3/);
  mustReject(() => validateCurrentImplementationState({ ...base, changedPaths: ["outside.txt"] }), /outside implementation scope/);
});

test("remote evidence binds Plan 043 checkout, event, and fresh remote head", () => {
  const sourceSha = "b".repeat(40);
  const evidence = {
    eventName: "push",
    eventSourceSha: sourceSha,
    observedRef: plan043CertificationRef,
    observedSha: sourceSha,
    repository: "mannyc2/effect-build",
    ref: plan043CertificationRef,
    refType: "branch",
    sourceSha,
  };
  assert.equal(validateCurrentRemoteEvidence(evidence).observedSha, sourceSha);
  mustReject(() => validateCurrentRemoteEvidence({ ...evidence, observedSha: "c".repeat(40) }), /Expected values/);
  mustReject(() => validateCurrentRemoteEvidence({ ...evidence, refType: "tag" }), /Expected values/);
});

test("receipt and certificate contain Plan 042 only as a historical input", () => {
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
    plan042Anchor,
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
      plan042Artifact: { sourceSha: plan042Anchor.sourceSha, transport: "github-api" },
      currentHead: { observedSha: sourceSha, repository: plan042Anchor.workflow.repository },
      sourcePolicyVerifierOrigin: policyVerifierOrigin,
      repositoryScope: {
        planStatus: "DONE",
        implementationFiles: [...profile.nodeSeaScopedPaths].sort(),
        nodeSeaCompanionPaths: [...profile.nodeSeaCompanionPaths].sort(),
        coreStagedDiff: [],
        esbuildStagedDiff: [],
        bunStagedDiff: [],
        denoStagedDiff: [],
        immutablePublicDiff: [],
        requiredCommands: requiredImplementationCommands,
        workflowDigest: "sha256:c446f5f2f3156982a6deda6adf24939d73a8c703ecbac9ccb65982d03933d91a",
        activeInstructions: {
          handoffSha: profile.productionBaseline.handoffSha,
          path: "AGENTS.md",
          completedPlans: ["039", "040", "041", "042", "043"],
          nextPlan: "044",
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
    plan042Anchor,
    profile,
    receipt,
    sourceSha,
  });
  const digest = sha256(Buffer.from(JSON.stringify(receipt)));
  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: profile.profileId,
    plan: "043",
    phase: "implementation",
    sourceSha,
    workflow: {
      repository: plan042Anchor.workflow.repository,
      workflow: "plan-043-implementation-certification",
      runId: "1",
      runAttempt: "1",
      eventName: "push",
      ref: plan043CertificationRef,
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
    plan042Anchor,
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
    plan042Anchor,
    profile,
    receipt: { ...receipt, id: plan042Anchor.receipt.id },
    sourceSha,
  }), /Expected values/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedReceiptClaims,
  historicalAuthoritySummary,
  historicalFreezeSummary,
  loadProfileDocuments,
  requiredImplementationCommands,
  sha256,
  validateActiveInstructions,
  validateCoreMigrationPlan,
  validateCurrentImplementationState,
  validateCurrentReceipt,
  validateCurrentRemoteEvidence,
  validateImplementationCertificate,
  validatePlan039Api,
  validatePlan039Archive,
  validateProfileDocuments,
  validateWorkspaceManifest,
} from "./certification-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const documents = await loadProfileDocuments(repository);
const handoffWorkspaceManifest = JSON.parse(execFileSync(
  "git",
  ["show", `${documents.profile.productionBaseline.handoffSha}:${documents.profile.workspaceManifest.path}`],
  { cwd: repository, encoding: "utf8" },
));
const currentWorkspaceManifest = JSON.parse(
  await readFile(resolve(repository, documents.profile.workspaceManifest.path), "utf8"),
);
const handoffInstructions = execFileSync(
  "git",
  ["show", `${documents.profile.productionBaseline.handoffSha}:AGENTS.md`],
  { cwd: repository, encoding: "utf8" },
);
const currentInstructions = await readFile(resolve(repository, "AGENTS.md"), "utf8");

const handoffLegacySourceFiles = execFileSync(
  "git",
  [
    "ls-tree",
    "-r",
    "--name-only",
    documents.profile.productionBaseline.handoffSha,
    "--",
    "packages/effect-build/src",
  ],
  { cwd: repository, encoding: "utf8" },
).split(/\r?\n/).filter((path) => path.length > 0 && path !== "packages/effect-build/src/index.ts").sort();

const plan039ApiFixture = () => ({
  run: {
    id: Number(documents.plan039Anchor.workflow.runId),
    run_attempt: Number(documents.plan039Anchor.workflow.runAttempt),
    name: documents.plan039Anchor.workflow.name,
    path: documents.plan039Anchor.workflow.path,
    event: documents.plan039Anchor.workflow.eventName,
    status: "completed",
    conclusion: documents.plan039Anchor.workflow.conclusion,
    head_sha: documents.plan039Anchor.sourceSha,
    repository: { full_name: documents.plan039Anchor.workflow.repository },
  },
  artifact: {
    id: Number(documents.plan039Anchor.aggregateArtifact.id),
    name: documents.plan039Anchor.aggregateArtifact.name,
    size_in_bytes: documents.plan039Anchor.aggregateArtifact.sizeInBytes,
    digest: documents.plan039Anchor.aggregateArtifact.digest,
    expired: false,
    workflow_run: {
      id: Number(documents.plan039Anchor.workflow.runId),
      head_sha: documents.plan039Anchor.sourceSha,
    },
  },
});

const plan039ArchiveFixture = () => {
  const freezeAnchor = structuredClone(documents.freezeAnchor);
  const handoffAnchor = structuredClone(documents.handoffAnchor);
  const plan039Anchor = structuredClone(documents.plan039Anchor);
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: plan039Anchor.profileId,
    id: plan039Anchor.receipt.id,
    sourceSha: plan039Anchor.sourceSha,
    status: "reproduced",
    claims: Array.from({ length: plan039Anchor.certification.claims }, (_, index) => ({
      id: `plan039-fixture-${index}`,
      classification: "established",
      conclusion: "fixture",
      assertions: [{ name: "fixture", passed: true }],
    })),
    evidence: {
      historicalAuthority: {
        freeze: {
          profileId: freezeAnchor.profileId,
          sourceSha: freezeAnchor.sourceSha,
        },
        handoff: {
          profileId: handoffAnchor.profileId,
          sourceSha: handoffAnchor.sourceSha,
        },
      },
      currentHead: {
        observedSha: plan039Anchor.sourceSha,
        repository: plan039Anchor.workflow.repository,
      },
      profileSeparation: {
        currentProfileId: plan039Anchor.profileId,
        currentReceiptIds: [plan039Anchor.receipt.id],
      },
    },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  plan039Anchor.receipt.digest = sha256(receiptBytes);
  const certificate = {
    schema: plan039Anchor.certification.schema,
    profileId: plan039Anchor.profileId,
    plan: "039",
    phase: plan039Anchor.certification.phase,
    sourceSha: plan039Anchor.sourceSha,
    workflow: {
      repository: plan039Anchor.workflow.repository,
      workflow: plan039Anchor.workflow.name,
      runId: plan039Anchor.workflow.runId,
      runAttempt: plan039Anchor.workflow.runAttempt,
      eventName: plan039Anchor.workflow.eventName,
    },
    historicalInputs: {
      freeze: {
        profileId: freezeAnchor.profileId,
        sourceSha: freezeAnchor.sourceSha,
        aggregateArtifact: {
          id: freezeAnchor.aggregateArtifact.id,
          digest: freezeAnchor.aggregateArtifact.digest,
        },
        certification: { digest: freezeAnchor.certification.digest },
        receiptCount: freezeAnchor.receipts.length,
      },
      handoff: {
        profileId: handoffAnchor.profileId,
        sourceSha: handoffAnchor.sourceSha,
        workflow: {
          runId: handoffAnchor.workflow.runId,
          runAttempt: handoffAnchor.workflow.runAttempt,
          conclusion: handoffAnchor.workflow.conclusion,
        },
        aggregateArtifact: {
          id: handoffAnchor.aggregateArtifact.id,
          digest: handoffAnchor.aggregateArtifact.digest,
        },
        certification: {
          file: handoffAnchor.certification.file,
          digest: handoffAnchor.certification.digest,
        },
        receipt: handoffAnchor.receipt,
      },
    },
    currentReceipts: [plan039Anchor.receipt],
    claims: plan039Anchor.certification.claims,
    result: plan039Anchor.certification.result,
  };
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  plan039Anchor.certification.digest = sha256(certificateBytes);
  const archiveBytes = Buffer.from("deterministic synthetic plan039 artifact archive");
  plan039Anchor.aggregateArtifact.sizeInBytes = archiveBytes.byteLength;
  plan039Anchor.aggregateArtifact.digest = sha256(archiveBytes);
  return {
    archiveBytes,
    certificateBytes,
    entries: [plan039Anchor.certification.file, plan039Anchor.receipt.file],
    freezeAnchor,
    handoffAnchor,
    plan039Anchor,
    receiptBytes,
  };
};

const implementationStateFixture = async () => {
  const plan = await readFile(resolve(repository, "plans/040-expose-esbuild-api-lane.md"), "utf8");
  const index = await readFile(resolve(repository, "plans/README.md"), "utf8");
  return {
    changedPaths: [
      ...documents.profile.implementationFiles,
      ".github/workflows/architecture-research.yml",
      "plans/040-expose-esbuild-api-lane.md",
      "plans/README.md",
      "research/post-0.3/implementation/certification-contract.mjs",
    ],
    coreStagedDiff: [],
    freezeIsHandoffAncestor: true,
    handoffIsPlan039Ancestor: true,
    head: "b".repeat(40),
    immutablePublicDiff: [],
    implementationAddedOrModifiedPaths: [...documents.profile.implementationFiles],
    plan039IsCurrentAncestor: true,
    planIndexSource: index,
    planSource: plan.replace(/^- Status: (?:IN PROGRESS|DONE)$/m, "- Status: DONE"),
    profile: documents.profile,
    releaseIsFreezeAncestor: true,
    sourceSha: "b".repeat(40),
    workflowSource: await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8"),
  };
};

test("the profile pins the exact freeze, handoff, and certified Plan 039 authority", () => {
  assert.equal(documents.freezeAnchor.sourceSha, "a3017657e0851530892a9f3d2d55ac5736769881");
  assert.equal(documents.freezeAnchor.workflow.runId, "32502909677");
  assert.equal(documents.freezeAnchor.aggregateArtifact.id, "9454270941");
  assert.equal(documents.freezeAnchor.receipts.length, 20);
  assert.equal(documents.handoffAnchor.sourceSha, "7de4ffe68931f721317f6be92aac1e01dae6e21e");
  assert.equal(documents.handoffAnchor.workflow.runId, "32505419081");
  assert.equal(documents.plan039Anchor.sourceSha, "e12e930de5622be3f23814f3235293c93fcfd8bf");
  assert.deepEqual(documents.plan039Anchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-039-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32514192057",
    runAttempt: "1",
    eventName: "push",
    conclusion: "success",
  });
  assert.deepEqual(documents.plan039Anchor.aggregateArtifact, {
    id: "9458198780",
    name: "plan039-implementation-certification-e12e930de5622be3f23814f3235293c93fcfd8bf",
    sizeInBytes: 4021,
    digest: "sha256:d8398357cebab738a693e55944f0e60a311f6509e65ce3585d524e5227943a5b",
  });
});

test("profile loading follows only the five explicit implementation documents", async () => {
  const temporaryRepository = await mkdtemp(join(tmpdir(), "effect-build-plan040-profile-"));
  const implementation = resolve(temporaryRepository, "research/post-0.3/implementation");
  const freeze = resolve(temporaryRepository, "research/post-0.3/freeze");
  try {
    await mkdir(implementation, { recursive: true });
    await mkdir(freeze, { recursive: true });
    await writeFile(resolve(implementation, "profile.json"), `${JSON.stringify(documents.profile, null, 2)}\n`);
    await writeFile(
      resolve(implementation, "freeze-trust-anchor.json"),
      `${JSON.stringify(documents.freezeAnchor, null, 2)}\n`,
    );
    await writeFile(
      resolve(implementation, "handoff-trust-anchor.json"),
      `${JSON.stringify(documents.handoffAnchor, null, 2)}\n`,
    );
    await writeFile(
      resolve(implementation, "plan039-trust-anchor.json"),
      `${JSON.stringify(documents.plan039Anchor, null, 2)}\n`,
    );
    await writeFile(resolve(implementation, "expected-claims.json"), `${JSON.stringify(documents.expected, null, 2)}\n`);
    await writeFile(
      resolve(implementation, "core-migration-plan.json"),
      `${JSON.stringify(documents.migrationPlan, null, 2)}\n`,
    );
    await writeFile(resolve(freeze, "MIGRATION.json"), `${JSON.stringify(documents.migrationAuthority, null, 2)}\n`);
    await writeFile(resolve(implementation, "expected-rogue-conclusions.json"), "{ definitely not valid JSON");
    await assert.doesNotReject(() => loadProfileDocuments(temporaryRepository));
  } finally {
    await rm(temporaryRepository, { recursive: true, force: true });
  }
});

test("profile ids, producer sets, and document coordinates fail closed", () => {
  const wrongPhase = structuredClone(documents);
  wrongPhase.profile.phase = "workflow-handoff";
  assert.throws(() => validateProfileDocuments(wrongPhase), /phase/);

  const wildcard = structuredClone(documents);
  wildcard.profile.expectedClaims = "research/post-0.3/implementation/expected-*.json";
  assert.throws(() => validateProfileDocuments(wildcard), /explicit repository paths/);

  const autoProducer = structuredClone(documents);
  autoProducer.profile.producers.push(structuredClone(autoProducer.profile.producers[0]));
  assert.throws(() => validateProfileDocuments(autoProducer), /one producer/);

  const historicalReceipt = structuredClone(documents);
  historicalReceipt.profile.currentReceiptIds = ["plan039-implementation"];
  assert.throws(() => validateProfileDocuments(historicalReceipt), /current receipt set/);

  const foreignPlan039 = structuredClone(documents);
  foreignPlan039.plan039Anchor.sourceSha = "c".repeat(40);
  assert.throws(() => validateProfileDocuments(foreignPlan039), /plan039 source SHA/);

  const counterfeitPlan039 = structuredClone(documents);
  counterfeitPlan039.plan039Anchor.aggregateArtifact.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateProfileDocuments(counterfeitPlan039), /plan039 artifact digest drifted/);

  const foreignManifest = structuredClone(documents);
  foreignManifest.profile.workspaceManifest.path = "packages/effect-build/package.json";
  assert.throws(() => validateProfileDocuments(foreignManifest), /workspace manifest coordinates/);

  const widenedScope = structuredClone(documents);
  widenedScope.profile.implementationAllowedPaths.push("packages/");
  assert.throws(() => validateProfileDocuments(widenedScope), /allowed-path set drifted/);

  const weakenedImmutableScope = structuredClone(documents);
  weakenedImmutableScope.profile.immutablePublicPaths.pop();
  assert.throws(() => validateProfileDocuments(weakenedImmutableScope), /immutable public-path set drifted/);

  const touchedCoreModule = structuredClone(documents);
  touchedCoreModule.profile.coreStagedFiles.pop();
  assert.throws(() => validateProfileDocuments(touchedCoreModule), /core staged files drifted/);

  const inventedClaim = structuredClone(documents);
  inventedClaim.expected.claims[0].conclusion = "anything-can-pass";
  assert.throws(() => validateProfileDocuments(inventedClaim), /expected implementation claims drifted/);

  const inventedAuthority = structuredClone(documents);
  inventedAuthority.profile.publicationAuthority = "GRANTED";
  assert.throws(() => validateProfileDocuments(inventedAuthority), /unknown authority fields/);
});

test("the root manifest equals the handoff except for exact v0.4 test registrations", () => {
  const input = {
    currentManifest: currentWorkspaceManifest,
    handoffManifest: handoffWorkspaceManifest,
    profile: documents.profile,
  };
  assert.deepEqual(validateWorkspaceManifest(input), {
    handoffSha: documents.profile.productionBaseline.handoffSha,
    path: "package.json",
    scriptAppends: documents.profile.workspaceManifest.scriptAppends,
  });

  const versionDrift = structuredClone(input);
  versionDrift.currentManifest.version = "0.4.0";
  assert.throws(() => validateWorkspaceManifest(versionDrift), /differs from the handoff/);

  const extraScript = structuredClone(input);
  extraScript.currentManifest.scripts.release = "bun run publish";
  assert.throws(() => validateWorkspaceManifest(extraScript), /differs from the handoff/);

  const missingRegistration = structuredClone(input);
  missingRegistration.currentManifest.scripts["test:unit"] = handoffWorkspaceManifest.scripts["test:unit"];
  assert.throws(() => validateWorkspaceManifest(missingRegistration), /differs from the handoff/);
});

test("active instructions differ from the handoff only by the Plan 040 completion marker", () => {
  assert.deepEqual(validateActiveInstructions({ currentInstructions, handoffInstructions }), {
    handoffSha: documents.profile.productionBaseline.handoffSha,
    path: "AGENTS.md",
    plan039: "DONE",
    plan040: "DONE",
    nextPlan: "041",
    publicationAuthority: "NONE",
  });

  assert.throws(
    () => validateActiveInstructions({
      currentInstructions: `${currentInstructions}\nextra authority\n`,
      handoffInstructions,
    }),
    /beyond the exact Plan 040 completion update/,
  );
});

test("the migration plan resolves exactly the frozen 71-authority core cut", () => {
  const input = {
    handoffLegacySourceFiles,
    migrationAuthority: documents.migrationAuthority,
    migrationPlan: documents.migrationPlan,
  };
  const result = validateCoreMigrationPlan(input);
  assert.equal(result.ruleIds.length, 11);
  assert.equal(result.authorityCount, 71);
  assert.equal(result.authoritySetSha256, "a0bdf3b59a1a85bbc448decd0186e29c0fabe7c04e3203ff6657af5f746bb3fe");
  assert.deepEqual(result.legacySourceFiles, handoffLegacySourceFiles);

  const missingRule = structuredClone(input);
  missingRule.migrationPlan.rules.pop();
  assert.throws(() => validateCoreMigrationPlan(missingRule), /11 rules/);

  const compatibilityDelegate = structuredClone(input);
  compatibilityDelegate.migrationPlan.stagingRules.compatibilityDelegates = "allowed";
  assert.throws(() => validateCoreMigrationPlan(compatibilityDelegate), /compatibility or second public path/);

  const inventedMigrationAuthority = structuredClone(input);
  inventedMigrationAuthority.migrationPlan.publicationAuthority = "GRANTED";
  assert.throws(() => validateCoreMigrationPlan(inventedMigrationAuthority), /unknown authority fields/);
});

test("green Plan 039 run and artifact metadata authenticate exactly", () => {
  const input = plan039ApiFixture();
  assert.doesNotThrow(() => validatePlan039Api({ plan039Anchor: documents.plan039Anchor, ...input }));

  const wrongAttempt = plan039ApiFixture();
  wrongAttempt.run.run_attempt = 2;
  assert.throws(() => validatePlan039Api({ plan039Anchor: documents.plan039Anchor, ...wrongAttempt }), /attempt drifted/);

  const wrongArtifact = plan039ApiFixture();
  wrongArtifact.artifact.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validatePlan039Api({ plan039Anchor: documents.plan039Anchor, ...wrongArtifact }), /digest drifted/);

  const expired = plan039ApiFixture();
  expired.artifact.expired = true;
  assert.throws(() => validatePlan039Api({ plan039Anchor: documents.plan039Anchor, ...expired }), /expired/);
});

test("plan039 artifact, certificate, receipt, and anchor bindings authenticate together", () => {
  const input = plan039ArchiveFixture();
  assert.doesNotThrow(() => validatePlan039Archive(input));

  const changedReceipt = plan039ArchiveFixture();
  changedReceipt.receiptBytes = Buffer.from("changed");
  assert.throws(() => validatePlan039Archive(changedReceipt), /receipt bytes changed/);

  const mixedArtifact = plan039ArchiveFixture();
  mixedArtifact.entries.push("surface-freeze.json");
  assert.throws(() => validatePlan039Archive(mixedArtifact), /entry set drifted/);

  const changedCertificate = plan039ArchiveFixture();
  changedCertificate.certificateBytes = Buffer.from("{}\n");
  assert.throws(() => validatePlan039Archive(changedCertificate), /certification bytes changed/);

  const foreignFreeze = plan039ArchiveFixture();
  foreignFreeze.freezeAnchor.sourceSha = "d".repeat(40);
  assert.throws(() => validatePlan039Archive(foreignFreeze), /exact freeze anchor/);
});

test("the implementation boundary is linear, four-file exact, core-frozen, immutable, and DONE", async () => {
  const input = await implementationStateFixture();
  assert.doesNotThrow(() => validateCurrentImplementationState(input));

  const disallowed = structuredClone(input);
  disallowed.changedPaths.push("packages/effect-build/src/index.ts");
  assert.throws(() => validateCurrentImplementationState(disallowed), /disallowed path/);

  const missingImplementation = structuredClone(input);
  missingImplementation.implementationAddedOrModifiedPaths.pop();
  assert.throws(() => validateCurrentImplementationState(missingImplementation), /four esbuild implementation files/);

  const touchedCore = structuredClone(input);
  touchedCore.coreStagedDiff.push("packages/effect-build/src/Artifact.ts");
  assert.throws(() => validateCurrentImplementationState(touchedCore), /frozen Plan 039 core module changed/);

  const publicDrift = structuredClone(input);
  publicDrift.immutablePublicDiff.push("packages/effect-build/package.json");
  assert.throws(() => validateCurrentImplementationState(publicDrift), /immutable public path/);

  const brokenAncestry = structuredClone(input);
  brokenAncestry.plan039IsCurrentAncestor = false;
  assert.throws(() => validateCurrentImplementationState(brokenAncestry), /Plan 039 head is not an ancestor/);

  const unfinished = structuredClone(input);
  unfinished.planSource = unfinished.planSource.replace("- Status: DONE", "- Status: IN PROGRESS");
  assert.throws(() => validateCurrentImplementationState(unfinished), /status is absent|metadata block/);

  const contradictory = structuredClone(input);
  contradictory.planSource += "\n- Status: CANCELLED\n";
  assert.throws(() => validateCurrentImplementationState(contradictory), /contradictory/);

  const contradictoryIndexSummary = structuredClone(input);
  contradictoryIndexSummary.planIndexSource = contradictoryIndexSummary.planIndexSource.replace(
    "Plans 039 and 040 are complete at their export-inert stages",
    "Plan 040 is IN PROGRESS and is not complete",
  );
  assert.throws(() => validateCurrentImplementationState(contradictoryIndexSummary), /index summary drifted/);

  const oldFreezeInvocation = structuredClone(input);
  oldFreezeInvocation.workflowSource += "\nresearch/post-0.3/freeze/validate-freeze.mjs\n";
  assert.throws(() => validateCurrentImplementationState(oldFreezeInvocation), /workflow bytes drifted/);

  const lateLaw = structuredClone(input);
  lateLaw.workflowSource = lateLaw.workflowSource.replace(
    requiredImplementationCommands[3],
    `${requiredImplementationCommands.at(-1)}\n${requiredImplementationCommands[3]}`,
  );
  assert.throws(() => validateCurrentImplementationState(lateLaw), /workflow bytes drifted/);

  const bypassedLaw = structuredClone(input);
  bypassedLaw.workflowSource = bypassedLaw.workflowSource.replace(
    "      - name: Reproduce the R7 matrix laws",
    "      - name: Reproduce the R7 matrix laws\n        if: ${{ false }}",
  );
  assert.throws(() => validateCurrentImplementationState(bypassedLaw), /workflow bytes drifted/);

  const extraStep = structuredClone(input);
  extraStep.workflowSource = extraStep.workflowSource.replace(
    "      - name: Upload successful Plan 040 implementation certificate",
    "      - run: echo mutate-certificate\n      - name: Upload successful Plan 040 implementation certificate",
  );
  assert.throws(() => validateCurrentImplementationState(extraStep), /workflow bytes drifted/);
});

test("current remote evidence fails closed on event or observed-head drift", () => {
  const sourceSha = "b".repeat(40);
  const input = {
    eventName: "push",
    eventSourceSha: sourceSha,
    observedRef: "refs/heads/plan040",
    observedSha: sourceSha,
    repository: "mannyc2/effect-build",
    sourceSha,
  };
  assert.doesNotThrow(() => validateCurrentRemoteEvidence(input));

  const staleRemote = { ...input, observedSha: "c".repeat(40) };
  assert.throws(() => validateCurrentRemoteEvidence(staleRemote), /fresh remote head/);

  const foreignRepository = { ...input, repository: "someone/fork" };
  assert.throws(() => validateCurrentRemoteEvidence(foreignRepository), /another repository/);

  const localEvent = { ...input, eventName: "local" };
  assert.throws(() => validateCurrentRemoteEvidence(localEvent), /unsupported certification event/);
});

test("current receipt and certificate exclude plan039, handoff, and freeze receipts", async () => {
  const sourceSha = "b".repeat(40);
  const repositoryScope = validateCurrentImplementationState(await implementationStateFixture());
  const coreMigration = validateCoreMigrationPlan({
    handoffLegacySourceFiles,
    migrationAuthority: documents.migrationAuthority,
    migrationPlan: documents.migrationPlan,
  });
  const workspaceManifest = validateWorkspaceManifest({
    currentManifest: currentWorkspaceManifest,
    handoffManifest: handoffWorkspaceManifest,
    profile: documents.profile,
  });
  const activeInstructions = validateActiveInstructions({ currentInstructions, handoffInstructions });
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: documents.profile.profileId,
    id: documents.expected.receiptId,
    sourceSha,
    status: "reproduced",
    claims: expectedReceiptClaims(documents.expected),
    evidence: {
      historicalAuthority: historicalAuthoritySummary(documents),
      currentHead: { observedSha: sourceSha },
      repositoryScope: { ...repositoryScope, activeInstructions, coreMigration, workspaceManifest },
      profileSeparation: {
        currentProfileId: documents.profile.profileId,
        currentReceiptDirectoryEnvironment: documents.profile.receiptDirectoryEnvironment,
        currentReceiptIds: documents.profile.currentReceiptIds,
        historicalArtifactsAreInputsOnly: true,
      },
    },
  };
  assert.doesNotThrow(() => validateCurrentReceipt({
    expected: documents.expected,
    freezeAnchor: documents.freezeAnchor,
    handoffAnchor: documents.handoffAnchor,
    plan039Anchor: documents.plan039Anchor,
    profile: documents.profile,
    receipt,
    sourceSha,
  }));

  const plan039Receipt = structuredClone(receipt);
  plan039Receipt.id = "plan039-implementation";
  assert.throws(() => validateCurrentReceipt({
    expected: documents.expected,
    freezeAnchor: documents.freezeAnchor,
    handoffAnchor: documents.handoffAnchor,
    plan039Anchor: documents.plan039Anchor,
    profile: documents.profile,
    receipt: plan039Receipt,
    sourceSha,
  }), /current receipt id/);

  const digest = sha256(Buffer.from(JSON.stringify(receipt)));
  const certificate = {
    schema: "effect-build/implementation-certification@1",
    profileId: documents.profile.profileId,
    plan: documents.profile.plan,
    phase: documents.profile.phase,
    sourceSha,
    workflow: {
      repository: "mannyc2/effect-build",
      workflow: "plan-040-implementation-certification",
      runId: "123456789",
      runAttempt: "1",
      eventName: "push",
    },
    historicalInputs: historicalAuthoritySummary(documents),
    currentReceipts: [{ id: receipt.id, file: `${receipt.id}.json`, digest }],
    claims: documents.expected.claims.length,
    result: "certified",
  };
  assert.doesNotThrow(() => validateImplementationCertificate({
    certificate,
    currentReceiptDigest: digest,
    expected: documents.expected,
    freezeAnchor: documents.freezeAnchor,
    handoffAnchor: documents.handoffAnchor,
    plan039Anchor: documents.plan039Anchor,
    profile: documents.profile,
    sourceSha,
  }));

  const localCertificate = structuredClone(certificate);
  localCertificate.workflow = {
    repository: "mannyc2/effect-build",
    workflow: "local",
    runId: "local",
    runAttempt: "local",
    eventName: "local",
  };
  assert.throws(
    () => validateImplementationCertificate({
      certificate: localCertificate,
      currentReceiptDigest: digest,
      expected: documents.expected,
      freezeAnchor: documents.freezeAnchor,
      handoffAnchor: documents.handoffAnchor,
      plan039Anchor: documents.plan039Anchor,
      profile: documents.profile,
      sourceSha,
    }),
    /certificate workflow drifted|run id is invalid|GitHub gate event/,
  );

  certificate.currentReceipts = [{ id: "plan039-implementation", file: "plan039-implementation.json", digest }];
  assert.throws(
    () => validateImplementationCertificate({
      certificate,
      currentReceiptDigest: digest,
      expected: documents.expected,
      freezeAnchor: documents.freezeAnchor,
      handoffAnchor: documents.handoffAnchor,
      plan039Anchor: documents.plan039Anchor,
      profile: documents.profile,
      sourceSha,
    }),
    /Expected values|historical receipt/,
  );
});

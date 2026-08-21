import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  expectedReceiptClaims,
  freezeReceiptSetDigest,
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
  validateHandoffApi,
  validateHandoffArchive,
  validateImplementationCertificate,
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

const handoffApiFixture = () => ({
  run: {
    id: Number(documents.handoffAnchor.workflow.runId),
    run_attempt: Number(documents.handoffAnchor.workflow.runAttempt),
    name: documents.handoffAnchor.workflow.name,
    path: documents.handoffAnchor.workflow.path,
    event: documents.handoffAnchor.workflow.eventName,
    status: "completed",
    conclusion: documents.handoffAnchor.workflow.conclusion,
    head_sha: documents.handoffAnchor.sourceSha,
    repository: { full_name: documents.handoffAnchor.workflow.repository },
  },
  artifact: {
    id: Number(documents.handoffAnchor.aggregateArtifact.id),
    name: documents.handoffAnchor.aggregateArtifact.name,
    size_in_bytes: documents.handoffAnchor.aggregateArtifact.sizeInBytes,
    digest: documents.handoffAnchor.aggregateArtifact.digest,
    expired: false,
    workflow_run: {
      id: Number(documents.handoffAnchor.workflow.runId),
      head_sha: documents.handoffAnchor.sourceSha,
    },
  },
});

const handoffArchiveFixture = () => {
  const freezeAnchor = structuredClone(documents.freezeAnchor);
  const handoffAnchor = structuredClone(documents.handoffAnchor);
  const receipt = {
    schema: "effect-build/implementation-receipt@1",
    profileId: handoffAnchor.profileId,
    id: handoffAnchor.receipt.id,
    sourceSha: handoffAnchor.sourceSha,
    status: "reproduced",
    claims: Array.from({ length: handoffAnchor.certification.claims }, (_, index) => ({
      id: `handoff-fixture-${index}`,
      classification: "established",
      conclusion: "fixture",
      assertions: [{ name: "fixture", passed: true }],
    })),
    evidence: {
      historicalFreeze: {
        profileId: freezeAnchor.profileId,
        sourceSha: freezeAnchor.sourceSha,
        receiptCount: freezeAnchor.receipts.length,
        receiptSetDigest: freezeReceiptSetDigest(freezeAnchor),
      },
      currentHead: {
        observedSha: handoffAnchor.sourceSha,
        repository: handoffAnchor.workflow.repository,
      },
      profileSeparation: {
        currentProfileId: handoffAnchor.profileId,
        currentReceiptIds: [handoffAnchor.receipt.id],
      },
    },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  handoffAnchor.receipt.digest = sha256(receiptBytes);
  const certificate = {
    schema: handoffAnchor.certification.schema,
    profileId: handoffAnchor.profileId,
    plan: "039",
    phase: handoffAnchor.certification.phase,
    sourceSha: handoffAnchor.sourceSha,
    workflow: {
      repository: handoffAnchor.workflow.repository,
      workflow: handoffAnchor.workflow.name,
      runId: handoffAnchor.workflow.runId,
      runAttempt: handoffAnchor.workflow.runAttempt,
      eventName: handoffAnchor.workflow.eventName,
    },
    historicalInputs: { freeze: historicalFreezeSummary(freezeAnchor) },
    currentReceipts: [handoffAnchor.receipt],
    claims: handoffAnchor.certification.claims,
    result: handoffAnchor.certification.result,
  };
  const certificateBytes = Buffer.from(`${JSON.stringify(certificate, null, 2)}\n`);
  handoffAnchor.certification.digest = sha256(certificateBytes);
  const archiveBytes = Buffer.from("deterministic synthetic handoff artifact archive");
  handoffAnchor.aggregateArtifact.sizeInBytes = archiveBytes.byteLength;
  handoffAnchor.aggregateArtifact.digest = sha256(archiveBytes);
  return {
    archiveBytes,
    certificateBytes,
    entries: [handoffAnchor.certification.file, handoffAnchor.receipt.file],
    freezeAnchor,
    handoffAnchor,
    receiptBytes,
  };
};

const implementationStateFixture = async () => {
  const plan = await readFile(resolve(repository, "plans/039-establish-core-capability-boundaries.md"), "utf8");
  const index = await readFile(resolve(repository, "plans/README.md"), "utf8");
  return {
    changedPaths: [
      ...documents.profile.implementationFiles,
      ".github/workflows/architecture-research.yml",
      "plans/039-establish-core-capability-boundaries.md",
      "plans/README.md",
      "research/post-0.3/implementation/certification-contract.mjs",
    ],
    freezeIsHandoffAncestor: true,
    handoffIsCurrentAncestor: true,
    head: "b".repeat(40),
    immutablePublicDiff: [],
    implementationAddedOrModifiedPaths: [...documents.profile.implementationFiles],
    planIndexSource: index.replace(
      /\| 039 \| Implement the frozen core capability laws \| P0 \| XL \| exact 0\.4 surface freeze \| (?:IN PROGRESS|DONE) \|/,
      "| 039 | Implement the frozen core capability laws | P0 | XL | exact 0.4 surface freeze | DONE |",
    ),
    planSource: plan.replace(/^- Status: (?:IN PROGRESS|DONE)$/m, "- Status: DONE"),
    profile: documents.profile,
    releaseIsFreezeAncestor: true,
    sourceSha: "b".repeat(40),
    workflowSource: await readFile(resolve(repository, ".github/workflows/architecture-research.yml"), "utf8"),
  };
};

test("the profile pins the exact freeze and green handoff authority", () => {
  assert.equal(documents.freezeAnchor.sourceSha, "a3017657e0851530892a9f3d2d55ac5736769881");
  assert.equal(documents.freezeAnchor.workflow.runId, "32502909677");
  assert.equal(documents.freezeAnchor.aggregateArtifact.id, "9454270941");
  assert.equal(documents.freezeAnchor.receipts.length, 20);
  assert.equal(documents.handoffAnchor.sourceSha, "7de4ffe68931f721317f6be92aac1e01dae6e21e");
  assert.deepEqual(documents.handoffAnchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-039-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32505419081",
    runAttempt: "1",
    eventName: "push",
    conclusion: "success",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32505419081",
  });
  assert.deepEqual(documents.handoffAnchor.aggregateArtifact, {
    id: "9455113555",
    name: "plan039-implementation-certification-7de4ffe68931f721317f6be92aac1e01dae6e21e",
    sizeInBytes: 3896,
    digest: "sha256:5234a76e040291df7d1dbdd2037f51319736cde5ababbeda66f7fd00ff110504",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32505419081/artifacts/9455113555",
  });
  assert.equal(
    documents.handoffAnchor.certification.digest,
    "sha256:77eacc05831d0362b33def11c9ded232a2baa2c14056809b7b751afb343dff56",
  );
  assert.equal(
    documents.handoffAnchor.receipt.digest,
    "sha256:7963f1bbd1a5d015fcb9b963936e7ae153c0d2c07d08a0551b2d2313989d7995",
  );
});

test("profile loading follows only the four explicit implementation documents", async () => {
  const temporaryRepository = await mkdtemp(join(tmpdir(), "effect-build-plan039-profile-"));
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
  historicalReceipt.profile.currentReceiptIds = ["plan039-phase-handoff"];
  assert.throws(() => validateProfileDocuments(historicalReceipt), /current receipt set/);

  const foreignHandoff = structuredClone(documents);
  foreignHandoff.handoffAnchor.sourceSha = "c".repeat(40);
  assert.throws(() => validateProfileDocuments(foreignHandoff), /handoff source SHA/);

  const counterfeitHandoff = structuredClone(documents);
  counterfeitHandoff.handoffAnchor.aggregateArtifact.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateProfileDocuments(counterfeitHandoff), /handoff artifact digest drifted/);

  const foreignManifest = structuredClone(documents);
  foreignManifest.profile.workspaceManifest.path = "packages/effect-build/package.json";
  assert.throws(() => validateProfileDocuments(foreignManifest), /workspace manifest coordinates/);

  const widenedScope = structuredClone(documents);
  widenedScope.profile.implementationAllowedPaths.push("packages/");
  assert.throws(() => validateProfileDocuments(widenedScope), /allowed-path set drifted/);

  const weakenedImmutableScope = structuredClone(documents);
  weakenedImmutableScope.profile.immutablePublicPaths.pop();
  assert.throws(() => validateProfileDocuments(weakenedImmutableScope), /immutable public-path set drifted/);

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

test("active instructions differ from the handoff only by the Plan 039 completion marker", () => {
  assert.deepEqual(validateActiveInstructions({ currentInstructions, handoffInstructions }), {
    handoffSha: documents.profile.productionBaseline.handoffSha,
    path: "AGENTS.md",
    plan039: "DONE",
    nextPlan: "040",
    publicationAuthority: "NONE",
  });

  assert.throws(
    () => validateActiveInstructions({
      currentInstructions: `${currentInstructions}\nextra authority\n`,
      handoffInstructions,
    }),
    /beyond the exact Plan 039 completion update/,
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

  const changedIdentity = structuredClone(input);
  const group = changedIdentity.migrationAuthority.mappingGroups.find((value) =>
    value.rule === changedIdentity.migrationPlan.rules[0].rule
  );
  group.identities[0] += "-drift";
  assert.throws(() => validateCoreMigrationPlan(changedIdentity), /digest drifted/);

  const changedDisposition = structuredClone(input);
  changedDisposition.migrationPlan.rules[0].disposition = "replace";
  assert.throws(() => validateCoreMigrationPlan(changedDisposition), /disposition drifted/);

  const removalTarget = structuredClone(input);
  removalTarget.migrationPlan.rules[0].target = {};
  assert.throws(() => validateCoreMigrationPlan(removalTarget), /has a target/);

  const replacementTarget = structuredClone(input);
  const replacement = replacementTarget.migrationPlan.rules.find((rule) => rule.disposition === "replace");
  replacement.target = {};
  assert.throws(() => validateCoreMigrationPlan(replacementTarget), /replacement coordinates drifted/);

  const missingLegacyFile = structuredClone(input);
  missingLegacyFile.handoffLegacySourceFiles.pop();
  assert.throws(() => validateCoreMigrationPlan(missingLegacyFile), /every handoff core source/);

  const earlyRuleAction = structuredClone(input);
  earlyRuleAction.migrationPlan.rules[0].plan044Action = "delete-now";
  assert.throws(() => validateCoreMigrationPlan(earlyRuleAction), /Plan 044 action drifted/);

  const earlyLegacyDelete = structuredClone(input);
  earlyLegacyDelete.migrationPlan.legacySourceFiles[0].action = "delete-now";
  assert.throws(() => validateCoreMigrationPlan(earlyLegacyDelete), /legacy source action drifted/);

  const compatibilityDelegate = structuredClone(input);
  compatibilityDelegate.migrationPlan.stagingRules.compatibilityDelegates = "allowed";
  assert.throws(() => validateCoreMigrationPlan(compatibilityDelegate), /compatibility or second public path/);

  const inventedMigrationAuthority = structuredClone(input);
  inventedMigrationAuthority.migrationPlan.publicationAuthority = "GRANTED";
  assert.throws(() => validateCoreMigrationPlan(inventedMigrationAuthority), /unknown authority fields/);

  const inventedRuleAuthority = structuredClone(input);
  inventedRuleAuthority.migrationPlan.rules[0].compatibilityAlias = "allowed";
  assert.throws(() => validateCoreMigrationPlan(inventedRuleAuthority), /unknown authority fields/);

  const inventedLegacyAuthority = structuredClone(input);
  inventedLegacyAuthority.migrationPlan.legacySourceFiles[0].earlyDelete = "authorized";
  assert.throws(() => validateCoreMigrationPlan(inventedLegacyAuthority), /unknown authority fields/);
});

test("green handoff run and artifact metadata authenticate exactly", () => {
  const input = handoffApiFixture();
  assert.doesNotThrow(() => validateHandoffApi({ handoffAnchor: documents.handoffAnchor, ...input }));

  const wrongAttempt = handoffApiFixture();
  wrongAttempt.run.run_attempt = 2;
  assert.throws(() => validateHandoffApi({ handoffAnchor: documents.handoffAnchor, ...wrongAttempt }), /attempt drifted/);

  const wrongArtifact = handoffApiFixture();
  wrongArtifact.artifact.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateHandoffApi({ handoffAnchor: documents.handoffAnchor, ...wrongArtifact }), /digest drifted/);

  const expired = handoffApiFixture();
  expired.artifact.expired = true;
  assert.throws(() => validateHandoffApi({ handoffAnchor: documents.handoffAnchor, ...expired }), /expired/);
});

test("handoff artifact, certificate, receipt, and freeze binding authenticate together", () => {
  const input = handoffArchiveFixture();
  assert.doesNotThrow(() => validateHandoffArchive(input));

  const changedReceipt = handoffArchiveFixture();
  changedReceipt.receiptBytes = Buffer.from("changed");
  assert.throws(() => validateHandoffArchive(changedReceipt), /receipt bytes changed/);

  const mixedArtifact = handoffArchiveFixture();
  mixedArtifact.entries.push("surface-freeze.json");
  assert.throws(() => validateHandoffArchive(mixedArtifact), /entry set drifted/);

  const changedCertificate = handoffArchiveFixture();
  changedCertificate.certificateBytes = Buffer.from("{}\n");
  assert.throws(() => validateHandoffArchive(changedCertificate), /certification bytes changed/);

  const foreignFreeze = handoffArchiveFixture();
  foreignFreeze.freezeAnchor.sourceSha = "d".repeat(40);
  assert.throws(() => validateHandoffArchive(foreignFreeze), /exact freeze anchor/);
});

test("the implementation boundary is linear, six-file exact, immutable, and DONE", async () => {
  const input = await implementationStateFixture();
  assert.doesNotThrow(() => validateCurrentImplementationState(input));

  const disallowed = structuredClone(input);
  disallowed.changedPaths.push("packages/effect-build/src/index.ts");
  assert.throws(() => validateCurrentImplementationState(disallowed), /disallowed path/);

  const missingImplementation = structuredClone(input);
  missingImplementation.implementationAddedOrModifiedPaths.pop();
  assert.throws(() => validateCurrentImplementationState(missingImplementation), /six implementation files/);

  const publicDrift = structuredClone(input);
  publicDrift.immutablePublicDiff.push("packages/effect-build/package.json");
  assert.throws(() => validateCurrentImplementationState(publicDrift), /immutable public path/);

  const brokenAncestry = structuredClone(input);
  brokenAncestry.freezeIsHandoffAncestor = false;
  assert.throws(() => validateCurrentImplementationState(brokenAncestry), /freeze is not an ancestor/);

  const unfinished = structuredClone(input);
  unfinished.planSource = unfinished.planSource.replace("- Status: DONE", "- Status: IN PROGRESS");
  assert.throws(() => validateCurrentImplementationState(unfinished), /status is absent|metadata block/);

  const contradictory = structuredClone(input);
  contradictory.planSource += "\n- Status: CANCELLED\n";
  assert.throws(() => validateCurrentImplementationState(contradictory), /contradictory/);

  const commentedDone = structuredClone(input);
  const exactStatusBlock = commentedDone.planSource.slice(0, commentedDone.planSource.indexOf("Stage the implementation"));
  commentedDone.planSource = commentedDone.planSource.replace(
    /^# Plan 039:[\s\S]*?## Authority and objective\n\n/,
    "# Plan 039: Implement the frozen core capability laws\n\n## Status\n\nStatus: IN PROGRESS\n\n## Authority and objective\n\n",
  ) + `\n<!--\n${exactStatusBlock}\n-->\n`;
  assert.throws(() => validateCurrentImplementationState(commentedDone), /metadata prefix drifted|Status heading/);

  const contradictoryIndexSummary = structuredClone(input);
  contradictoryIndexSummary.planIndexSource = contradictoryIndexSummary.planIndexSource.replace(
    "Plan 039 is complete at the export-inert core-contract stage",
    "Plan 039 is IN PROGRESS and is not complete",
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
    "      - name: Upload successful Plan 039 implementation certificate",
    "      - run: echo mutate-certificate\n      - name: Upload successful Plan 039 implementation certificate",
  );
  assert.throws(() => validateCurrentImplementationState(extraStep), /workflow bytes drifted/);
});

test("current remote evidence fails closed on event or observed-head drift", () => {
  const sourceSha = "b".repeat(40);
  const input = {
    eventName: "push",
    eventSourceSha: sourceSha,
    observedRef: "refs/heads/plan039",
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

test("current receipt and certificate exclude handoff and freeze receipts", async () => {
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
    profile: documents.profile,
    receipt,
    sourceSha,
  }));

  const handoffReceipt = structuredClone(receipt);
  handoffReceipt.id = "plan039-phase-handoff";
  assert.throws(() => validateCurrentReceipt({
    expected: documents.expected,
    freezeAnchor: documents.freezeAnchor,
    handoffAnchor: documents.handoffAnchor,
    profile: documents.profile,
    receipt: handoffReceipt,
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
      workflow: "plan-039-implementation-certification",
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
      profile: documents.profile,
      sourceSha,
    }),
    /certificate workflow drifted|run id is invalid|GitHub gate event/,
  );

  certificate.currentReceipts = [{ id: "surface-freeze", file: "surface-freeze.json", digest }];
  assert.throws(
    () => validateImplementationCertificate({
      certificate,
      currentReceiptDigest: digest,
      expected: documents.expected,
      freezeAnchor: documents.freezeAnchor,
      handoffAnchor: documents.handoffAnchor,
      profile: documents.profile,
      sourceSha,
    }),
    /Expected values|historical receipt/,
  );
});

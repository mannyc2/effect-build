import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const profilePath = "research/post-0.3/implementation/profile.json";
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const allowedClassifications = new Set(["established", "sequenced"]);

const exactReleaseSha = "f06f96ca88b6278e5f23a898d758b99fa9322108";
const exactFreezeSha = "a3017657e0851530892a9f3d2d55ac5736769881";
const exactHandoffSha = "7de4ffe68931f721317f6be92aac1e01dae6e21e";
const exactImplementationWorkflowDigest = "sha256:9dff92e100e5002393f36e485d099db1a4546a15f225ec74db17d6f8190b8829";
const exactFreezeAnchorDigest = "sha256:bddbed308ae05697663b10a63234f52ee4e5b1baca919463da8edbf4aec16888";
const exactHandoffAnchorDigest = "sha256:601dc271d3deb50a6f0aeb69bc15e776ff9d8b1e05ccd9625bd3fd3108c0ab57";
const exactProfileDigest = "sha256:d2886a8c4747df4eed90c6239e2b4e73082b6cbd656c643896b4bcfef491097e";
const exactExpectedClaimsDigest = "sha256:81f27d06a91ea1e08e930790069cf1aeee147e99e5a427406fdb036dd5a20890";
const exactCoreMigrationPlanDigest = "sha256:6827f8f5c9198a5d7d9a175a3cd48b56b8f20e661a11c40ca9b3c5eaa4b5659c";
const handoffPlan039Instruction = "- Plans 039-044 are the only implementation sequence authorized by this freeze. Plan 039 is ready to begin, but this instruction does not itself authorize a merge, package publication, npm mutation, tag, GitHub Release, or release-line activation.";
const currentPlan039Instruction = "- Plans 039-044 are the only implementation sequence authorized by this freeze. Plan 039 is complete at its export-inert core-contract stage and Plan 040 is ready to begin, but this instruction does not itself authorize a merge, package publication, npm mutation, tag, GitHub Release, or release-line activation.";
const exactPlan039StatusPrefix = `# Plan 039: Implement the frozen core capability laws

## Status

- Priority: P0 architecture foundation
- Effort: XL
- Risk: HIGH lifecycle, interruption, and public author contracts
- Depends on: exact 0.4 surface-freeze commit
- Status: DONE
- Publication authority: NONE

## Authority and objective

`;
const exactPlanIndexSummaryPrefix = `# effect-build implementation plans

## Current 0.4 program

The post-0.3 research-to-freeze program completed on 2026-08-21. Its exact
machine-readable authority is
\`research/post-0.3/freeze/SURFACE.json\` together with
\`research/post-0.3/freeze/MIGRATION.json\`; \`AGENTS.md\` is the matching active
execution instruction. Plans 039-044 have been rewritten from that frozen
scope. Plan 039 is complete at the export-inert core-contract stage: its six
frozen modules are implemented internally, while the released 0.3 export map
remains byte-identical. Plan 040 is the next implementation plan. No merge,
publication, tag, or release is authorized by Plan 039 completion.

`;

const exactProfileDocuments = [
  "research/post-0.3/implementation/freeze-trust-anchor.json",
  "research/post-0.3/implementation/handoff-trust-anchor.json",
  "research/post-0.3/implementation/expected-claims.json",
  "research/post-0.3/implementation/core-migration-plan.json",
];

const exactWorkspaceManifest = {
  path: "package.json",
  scriptAppends: {
    "test:unit": " test/unit/v04-artifact.test.ts test/unit/v04-primitives.test.ts",
    "test:architecture": " test/architecture/v04-staged-core-surface.test.ts",
  },
};

const exactImplementationFiles = [
  "packages/effect-build/src/Artifact.ts",
  "packages/effect-build/src/Author/BorrowedOutput.ts",
  "packages/effect-build/src/Author/Executable.ts",
  "packages/effect-build/src/Author/Tool.ts",
  "packages/effect-build/src/Matrix.ts",
  "packages/effect-build/src/SystemTarget.ts",
];

const exactImplementationAllowedPaths = [
  ".github/workflows/architecture-research.yml",
  "AGENTS.md",
  "package.json",
  ...exactImplementationFiles,
  "plans/039-establish-core-capability-boundaries.md",
  "plans/README.md",
  "research/post-0.3/implementation/",
  "test/architecture/docs-contract.test.ts",
  "test/architecture/generated-and-ci.test.ts",
  "test/architecture/import-boundaries.test.ts",
  "test/architecture/public-api.test.ts",
  "test/architecture/v04-staged-core-surface.test.ts",
  "test/unit/v04-artifact.test.ts",
  "test/unit/v04-primitives.test.ts",
  "typetest/v04-artifact.tst.ts",
  "typetest/v04-author-borrowed-output.tst.ts",
  "typetest/v04-author-executable.tst.ts",
  "typetest/v04-author-tool.tst.ts",
  "typetest/v04-matrix.tst.ts",
  "typetest/v04-system-target.tst.ts",
];

const exactImmutablePublicPaths = [
  "bun.lock",
  "packages/effect-build-bun/package.json",
  "packages/effect-build-bun/src/index.ts",
  "packages/effect-build-deno/package.json",
  "packages/effect-build-deno/src/index.ts",
  "packages/effect-build-esbuild/package.json",
  "packages/effect-build-esbuild/src/index.ts",
  "packages/effect-build-node-sea/package.json",
  "packages/effect-build-node-sea/src/index.ts",
  "packages/effect-build/package.json",
  "packages/effect-build/src/index.ts",
  "tooling/public-api.json",
];

const exactExpectedClaims = {
  schema: "effect-build/expected-implementation-claims@1",
  profileId: "effect-build/plan039-implementation@1",
  receiptId: "plan039-implementation",
  claims: [
    {
      id: "historical-authority-authenticated",
      classification: "established",
      conclusion: "exact-freeze-anchor-and-green-plan039-handoff-run-artifact-certificate-and-receipt-are-content-authenticated",
      assertions: [
        "freeze-anchor-is-bound-to-the-green-handoff",
        "handoff-run-is-exact-successful-push-at-attempt-1",
        "handoff-artifact-id-name-size-and-digest-match",
        "handoff-certificate-and-receipt-bytes-match",
        "release-freeze-handoff-current-ancestry-is-linear",
      ],
    },
    {
      id: "current-head-authenticated",
      classification: "established",
      conclusion: "checked-out-event-and-fresh-remote-head-all-equal-the-exact-plan039-certification-source",
      assertions: [
        "checkout-equals-source-sha",
        "workflow-event-equals-source-sha",
        "fresh-remote-head-equals-source-sha",
      ],
    },
    {
      id: "implementation-scope-certified",
      classification: "established",
      conclusion: "plan039-is-done-with-exactly-the-six-authorized-core-files-staged-and-no-immutable-public-path-change",
      assertions: [
        "plan039-status-is-done",
        "active-instructions-record-plan039-done-and-plan040-ready",
        "all-post-handoff-paths-are-explicitly-allowed-implementation-paths",
        "exactly-six-implementation-files-are-added-or-changed",
        "workspace-manifest-matches-handoff-except-exact-v04-test-registration-appends",
        "immutable-public-paths-match-the-handoff",
        "core-migration-plan-resolves-exactly-71-frozen-identities",
        "required-gates-precede-current-head-certification",
      ],
    },
    {
      id: "certification-profiles-disjoint",
      classification: "established",
      conclusion: "freeze-handoff-and-current-implementation-evidence-remain-explicit-inputs-with-disjoint-current-receipts",
      assertions: [
        "profile-identities-are-distinct",
        "profile-documents-claims-and-producer-sets-are-explicit",
        "current-receipt-is-plan039-implementation",
        "current-receipts-exclude-handoff-and-freeze-receipts",
        "current-workflow-does-not-invoke-freeze-producers-or-validators",
        "historical-inputs-are-separated-from-current-receipts",
      ],
    },
  ],
};

const exactCoreMigrationRuleIds = [
  "MAP-INTEGRATION-SUBPATH-REMOVE",
  "MAP-PROVIDER-SUBPATH-REMOVE",
  "MAP-CORE-ARTIFACT-REPLACE",
  "MAP-CORE-STAGE-REMOVE",
  "MAP-CORE-BUILD-ERROR-REMOVE",
  "MAP-CORE-BUNDLE-REMOVE",
  "MAP-CORE-MATRIX-REPLACE",
  "MAP-CORE-TARGET-REPLACE",
  "MAP-CORE-RESOLUTION-TARGET-REMOVE",
  "MAP-INTEGRATION-EXPORTS-REMOVE",
  "MAP-PROVIDER-EXPORTS-REMOVE",
];

export const requiredImplementationCommands = [
  "bun install --frozen-lockfile",
  "node --test research/post-0.3/implementation/certification-contract.test.mjs",
  "bun run verify",
  "bun test research/post-0.3/r3-provider-compatibility.test.ts research/post-0.3/r4-author-laws.test.mjs",
  "node --test research/post-0.3/r7-matrix-laws.test.mjs",
  "node research/post-0.3/implementation/staged-external-author-adapter.mjs",
  "node research/post-0.3/implementation/certify-current-head.mjs",
];

const sorted = (values) => [...values].sort();

const assertNonEmptyString = (value, message) => {
  assert.equal(typeof value, "string", message);
  assert.ok(value.length > 0, message);
};

const assertUniqueStrings = (values, message) => {
  assert.ok(Array.isArray(values) && values.length > 0, message);
  for (const value of values) assertNonEmptyString(value, message);
  assert.equal(new Set(values).size, values.length, message);
};

const assertExplicitRepositoryPath = (value, message, { directory = false } = {}) => {
  assertNonEmptyString(value, message);
  assert.equal(value.startsWith("/"), false, message);
  assert.equal(value.includes(".."), false, message);
  assert.equal(/[?*[\]{}]/.test(value), false, message);
  if (!directory) assert.equal(value.endsWith("/"), false, message);
};

const assertDigest = (value, message) => assert.match(value, digestPattern, message);

export const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const validateFreezeAnchor = (anchor) => {
  assert.equal(anchor.schema, "effect-build/historical-freeze-trust-anchor@1", "invalid freeze anchor schema");
  assert.equal(anchor.profileId, "post-0.3-surface-freeze-v1", "unexpected historical profile id");
  assert.equal(anchor.sourceSha, exactFreezeSha, "freeze source SHA drifted");
  assert.match(anchor.baseSha, shaPattern, "invalid freeze base SHA");
  assert.equal(anchor.releaseSha, exactReleaseSha, "freeze release SHA drifted");
  assert.equal(anchor.workflow.repository, "mannyc2/effect-build", "unexpected freeze repository");
  assert.equal(anchor.workflow.runId, "32502909677", "freeze run id drifted");
  assert.equal(anchor.workflow.runAttempt, "1", "freeze run attempt drifted");
  assert.equal(anchor.workflow.eventName, "push", "freeze trust must use the push certification");
  assert.equal(anchor.workflow.conclusion, "success", "freeze run was not successful");
  assert.equal(anchor.aggregateArtifact.id, "9454270941", "freeze artifact id drifted");
  assert.equal(anchor.aggregateArtifact.sizeInBytes, 34766, "freeze artifact size drifted");
  assert.equal(
    anchor.aggregateArtifact.digest,
    "sha256:a502ab64e0cda8fb743f3f6175dfcde4c098eeb9546cc98173a7a6b339002233",
    "freeze artifact digest drifted",
  );
  assert.ok(Number.isSafeInteger(anchor.aggregateArtifact.sizeInBytes) && anchor.aggregateArtifact.sizeInBytes > 0);
  assert.equal(anchor.certification.file, "certification.json", "unexpected freeze certification filename");
  assert.equal(anchor.certification.schema, "effect-build/architecture-certification@3");
  assert.equal(
    anchor.certification.digest,
    "sha256:363b4981470cc95eb6c43fc8e56623aaca1f5d2f89c2e9ca38bcc8e3b2e0fc5c",
    "freeze certification digest drifted",
  );
  assert.equal(anchor.certification.claims, 44, "freeze certification claim count drifted");
  assert.equal(anchor.certification.result, "certified", "freeze certification was not successful");
  assert.ok(Array.isArray(anchor.receipts) && anchor.receipts.length === 20, "freeze anchor must contain 20 receipts");
  const receiptIds = anchor.receipts.map((receipt) => receipt.id);
  assert.deepEqual(receiptIds, sorted(receiptIds), "freeze receipts must be explicitly ordered by id");
  assert.equal(new Set(receiptIds).size, receiptIds.length, "freeze receipt ids are duplicated");
  for (const receipt of anchor.receipts) {
    assert.equal(receipt.file, `${receipt.id}.json`, `freeze receipt filename drifted: ${receipt.id}`);
    assertDigest(receipt.digest, `invalid freeze receipt digest: ${receipt.id}`);
  }
  assert.equal(receiptIds.includes("surface-freeze"), true, "historical freeze receipt is missing");
  return anchor;
};

export const historicalFreezeSummary = (anchor) => ({
  profileId: anchor.profileId,
  sourceSha: anchor.sourceSha,
  workflow: anchor.workflow,
  aggregateArtifact: anchor.aggregateArtifact,
  certification: {
    file: anchor.certification.file,
    schema: anchor.certification.schema,
    digest: anchor.certification.digest,
    claims: anchor.certification.claims,
    result: anchor.certification.result,
  },
  receipts: anchor.receipts,
});

export const freezeReceiptSetDigest = (anchor) => sha256(Buffer.from(JSON.stringify(anchor.receipts)));

const validateHandoffAnchor = ({ freezeAnchor, handoffAnchor }) => {
  assert.equal(
    handoffAnchor.schema,
    "effect-build/plan039-handoff-trust-anchor@1",
    "invalid Plan 039 handoff anchor schema",
  );
  assert.equal(handoffAnchor.profileId, "effect-build/plan039-implementation@1", "handoff profile id drifted");
  assert.equal(handoffAnchor.sourceSha, exactHandoffSha, "handoff source SHA drifted");
  assert.equal(handoffAnchor.workflow.repository, freezeAnchor.workflow.repository, "handoff repository drifted");
  assert.equal(handoffAnchor.workflow.name, "plan-039-implementation-certification", "handoff workflow drifted");
  assert.equal(handoffAnchor.workflow.path, ".github/workflows/architecture-research.yml", "handoff workflow path drifted");
  assert.equal(handoffAnchor.workflow.runId, "32505419081", "handoff run id drifted");
  assert.equal(handoffAnchor.workflow.runAttempt, "1", "handoff run attempt drifted");
  assert.equal(handoffAnchor.workflow.eventName, "push", "handoff trust must use a push run");
  assert.equal(handoffAnchor.workflow.conclusion, "success", "handoff run was not successful");
  assert.equal(handoffAnchor.aggregateArtifact.id, "9455113555", "handoff artifact id drifted");
  assert.equal(
    handoffAnchor.aggregateArtifact.name,
    `plan039-implementation-certification-${exactHandoffSha}`,
    "handoff artifact name drifted",
  );
  assert.equal(handoffAnchor.aggregateArtifact.sizeInBytes, 3896, "handoff artifact size drifted");
  assert.equal(
    handoffAnchor.aggregateArtifact.digest,
    "sha256:5234a76e040291df7d1dbdd2037f51319736cde5ababbeda66f7fd00ff110504",
    "handoff artifact digest drifted",
  );
  assert.equal(handoffAnchor.certification.file, "plan039-certification.json");
  assert.equal(handoffAnchor.certification.schema, "effect-build/implementation-certification@1");
  assert.equal(
    handoffAnchor.certification.digest,
    "sha256:77eacc05831d0362b33def11c9ded232a2baa2c14056809b7b751afb343dff56",
    "handoff certification digest drifted",
  );
  assert.equal(handoffAnchor.certification.phase, "workflow-handoff");
  assert.equal(handoffAnchor.certification.claims, 4);
  assert.equal(handoffAnchor.certification.result, "certified");
  assert.equal(handoffAnchor.receipt.id, "plan039-phase-handoff");
  assert.equal(handoffAnchor.receipt.file, "plan039-phase-handoff.json");
  assert.equal(
    handoffAnchor.receipt.digest,
    "sha256:7963f1bbd1a5d015fcb9b963936e7ae153c0d2c07d08a0551b2d2313989d7995",
    "handoff receipt digest drifted",
  );
  assert.deepEqual(handoffAnchor.freezeInput, {
    profileId: freezeAnchor.profileId,
    sourceSha: freezeAnchor.sourceSha,
    aggregateArtifactId: freezeAnchor.aggregateArtifact.id,
    aggregateArtifactDigest: freezeAnchor.aggregateArtifact.digest,
    certificationDigest: freezeAnchor.certification.digest,
    receiptCount: freezeAnchor.receipts.length,
  }, "handoff is not bound to the exact freeze anchor");
  return handoffAnchor;
};

export const historicalAuthoritySummary = ({ freezeAnchor, handoffAnchor }) => ({
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
});

export const validateProfileDocuments = ({
  expected,
  freezeAnchor,
  handoffAnchor,
  migrationAuthority,
  migrationPlan,
  profile,
}) => {
  assert.deepEqual(Object.keys(profile).sort(), [
    "certificateFile",
    "currentReceiptIds",
    "expectedClaims",
    "forbiddenCurrentReceiptIds",
    "forbiddenInvocations",
    "handoffTrustAnchor",
    "historicalProfileIds",
    "immutablePublicPaths",
    "implementationAllowedPaths",
    "implementationFiles",
    "migrationPlan",
    "phase",
    "plan",
    "producers",
    "productionBaseline",
    "profileId",
    "receiptDirectoryEnvironment",
    "schema",
    "trustAnchor",
    "workspaceManifest",
  ], "implementation profile contains unknown authority fields");
  assert.equal(
    profile.schema,
    "effect-build/implementation-certification-profile@1",
    "invalid Plan 039 profile schema",
  );
  assert.equal(profile.profileId, "effect-build/plan039-implementation@1", "unexpected Plan 039 profile id");
  assert.equal(profile.plan, "039", "unexpected implementation plan");
  assert.equal(profile.phase, "implementation", "unexpected Plan 039 phase");
  assert.equal(profile.receiptDirectoryEnvironment, "PLAN039_RECEIPTS_DIR", "receipt directory is not disjoint");
  assert.equal(profile.certificateFile, "plan039-certification.json", "unexpected Plan 039 certificate name");

  const profileDocuments = [profile.trustAnchor, profile.handoffTrustAnchor, profile.expectedClaims, profile.migrationPlan];
  for (const path of profileDocuments) {
    assertExplicitRepositoryPath(path, "profile document paths must be explicit repository paths");
  }
  assert.deepEqual(profileDocuments, exactProfileDocuments, "unexpected implementation profile document path");
  assert.deepEqual(profile.workspaceManifest, exactWorkspaceManifest, "workspace manifest coordinates drifted");
  assertExplicitRepositoryPath(profile.workspaceManifest.path, "workspace manifest path must be explicit");

  assert.ok(Array.isArray(profile.producers) && profile.producers.length === 1, "profile must declare one producer");
  const producer = profile.producers[0];
  assert.deepEqual(producer, {
    lane: "implementation",
    script: "research/post-0.3/implementation/certify-current-head.mjs",
    receipts: ["plan039-implementation"],
  }, "unexpected Plan 039 producer");
  assert.deepEqual(profile.currentReceiptIds, ["plan039-implementation"], "current receipt set drifted");
  assert.deepEqual(profile.historicalProfileIds, ["post-0.3-surface-freeze-v1"], "historical profile set drifted");
  assert.deepEqual(
    profile.forbiddenCurrentReceiptIds,
    ["plan039-phase-handoff", "surface-freeze"],
    "forbidden current receipt set drifted",
  );
  assert.deepEqual(
    profile.forbiddenInvocations,
    [
      "research/post-0.3/certify-surface-freeze.mjs",
      "research/post-0.3/freeze/validate-freeze.mjs",
    ],
    "forbidden implementation invocation set drifted",
  );

  assertUniqueStrings(profile.implementationAllowedPaths, "implementation paths must be explicit and unique");
  assert.deepEqual(
    profile.implementationAllowedPaths,
    exactImplementationAllowedPaths,
    "implementation allowed-path set drifted",
  );
  for (const path of profile.implementationAllowedPaths) {
    assertExplicitRepositoryPath(path, "implementation paths must be explicit repository paths", {
      directory: path.endsWith("/"),
    });
  }
  assert.deepEqual(profile.implementationFiles, exactImplementationFiles, "the six implementation files drifted");
  assertUniqueStrings(profile.immutablePublicPaths, "immutable public paths must be explicit and unique");
  assert.deepEqual(profile.immutablePublicPaths, exactImmutablePublicPaths, "immutable public-path set drifted");
  for (const path of [...profile.implementationFiles, ...profile.immutablePublicPaths]) {
    assertExplicitRepositoryPath(path, "implementation boundary paths must be explicit repository paths");
  }
  assert.equal(
    profile.implementationFiles.some((path) => profile.immutablePublicPaths.includes(path)),
    false,
    "implementation and immutable paths overlap",
  );
  for (const path of profile.implementationFiles) {
    assert.equal(
      profile.implementationAllowedPaths.includes(path),
      true,
      `implementation file is not explicitly allowed: ${path}`,
    );
  }

  validateFreezeAnchor(freezeAnchor);
  validateHandoffAnchor({ freezeAnchor, handoffAnchor });
  assert.deepEqual(profile.productionBaseline, {
    releaseSha: exactReleaseSha,
    freezeSha: exactFreezeSha,
    handoffSha: exactHandoffSha,
  }, "implementation ancestry baseline drifted");
  assert.equal(profile.historicalProfileIds.includes(freezeAnchor.profileId), true);
  assert.equal(profile.profileId, handoffAnchor.profileId);
  assert.notEqual(profile.profileId, freezeAnchor.profileId);

  assert.equal(migrationPlan.schema, "effect-build/plan039-core-migration@1", "invalid core migration plan schema");
  assert.equal(migrationPlan.source, "research/post-0.3/freeze/MIGRATION.json", "core migration source drifted");
  assert.equal(migrationAuthority.version, 1, "invalid frozen migration authority version");
  assert.equal(
    migrationAuthority.status,
    "complete-v0.3-inventory-frozen-v0.4-targets",
    "frozen migration authority is incomplete",
  );

  assert.deepEqual(expected, exactExpectedClaims, "expected implementation claims drifted");
  assert.equal(expected.schema, "effect-build/expected-implementation-claims@1", "invalid expected-claim schema");
  assert.equal(expected.profileId, profile.profileId, "expected claims name another profile");
  assert.equal(expected.receiptId, "plan039-implementation", "expected claims name another receipt");
  assert.ok(Array.isArray(expected.claims) && expected.claims.length === 4, "Plan 039 implementation must have four claims");
  const claimIds = expected.claims.map((claim) => claim.id);
  assert.equal(new Set(claimIds).size, claimIds.length, "expected claim ids are duplicated");
  for (const claim of expected.claims) {
    assertNonEmptyString(claim.id, "expected claim id is missing");
    assert.ok(allowedClassifications.has(claim.classification), `invalid classification: ${claim.id}`);
    assertNonEmptyString(claim.conclusion, `expected conclusion is missing: ${claim.id}`);
    assertUniqueStrings(claim.assertions, `expected assertions are missing or duplicated: ${claim.id}`);
  }

  return { expected, freezeAnchor, handoffAnchor, migrationAuthority, migrationPlan, profile };
};

export const loadProfileDocuments = async (repository) => {
  const profileBytes = await readFile(resolve(repository, profilePath));
  assert.equal(sha256(profileBytes), exactProfileDigest, "implementation profile bytes drifted");
  const profile = JSON.parse(profileBytes.toString("utf8"));
  assert.deepEqual(
    [profile.trustAnchor, profile.handoffTrustAnchor, profile.expectedClaims, profile.migrationPlan],
    exactProfileDocuments,
    "unexpected implementation profile document path",
  );
  assert.deepEqual(profile.workspaceManifest, exactWorkspaceManifest, "workspace manifest coordinates drifted");
  const freezeAnchorBytes = await readFile(resolve(repository, profile.trustAnchor));
  const handoffAnchorBytes = await readFile(resolve(repository, profile.handoffTrustAnchor));
  assert.equal(sha256(freezeAnchorBytes), exactFreezeAnchorDigest, "freeze trust-anchor bytes drifted");
  assert.equal(sha256(handoffAnchorBytes), exactHandoffAnchorDigest, "handoff trust-anchor bytes drifted");
  const freezeAnchor = JSON.parse(freezeAnchorBytes.toString("utf8"));
  const handoffAnchor = JSON.parse(handoffAnchorBytes.toString("utf8"));
  const expectedBytes = await readFile(resolve(repository, profile.expectedClaims));
  const migrationPlanBytes = await readFile(resolve(repository, profile.migrationPlan));
  assert.equal(sha256(expectedBytes), exactExpectedClaimsDigest, "expected-claim bytes drifted");
  assert.equal(sha256(migrationPlanBytes), exactCoreMigrationPlanDigest, "core migration-plan bytes drifted");
  const expected = JSON.parse(expectedBytes.toString("utf8"));
  const migrationPlan = JSON.parse(migrationPlanBytes.toString("utf8"));
  assert.equal(migrationPlan.source, "research/post-0.3/freeze/MIGRATION.json", "core migration source drifted");
  const migrationAuthority = await readJson(resolve(repository, migrationPlan.source));
  return validateProfileDocuments({
    expected,
    freezeAnchor,
    handoffAnchor,
    migrationAuthority,
    migrationPlan,
    profile,
  });
};

export const validateWorkspaceManifest = ({ currentManifest, handoffManifest, profile }) => {
  assert.deepEqual(profile.workspaceManifest, exactWorkspaceManifest, "workspace manifest coordinates drifted");
  assert.ok(handoffManifest !== null && typeof handoffManifest === "object", "handoff workspace manifest is missing");
  assert.ok(currentManifest !== null && typeof currentManifest === "object", "current workspace manifest is missing");
  assert.ok(
    handoffManifest.scripts !== null && typeof handoffManifest.scripts === "object",
    "handoff workspace scripts are missing",
  );

  const expectedCurrentManifest = structuredClone(handoffManifest);
  for (const [script, append] of Object.entries(profile.workspaceManifest.scriptAppends)) {
    assertNonEmptyString(handoffManifest.scripts[script], `handoff workspace script is missing: ${script}`);
    expectedCurrentManifest.scripts[script] = `${handoffManifest.scripts[script]}${append}`;
  }
  assert.deepEqual(
    currentManifest,
    expectedCurrentManifest,
    "current workspace manifest differs from the handoff beyond the exact v0.4 test registrations",
  );

  return {
    handoffSha: profile.productionBaseline.handoffSha,
    path: profile.workspaceManifest.path,
    scriptAppends: profile.workspaceManifest.scriptAppends,
  };
};

export const validateActiveInstructions = ({ currentInstructions, handoffInstructions }) => {
  assert.equal(
    handoffInstructions.split(handoffPlan039Instruction).length - 1,
    1,
    "handoff instructions do not contain the exact Plan 039 start marker",
  );
  assert.equal(
    currentInstructions,
    handoffInstructions.replace(handoffPlan039Instruction, currentPlan039Instruction),
    "active instructions differ from the handoff beyond the exact Plan 039 completion update",
  );
  return {
    handoffSha: exactHandoffSha,
    path: "AGENTS.md",
    plan039: "DONE",
    nextPlan: "040",
    publicationAuthority: "NONE",
  };
};

export const validateCoreMigrationPlan = ({ handoffLegacySourceFiles, migrationAuthority, migrationPlan }) => {
  assert.deepEqual(Object.keys(migrationPlan).sort(), [
    "authorityCount",
    "authoritySetSha256",
    "legacySourceFiles",
    "rules",
    "schema",
    "scope",
    "source",
    "stagingRules",
  ], "core migration plan contains unknown authority fields");
  assert.equal(migrationPlan.schema, "effect-build/plan039-core-migration@1", "invalid core migration plan schema");
  assert.equal(migrationPlan.source, "research/post-0.3/freeze/MIGRATION.json", "core migration source drifted");
  assert.equal(migrationPlan.scope, "effect-build remove-or-replace authorities", "core migration scope drifted");
  assert.equal(migrationPlan.authorityCount, 71, "core migration authority count drifted");
  assert.equal(
    migrationPlan.authoritySetSha256,
    "a0bdf3b59a1a85bbc448decd0186e29c0fabe7c04e3203ff6657af5f746bb3fe",
    "core migration authority-set digest drifted",
  );
  assert.ok(Array.isArray(migrationPlan.rules) && migrationPlan.rules.length === 11, "core migration must name 11 rules");
  const planRuleIds = migrationPlan.rules.map((rule) => rule.rule);
  assert.equal(new Set(planRuleIds).size, planRuleIds.length, "core migration rule ids are duplicated");
  assert.deepEqual(planRuleIds, exactCoreMigrationRuleIds, "core migration rule ids drifted");

  assert.ok(Array.isArray(migrationAuthority.rules), "frozen migration rules are missing");
  assert.ok(Array.isArray(migrationAuthority.mappingGroups), "frozen migration mapping groups are missing");
  const authorityRules = new Map(migrationAuthority.rules.map((rule) => [rule.id, rule]));
  assert.equal(authorityRules.size, migrationAuthority.rules.length, "frozen migration rule ids are duplicated");
  const authorityGroups = new Map(migrationAuthority.mappingGroups.map((group) => [group.rule, group]));
  assert.equal(authorityGroups.size, migrationAuthority.mappingGroups.length, "frozen migration groups are duplicated");

  const expectedCoreRuleIds = migrationAuthority.rules
    .filter((rule) => rule.disposition === "remove" || rule.disposition === "replace")
    .filter((rule) => {
      const group = authorityGroups.get(rule.id);
      return Array.isArray(group?.identities)
        && group.identities.length > 0
        && group.identities.every((identity) => identity.split(":")[1] === "effect-build");
    })
    .map((rule) => rule.id);
  assert.deepEqual(
    sorted(planRuleIds),
    sorted(expectedCoreRuleIds),
    "core migration rules do not resolve the exact frozen core rule set",
  );

  const identities = [];
  for (const rule of migrationPlan.rules) {
    assertNonEmptyString(rule.rule, "core migration rule id is missing");
    const authorityRule = authorityRules.get(rule.rule);
    assert.ok(authorityRule, `core migration rule is absent from MIGRATION.json: ${rule.rule}`);
    assert.deepEqual(
      Object.keys(rule).sort(),
      authorityRule.disposition === "remove"
        ? ["disposition", "ownerPlans", "plan044Action", "redesignGuidance", "rule", "target"]
        : ["disposition", "ownerPlans", "plan044Action", "rule", "target"],
      `core migration rule contains unknown authority fields: ${rule.rule}`,
    );
    assert.equal(rule.disposition, authorityRule.disposition, `core migration disposition drifted: ${rule.rule}`);
    assert.equal(
      rule.plan044Action,
      authorityRule.disposition === "remove" ? "delete" : "replace",
      `core migration Plan 044 action drifted: ${rule.rule}`,
    );
    if (authorityRule.disposition === "remove") {
      assert.equal(rule.target, null, `removed core authority has a target: ${rule.rule}`);
      assert.equal(Object.hasOwn(rule, "replacement"), false, `removed core authority has a replacement: ${rule.rule}`);
      assertUniqueStrings(rule.redesignGuidance, `removed core authority lacks redesign guidance: ${rule.rule}`);
    } else {
      assert.deepEqual(
        rule.target,
        authorityRule.target?.coordinatesByIdentity,
        `replacement coordinates drifted: ${rule.rule}`,
      );
      assert.equal(Object.hasOwn(rule, "replacement"), false, `replacement rule uses a parallel replacement field: ${rule.rule}`);
    }
    assertUniqueStrings(rule.ownerPlans, `core migration owner plans are missing: ${rule.rule}`);
    assert.equal(rule.ownerPlans.includes("044"), true, `Plan 044 does not own the hard cut: ${rule.rule}`);
    assert.equal(
      /compatibility\s*(?:delegate|shim|alias)|second\s+public\s+path/i.test(JSON.stringify({
        redesignGuidance: rule.redesignGuidance,
        target: rule.target,
      })),
      false,
      `core migration introduces a compatibility or second public path: ${rule.rule}`,
    );
    const group = authorityGroups.get(rule.rule);
    assert.ok(Array.isArray(group?.identities) && group.identities.length > 0, `core migration group is empty: ${rule.rule}`);
    identities.push(...group.identities);
  }
  assert.equal(identities.length, 71, "core migration rules do not resolve 71 identities");
  assert.equal(new Set(identities).size, identities.length, "core migration identities overlap");
  const identitySetDigest = sha256(Buffer.from(`${sorted(identities).join("\n")}\n`)).slice("sha256:".length);
  assert.equal(identitySetDigest, migrationPlan.authoritySetSha256, "resolved core migration identity digest drifted");

  assert.ok(
    Array.isArray(migrationPlan.legacySourceFiles) && migrationPlan.legacySourceFiles.length > 0,
    "legacy source file plan is missing",
  );
  const legacyPaths = migrationPlan.legacySourceFiles.map((entry) => entry.path);
  assert.deepEqual(legacyPaths, sorted(legacyPaths), "legacy source files must be explicitly sorted");
  assert.equal(new Set(legacyPaths).size, legacyPaths.length, "legacy source files are duplicated");
  assert.deepEqual(
    legacyPaths,
    sorted(handoffLegacySourceFiles),
    "legacy source files do not equal every handoff core source except index.ts",
  );
  const replacementLegacyPaths = new Set([
    "packages/effect-build/src/standalone/Artifact.ts",
    "packages/effect-build/src/standalone/MatrixError.ts",
    "packages/effect-build/src/standalone/Target.ts",
  ]);
  for (const entry of migrationPlan.legacySourceFiles) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ["action", "actionOwner", "path"],
      `legacy source entry contains unknown authority fields: ${entry.path}`,
    );
    assert.equal(
      entry.action,
      replacementLegacyPaths.has(entry.path) ? "replace-at-plan044" : "delete-at-plan044",
      `legacy source action drifted: ${entry.path}`,
    );
    assertNonEmptyString(entry.actionOwner, `legacy source action owner is missing: ${entry.path}`);
    assert.equal(Object.hasOwn(entry, "replacementOwner"), false, `legacy source uses a replacement-only owner: ${entry.path}`);
  }
  assert.deepEqual(
    migrationPlan.legacySourceFiles.filter((entry) => entry.action === "replace-at-plan044").map((entry) => entry.path),
    sorted(replacementLegacyPaths),
    "legacy replacement file set drifted",
  );
  assert.deepEqual(migrationPlan.stagingRules, {
    throughPlan043: "all legacy source files and released exports remain byte-identical to the handoff ancestor",
    plan044: "apply the listed delete-or-replace actions in one coordinated hard cut",
    compatibilityDelegates: "forbidden",
    secondPublicPaths: "forbidden",
  }, "core migration staging rules permit a compatibility or second public path");

  return {
    authorityCount: identities.length,
    authoritySetSha256: migrationPlan.authoritySetSha256,
    legacySourceFiles: legacyPaths,
    ruleIds: planRuleIds,
    stagingRules: migrationPlan.stagingRules,
  };
};

export const validateHandoffApi = ({ artifact, handoffAnchor, run }) => {
  assert.equal(String(run.id), handoffAnchor.workflow.runId, "handoff run id drifted");
  assert.equal(String(run.run_attempt), handoffAnchor.workflow.runAttempt, "handoff run attempt drifted");
  assert.equal(run.name, handoffAnchor.workflow.name, "handoff workflow name drifted");
  assert.equal(run.path, handoffAnchor.workflow.path, "handoff workflow path drifted");
  assert.equal(run.event, handoffAnchor.workflow.eventName, "handoff workflow event drifted");
  assert.equal(run.status, "completed", "handoff workflow is no longer completed");
  assert.equal(run.conclusion, handoffAnchor.workflow.conclusion, "handoff workflow conclusion drifted");
  assert.equal(run.head_sha, handoffAnchor.sourceSha, "handoff workflow source drifted");
  assert.equal(run.repository?.full_name, handoffAnchor.workflow.repository, "handoff workflow repository drifted");

  assert.equal(String(artifact.id), handoffAnchor.aggregateArtifact.id, "handoff artifact id drifted");
  assert.equal(artifact.name, handoffAnchor.aggregateArtifact.name, "handoff artifact name drifted");
  assert.equal(artifact.size_in_bytes, handoffAnchor.aggregateArtifact.sizeInBytes, "handoff artifact size drifted");
  assert.equal(artifact.digest, handoffAnchor.aggregateArtifact.digest, "handoff artifact digest drifted");
  assert.equal(artifact.expired, false, "handoff artifact has expired");
  assert.equal(String(artifact.workflow_run?.id), handoffAnchor.workflow.runId, "handoff artifact names another run");
  assert.equal(artifact.workflow_run?.head_sha, handoffAnchor.sourceSha, "handoff artifact names another source");
  return { artifact, run };
};

export const validateHandoffArchive = ({
  archiveBytes,
  certificateBytes,
  entries,
  freezeAnchor,
  handoffAnchor,
  receiptBytes,
}) => {
  assert.equal(archiveBytes.byteLength, handoffAnchor.aggregateArtifact.sizeInBytes, "handoff artifact byte size changed");
  assert.equal(sha256(archiveBytes), handoffAnchor.aggregateArtifact.digest, "handoff artifact bytes failed authentication");
  const expectedEntries = sorted([handoffAnchor.certification.file, handoffAnchor.receipt.file]);
  assert.deepEqual(sorted(entries), expectedEntries, "handoff artifact entry set drifted or mixed profiles");
  assert.equal(new Set(entries).size, entries.length, "handoff artifact contains duplicate entries");
  assert.equal(sha256(certificateBytes), handoffAnchor.certification.digest, "handoff certification bytes changed");
  assert.equal(sha256(receiptBytes), handoffAnchor.receipt.digest, "handoff receipt bytes changed");

  const certificate = JSON.parse(Buffer.from(certificateBytes).toString("utf8"));
  assert.equal(certificate.schema, handoffAnchor.certification.schema, "handoff certification schema drifted");
  assert.equal(certificate.profileId, handoffAnchor.profileId, "handoff certification profile drifted");
  assert.equal(certificate.plan, "039", "handoff certification plan drifted");
  assert.equal(certificate.phase, handoffAnchor.certification.phase, "handoff certification phase drifted");
  assert.equal(certificate.sourceSha, handoffAnchor.sourceSha, "handoff certification source drifted");
  assert.deepEqual(certificate.workflow, {
    repository: handoffAnchor.workflow.repository,
    workflow: handoffAnchor.workflow.name,
    runId: handoffAnchor.workflow.runId,
    runAttempt: handoffAnchor.workflow.runAttempt,
    eventName: handoffAnchor.workflow.eventName,
  }, "handoff certification workflow identity drifted");
  assert.deepEqual(
    certificate.historicalInputs?.freeze,
    historicalFreezeSummary(freezeAnchor),
    "handoff certification is not bound to the exact freeze anchor",
  );
  assert.deepEqual(certificate.currentReceipts, [handoffAnchor.receipt], "handoff certification receipt set drifted");
  assert.equal(certificate.claims, handoffAnchor.certification.claims, "handoff certification claim count drifted");
  assert.equal(certificate.result, handoffAnchor.certification.result, "handoff certification result drifted");

  const receipt = JSON.parse(Buffer.from(receiptBytes).toString("utf8"));
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1", "handoff receipt schema drifted");
  assert.equal(receipt.profileId, handoffAnchor.profileId, "handoff receipt profile drifted");
  assert.equal(receipt.id, handoffAnchor.receipt.id, "handoff receipt id drifted");
  assert.equal(receipt.sourceSha, handoffAnchor.sourceSha, "handoff receipt source drifted");
  assert.equal(receipt.status, "reproduced", "handoff receipt status drifted");
  assert.ok(Array.isArray(receipt.claims) && receipt.claims.length === handoffAnchor.certification.claims);
  assert.equal(
    receipt.claims.every((claim) =>
      Array.isArray(claim.assertions)
      && claim.assertions.length > 0
      && claim.assertions.every((value) => value.passed === true)
    ),
    true,
    "handoff receipt contains an unsuccessful assertion",
  );
  assert.equal(receipt.evidence?.historicalFreeze?.profileId, freezeAnchor.profileId);
  assert.equal(receipt.evidence?.historicalFreeze?.sourceSha, freezeAnchor.sourceSha);
  assert.equal(receipt.evidence?.historicalFreeze?.receiptCount, freezeAnchor.receipts.length);
  assert.equal(
    receipt.evidence?.historicalFreeze?.receiptSetDigest,
    freezeReceiptSetDigest(freezeAnchor),
    "handoff freeze receipt-set digest drifted",
  );
  assert.equal(receipt.evidence?.currentHead?.observedSha, handoffAnchor.sourceSha);
  assert.equal(receipt.evidence?.currentHead?.repository, handoffAnchor.workflow.repository);
  assert.equal(receipt.evidence?.profileSeparation?.currentProfileId, handoffAnchor.profileId);
  assert.deepEqual(receipt.evidence?.profileSeparation?.currentReceiptIds, [handoffAnchor.receipt.id]);

  return {
    profileId: handoffAnchor.profileId,
    sourceSha: handoffAnchor.sourceSha,
    workflow: handoffAnchor.workflow,
    aggregateArtifact: handoffAnchor.aggregateArtifact,
    certification: handoffAnchor.certification,
    receipt: handoffAnchor.receipt,
    freezeInput: handoffAnchor.freezeInput,
  };
};

export const validateCurrentRemoteEvidence = ({
  eventName,
  eventSourceSha,
  observedRef,
  observedSha,
  repository,
  sourceSha,
}) => {
  assert.equal(
    eventName === "push" || eventName === "pull_request",
    true,
    "unsupported certification event",
  );
  assert.equal(repository, "mannyc2/effect-build", "current certification names another repository");
  assert.match(observedRef, /^(?:refs\/heads\/.+|[^:]+:[^:]+)$/, "current certification remote ref is malformed");
  assert.equal(eventSourceSha, sourceSha, "workflow event source does not equal SOURCE_SHA");
  assert.equal(observedSha, sourceSha, "fresh remote head does not equal SOURCE_SHA");
  return { eventName, eventSourceSha, observedRef, observedSha, repository };
};

const allowedImplementationPath = (path, allowedPaths) =>
  allowedPaths.some((allowed) => allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed);

export const validateCurrentImplementationState = ({
  changedPaths,
  freezeIsHandoffAncestor,
  handoffIsCurrentAncestor,
  head,
  immutablePublicDiff,
  implementationAddedOrModifiedPaths,
  planIndexSource,
  planSource,
  profile,
  releaseIsFreezeAncestor,
  sourceSha,
  workflowSource,
}) => {
  assert.match(sourceSha, shaPattern, "invalid current source SHA");
  assert.equal(head, sourceSha, "checkout does not equal SOURCE_SHA");
  assert.equal(releaseIsFreezeAncestor, true, "v0.3 release is not an ancestor of the authenticated freeze");
  assert.equal(freezeIsHandoffAncestor, true, "authenticated freeze is not an ancestor of the green handoff");
  assert.equal(handoffIsCurrentAncestor, true, "green handoff is not an ancestor of the current head");
  assert.ok(Array.isArray(changedPaths) && changedPaths.length > 0, "implementation has no post-handoff change");
  assert.equal(new Set(changedPaths).size, changedPaths.length, "post-handoff path list contains duplicates");
  for (const path of changedPaths) {
    assert.equal(
      allowedImplementationPath(path, profile.implementationAllowedPaths),
      true,
      `post-handoff implementation contains a disallowed path: ${path}`,
    );
  }
  assert.deepEqual(
    sorted(implementationAddedOrModifiedPaths),
    sorted(profile.implementationFiles),
    "exactly the six implementation files must be added or changed",
  );
  assert.deepEqual(immutablePublicDiff, [], "an immutable public path changed after the handoff");
  assert.deepEqual(
    planSource.match(/^- Status:.*$/gm) ?? [],
    ["- Status: DONE"],
    "Plan 039 status is absent, contradictory, or ambiguous",
  );
  assert.equal(planSource.startsWith(exactPlan039StatusPrefix), true, "Plan 039 status metadata prefix drifted");
  assert.equal((planSource.match(/^## Status$/gm) ?? []).length, 1, "Plan 039 Status heading is ambiguous");
  assert.equal(
    (planSource.match(/^## Authority and objective$/gm) ?? []).length,
    1,
    "Plan 039 authority heading is ambiguous",
  );
  assert.deepEqual(
    planIndexSource.match(/^\| 039 \|.*$/gm) ?? [],
    ["| 039 | Implement the frozen core capability laws | P0 | XL | exact 0.4 surface freeze | DONE |"],
    "Plan 039 index row is absent, contradictory, or ambiguous",
  );
  assert.equal(
    planIndexSource.startsWith(exactPlanIndexSummaryPrefix),
    true,
    "Plan 039 index summary drifted or contradicts completion",
  );
  const workflowDigest = sha256(Buffer.from(workflowSource));
  assert.equal(workflowDigest, exactImplementationWorkflowDigest, "active implementation workflow bytes drifted");

  for (const forbidden of profile.forbiddenInvocations) {
    assert.equal(workflowSource.includes(forbidden), false, `active workflow invokes historical freeze code: ${forbidden}`);
  }
  for (const forbidden of [
    "surface-freeze",
    "plan039-phase-handoff",
    "RESEARCH_RECEIPTS_DIR",
    "run-receipt-producers.mjs",
    "validate-receipts.mjs",
  ]) assert.equal(workflowSource.includes(forbidden), false, `active workflow mixes a historical profile: ${forbidden}`);
  assert.equal(workflowSource.includes(profile.profileId), true, "active workflow does not bind the Plan 039 profile id");
  assert.equal(
    workflowSource.includes(profile.receiptDirectoryEnvironment),
    true,
    "active workflow does not bind the Plan 039 receipt directory",
  );
  assert.equal(workflowSource.includes("bun-version: 1.3.14"), true, "active workflow does not pin Bun 1.3.14");
  assert.equal(
    workflowSource.includes('test "$(bun --version)" = "1.3.14"'),
    true,
    "active workflow does not verify the selected Bun version",
  );
  const workflow = parseYaml(workflowSource);
  assert.deepEqual(Object.keys(workflow.jobs ?? {}), ["plan039-implementation"], "implementation job set drifted");
  const job = workflow.jobs["plan039-implementation"];
  assert.ok(job !== null && typeof job === "object", "implementation job is missing");
  assert.deepEqual(Object.keys(job).sort(), ["runs-on", "steps"], "implementation job can be skipped or altered");
  assert.equal(job["runs-on"], "ubuntu-24.04", "implementation runner drifted");
  assert.ok(Array.isArray(job.steps), "implementation steps are missing");
  const gateIndexes = requiredImplementationCommands.map((command) => {
    const matches = job.steps
      .map((step, index) => ({ index, step }))
      .filter(({ step }) => step?.run === command);
    assert.equal(matches.length, 1, `active workflow must run the required command exactly once: ${command}`);
    const [{ index, step }] = matches;
    for (const bypass of ["if", "continue-on-error", "shell", "working-directory"]) {
      assert.equal(Object.hasOwn(step, bypass), false, `required workflow gate has a bypass: ${command}`);
    }
    const expectedEnvironment = command === "bun install --frozen-lockfile"
      ? { BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/bun-install-cache" }
      : command === "node research/post-0.3/implementation/certify-current-head.mjs"
      ? {
        GITHUB_TOKEN: "${{ github.token }}",
        PLAN039_RECEIPTS_DIR: "${{ runner.temp }}/effect-build-plan039-implementation",
      }
      : undefined;
    assert.deepEqual(step.env, expectedEnvironment, `required workflow gate environment drifted: ${command}`);
    return index;
  });
  assert.deepEqual(
    gateIndexes,
    [...gateIndexes].sort((left, right) => left - right),
    "required implementation gates do not precede current-head certification",
  );

  return {
    ancestry: {
      releaseSha: profile.productionBaseline.releaseSha,
      freezeSha: profile.productionBaseline.freezeSha,
      handoffSha: profile.productionBaseline.handoffSha,
      currentSha: sourceSha,
    },
    changedPaths: sorted(changedPaths),
    implementationFiles: sorted(implementationAddedOrModifiedPaths),
    immutablePublicDiff,
    planStatus: "DONE",
    requiredCommands: requiredImplementationCommands,
    workflowDigest,
  };
};

export const expectedReceiptClaims = (expected) => expected.claims.map((claim) => ({
  id: claim.id,
  classification: claim.classification,
  conclusion: claim.conclusion,
  assertions: claim.assertions.map((name) => ({ name, passed: true })),
}));

export const validateCurrentReceipt = ({
  expected,
  freezeAnchor,
  handoffAnchor,
  profile,
  receipt,
  sourceSha,
}) => {
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1", "invalid implementation receipt schema");
  assert.equal(receipt.profileId, profile.profileId, "current receipt names another profile");
  assert.equal(receipt.id, "plan039-implementation", "current receipt id drifted");
  assert.equal(receipt.id, expected.receiptId, "current receipt differs from the expected claim set");
  assert.equal(receipt.sourceSha, sourceSha, "current receipt names another source");
  assert.equal(receipt.status, "reproduced", "current receipt is not reproduced");
  assert.deepEqual(receipt.claims, expectedReceiptClaims(expected), "current receipt claims drifted");
  assert.deepEqual(
    receipt.evidence?.historicalAuthority,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor }),
    "current receipt historical authority drifted",
  );
  assert.equal(receipt.evidence?.currentHead?.observedSha, sourceSha, "current remote evidence drifted");
  assert.equal(receipt.evidence?.repositoryScope?.planStatus, "DONE", "current implementation is not done");
  assert.deepEqual(
    receipt.evidence?.repositoryScope?.implementationFiles,
    sorted(profile.implementationFiles),
    "current receipt does not name the six implementation files",
  );
  assert.deepEqual(receipt.evidence?.repositoryScope?.immutablePublicDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.requiredCommands, requiredImplementationCommands);
  assert.equal(
    receipt.evidence?.repositoryScope?.workflowDigest,
    exactImplementationWorkflowDigest,
    "current receipt workflow digest drifted",
  );
  assert.deepEqual(receipt.evidence?.repositoryScope?.activeInstructions, {
    handoffSha: exactHandoffSha,
    path: "AGENTS.md",
    plan039: "DONE",
    nextPlan: "040",
    publicationAuthority: "NONE",
  }, "current receipt active-instruction scope drifted");
  assert.equal(receipt.evidence?.repositoryScope?.coreMigration?.authorityCount, 71);
  assert.equal(
    receipt.evidence?.repositoryScope?.coreMigration?.authoritySetSha256,
    "a0bdf3b59a1a85bbc448decd0186e29c0fabe7c04e3203ff6657af5f746bb3fe",
  );
  assert.deepEqual(receipt.evidence?.repositoryScope?.workspaceManifest, {
    handoffSha: profile.productionBaseline.handoffSha,
    path: "package.json",
    scriptAppends: exactWorkspaceManifest.scriptAppends,
  }, "current receipt workspace-manifest scope drifted");
  assert.equal(receipt.evidence?.profileSeparation?.currentProfileId, profile.profileId);
  assert.equal(receipt.evidence?.profileSeparation?.currentReceiptDirectoryEnvironment, "PLAN039_RECEIPTS_DIR");
  assert.deepEqual(receipt.evidence?.profileSeparation?.currentReceiptIds, ["plan039-implementation"]);
  assert.equal(receipt.evidence?.profileSeparation?.historicalArtifactsAreInputsOnly, true);
  assert.equal(
    profile.forbiddenCurrentReceiptIds.includes(receipt.id),
    false,
    "current receipt uses a historical receipt id",
  );
  assert.equal(receipt.evidence?.historicalAuthority?.freeze?.receipts, undefined);
  assert.equal(receipt.evidence?.historicalAuthority?.handoff?.receiptBytes, undefined);
  return receipt;
};

export const validateImplementationCertificate = ({
  certificate,
  currentReceiptDigest,
  expected,
  freezeAnchor,
  handoffAnchor,
  profile,
  sourceSha,
}) => {
  assert.equal(certificate.schema, "effect-build/implementation-certification@1");
  assert.equal(certificate.profileId, profile.profileId);
  assert.equal(certificate.plan, profile.plan);
  assert.equal(certificate.phase, "implementation");
  assert.equal(certificate.sourceSha, sourceSha);
  assert.equal(certificate.workflow?.repository, "mannyc2/effect-build", "implementation certificate repository drifted");
  assert.equal(
    certificate.workflow?.workflow,
    "plan-039-implementation-certification",
    "implementation certificate workflow drifted",
  );
  assert.match(certificate.workflow?.runId, /^[1-9][0-9]*$/, "implementation certificate run id is invalid");
  assert.match(certificate.workflow?.runAttempt, /^[1-9][0-9]*$/, "implementation certificate run attempt is invalid");
  assert.equal(
    certificate.workflow?.eventName === "push" || certificate.workflow?.eventName === "pull_request",
    true,
    "implementation certificate event is not a GitHub gate event",
  );
  assert.deepEqual(
    certificate.historicalInputs,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor }),
    "implementation certificate historical inputs drifted",
  );
  assert.deepEqual(certificate.currentReceipts, [{
    id: "plan039-implementation",
    file: "plan039-implementation.json",
    digest: currentReceiptDigest,
  }]);
  assert.equal(
    certificate.currentReceipts.some((receipt) => profile.forbiddenCurrentReceiptIds.includes(receipt.id)),
    false,
    "implementation certificate contains a historical receipt",
  );
  assert.equal(certificate.claims, expected.claims.length);
  assert.equal(certificate.result, "certified");
  return certificate;
};

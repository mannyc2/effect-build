import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const profilePath = "research/post-0.3/implementation/profile.json";
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
export const plan043CertificationBranch = "codex/plan043-node-sea-lane";
export const plan043CertificationRef = `refs/heads/${plan043CertificationBranch}`;

const exact = {
  release: "f06f96ca88b6278e5f23a898d758b99fa9322108",
  freeze: "a3017657e0851530892a9f3d2d55ac5736769881",
  handoff: "7de4ffe68931f721317f6be92aac1e01dae6e21e",
  plan039: "e12e930de5622be3f23814f3235293c93fcfd8bf",
  plan040: "3ced06d29fe8644eae5465fed4878a6faea322f3",
  plan041: "2048fcd4c49bc6e5b76cabceee33b36d9d5efb40",
  plan042: "9d15d17ccf7d74f14cf95c06162d95be8ed7d27f",
};

const exactDocumentDigests = {
  profile: "sha256:3acce5a36dbe87c28953a80e35f8dbbb5775de3fc74f2f09bfd175b2d1549ebe",
  expected: "sha256:14fbd07ba7fcbb62865dd1568e348482da067dbe2f387a02ac6f9438d3168af2",
  freezeAnchor: "sha256:bddbed308ae05697663b10a63234f52ee4e5b1baca919463da8edbf4aec16888",
  handoffAnchor: "sha256:601dc271d3deb50a6f0aeb69bc15e776ff9d8b1e05ccd9625bd3fd3108c0ab57",
  plan039Anchor: "sha256:bb954a00a206189b38b7e2b78fbe5178f6850a5f2191aa46387f39649b64265b",
  plan040Anchor: "sha256:8974166230c7878419496b6c4b7c9a62aa1e2878ef699e32dd92a336062251ff",
  plan041Anchor: "sha256:a8c7b5d7abd7447cf313f13baad354968d74b817853a9756f1421cc3357222a3",
  plan042Anchor: "sha256:e1db7fa2a63fd258491c275d6a243e9caeb6ee11f315c3df297989dabebd8fdd",
  migrationPlan: "sha256:6827f8f5c9198a5d7d9a175a3cd48b56b8f20e661a11c40ca9b3c5eaa4b5659c",
};

const exactImplementationWorkflowDigest = "sha256:c446f5f2f3156982a6deda6adf24939d73a8c703ecbac9ccb65982d03933d91a";

const exactDenoImplementationFiles = [
  "packages/effect-build-deno/src/CompileExecutable.ts",
  "packages/effect-build-deno/src/internal/v04/compatibility.ts",
  "packages/effect-build-deno/src/internal/v04/executable.ts",
  "packages/effect-build-deno/src/internal/v04/matrix.ts",
  "packages/effect-build-deno/src/internal/v04/selected.ts",
];

const exactNodeSeaImplementationFiles = [
  "packages/effect-build-node-sea/src/AssembleExecutable.ts",
  "packages/effect-build-node-sea/src/internal/v04/compatibility.ts",
  "packages/effect-build-node-sea/src/internal/v04/executable.ts",
  "packages/effect-build-node-sea/src/internal/v04/selected.ts",
];

const exactNodeSeaScopedPaths = [
  ...exactNodeSeaImplementationFiles,
  "test/architecture/v04-staged-node-sea-surface.test.ts",
  "test/fixtures/v04/node-sea/main.cjs",
  "test/fixtures/v04/node-sea/main.mjs",
  "test/fixtures/v04/node-sea/message.txt",
  "test/integration/v04-node-sea-assemble-executable.test.ts",
  "test/unit/v04-node-sea-assemble-executable.test.ts",
  "typetest/v04-node-sea-assemble-executable.tst.ts",
];

const exactNodeSeaCompanionPaths = [
  "package.json",
  "research/post-0.3/implementation/staged-node-sea-adapter.mjs",
  "test/architecture/import-boundaries.test.ts",
];

export const requiredImplementationCommands = [
  "bun install --frozen-lockfile",
  "node --test research/post-0.3/implementation/certification-contract.test.mjs",
  "bun run verify",
  "bun test research/post-0.3/r3-provider-compatibility.test.ts research/post-0.3/r4-author-laws.test.mjs",
  "node --test research/post-0.3/r7-matrix-laws.test.mjs",
  "node research/post-0.3/implementation/staged-external-author-adapter.mjs",
  "node research/post-0.3/implementation/staged-esbuild-adapter.mjs",
  "bun run test:integration:v04-bun",
  "node scripts/verify-v04-bun-target-support.mjs",
  "node research/post-0.3/implementation/staged-bun-adapter.mjs",
  "bun run test:integration:v04-deno",
  "node scripts/verify-v04-deno-target-support.mjs",
  "node research/post-0.3/implementation/staged-deno-adapter.mjs",
  "bun run test:integration:v04-node-sea",
  "node research/post-0.3/implementation/staged-node-sea-adapter.mjs",
  "node research/post-0.3/implementation/certify-current-head.mjs",
];

export const sourcePolicyVerifierPaths = [
  profilePath,
  "research/post-0.3/implementation/expected-claims.json",
  "research/post-0.3/implementation/plan042-trust-anchor.json",
  "research/post-0.3/implementation/certification-contract.mjs",
  "research/post-0.3/implementation/certify-current-head.mjs",
  "tooling/tool-pins.json",
  "scripts/read-tooling.mjs",
  "scripts/provision-tool-assets.mjs",
  ".github/workflows/architecture-research.yml",
];

export const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const sorted = (values) => [...values].sort();
const assertDigest = (value, message) => assert.match(value, digestPattern, message);
const assertSha = (value, message) => assert.match(value, shaPattern, message);
const unique = (values, message) => {
  assert.ok(Array.isArray(values) && values.length > 0, message);
  assert.equal(new Set(values).size, values.length, message);
  for (const value of values) assert.equal(typeof value === "string" && value.length > 0, true, message);
};

export const expectedReceiptClaims = (expected) => expected.claims.map((claim) => ({
  id: claim.id,
  classification: claim.classification,
  conclusion: claim.conclusion,
  assertions: claim.assertions.map((name) => ({ name, passed: true })),
}));

export const sourcePolicyVerifierOrigin = ({ documents, sourceSha }) => {
  assertSha(sourceSha, "invalid source policy/verifier SHA");
  assert.ok(Array.isArray(documents), "source policy/verifier documents are invalid");
  assert.deepEqual(
    documents.map(({ path }) => path),
    sourcePolicyVerifierPaths,
    "source policy/verifier document paths drifted",
  );
  for (const document of documents) {
    assert.deepEqual(Object.keys(document).sort(), ["digest", "path"]);
    assertDigest(document.digest, `invalid source policy/verifier digest: ${document.path}`);
  }
  return {
    schema: "effect-build/source-policy-verifier-origin@1",
    sourceSha,
    scope: "candidate-source-reproduction",
    independentlyProtected: false,
    independentAuthorityPrerequisite: "separately-reviewed-protected-workflow-or-app-with-an-externally-pinned-verifier",
    documents,
  };
};

export const validateSourcePolicyVerifierOrigin = (origin) => {
  const expected = sourcePolicyVerifierOrigin({
    documents: origin?.documents,
    sourceSha: origin?.sourceSha,
  });
  assert.deepEqual(origin, expected, "source policy/verifier origin drifted");
  return expected;
};

const validateHistoricalAnchors = ({ freezeAnchor, handoffAnchor, plan039Anchor }) => {
  assert.equal(freezeAnchor.sourceSha, exact.freeze);
  assert.equal(freezeAnchor.releaseSha, exact.release);
  assert.equal(freezeAnchor.workflow.conclusion, "success");
  assertDigest(freezeAnchor.aggregateArtifact.digest, "invalid freeze artifact digest");
  assert.equal(handoffAnchor.sourceSha, exact.handoff);
  assert.equal(handoffAnchor.freezeInput.sourceSha, exact.freeze);
  assert.equal(handoffAnchor.workflow.conclusion, "success");
  assert.equal(plan039Anchor.sourceSha, exact.plan039);
  assert.equal(plan039Anchor.releaseSha, exact.release);
  assert.equal(plan039Anchor.freezeSha, exact.freeze);
  assert.equal(plan039Anchor.handoffSha, exact.handoff);
  assert.equal(plan039Anchor.workflow.conclusion, "success");
  assertDigest(plan039Anchor.aggregateArtifact.digest, "invalid Plan 039 artifact digest");
  assertDigest(plan039Anchor.certification.digest, "invalid Plan 039 certificate digest");
  assertDigest(plan039Anchor.receipt.digest, "invalid Plan 039 receipt digest");
};

export const validatePlan040Anchor = ({ plan039Anchor, plan040Anchor }) => {
  assert.equal(plan040Anchor.schema, "effect-build/plan040-implementation-trust-anchor@1");
  assert.equal(plan040Anchor.profileId, "effect-build/plan040-implementation@1");
  assert.equal(plan040Anchor.sourceSha, exact.plan040);
  assert.deepEqual(
    {
      releaseSha: plan040Anchor.releaseSha,
      freezeSha: plan040Anchor.freezeSha,
      handoffSha: plan040Anchor.handoffSha,
      plan039Sha: plan040Anchor.plan039Sha,
    },
    { releaseSha: exact.release, freezeSha: exact.freeze, handoffSha: exact.handoff, plan039Sha: exact.plan039 },
  );
  assert.deepEqual(plan040Anchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-040-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32585389513",
    runAttempt: "1",
    eventName: "push",
    conclusion: "success",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32585389513",
  });
  assert.deepEqual(plan040Anchor.aggregateArtifact, {
    id: "9478924759",
    name: `plan040-implementation-certification-${exact.plan040}`,
    sizeInBytes: 4620,
    digest: "sha256:474cf45b62c3447e48a247940973f87bedab53c3a013d897ea069200dcb68ebc",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32585389513/artifacts/9478924759",
  });
  assert.deepEqual(plan040Anchor.certification, {
    file: "plan040-certification.json",
    schema: "effect-build/implementation-certification@1",
    digest: "sha256:e661ebe80b6c1d7cb739c85c319fb33c6942f1ea410239a8e459d61a2c423068",
    phase: "implementation",
    claims: 4,
    result: "certified",
  });
  assert.deepEqual(plan040Anchor.receipt, {
    id: "plan040-implementation",
    file: "plan040-implementation.json",
    digest: "sha256:6a893378814a6061a862fb8bffcdf20bf43d76c046bf53e8ac8efcc323a54f25",
  });
  assert.deepEqual(plan040Anchor.plan039Input, {
    profileId: plan039Anchor.profileId,
    sourceSha: plan039Anchor.sourceSha,
    aggregateArtifactId: plan039Anchor.aggregateArtifact.id,
    aggregateArtifactDigest: plan039Anchor.aggregateArtifact.digest,
    certificationDigest: plan039Anchor.certification.digest,
    receiptDigest: plan039Anchor.receipt.digest,
  });
  return plan040Anchor;
};

export const validatePlan041Anchor = ({ plan040Anchor, plan041Anchor }) => {
  assert.equal(plan041Anchor.schema, "effect-build/plan041-implementation-trust-anchor@1");
  assert.equal(plan041Anchor.profileId, "effect-build/plan041-implementation@1");
  assert.equal(plan041Anchor.sourceSha, exact.plan041);
  assert.deepEqual(
    {
      releaseSha: plan041Anchor.releaseSha,
      freezeSha: plan041Anchor.freezeSha,
      handoffSha: plan041Anchor.handoffSha,
      plan039Sha: plan041Anchor.plan039Sha,
      plan040Sha: plan041Anchor.plan040Sha,
    },
    {
      releaseSha: exact.release,
      freezeSha: exact.freeze,
      handoffSha: exact.handoff,
      plan039Sha: exact.plan039,
      plan040Sha: exact.plan040,
    },
  );
  assert.deepEqual(plan041Anchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-041-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32598492666",
    runAttempt: "1",
    eventName: "pull_request",
    conclusion: "success",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32598492666",
  });
  assert.deepEqual(plan041Anchor.aggregateArtifact, {
    id: "9482238619",
    name: `plan041-implementation-certification-${exact.plan041}`,
    sizeInBytes: 5885,
    digest: "sha256:4c54dc0458a5811ce5008795b3988427c8b98b5a902caae2ff968862dd27c545",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32598492666/artifacts/9482238619",
  });
  assert.deepEqual(plan041Anchor.certification, {
    file: "plan041-certification.json",
    schema: "effect-build/implementation-certification@1",
    digest: "sha256:9d0c9f14aee6bd3add8808b9f4084bcb2704b84d07206e24c3b27867da6c1ce6",
    phase: "implementation",
    claims: 4,
    result: "certified",
  });
  assert.deepEqual(plan041Anchor.receipt, {
    id: "plan041-implementation",
    file: "plan041-implementation.json",
    digest: "sha256:2d758590ad8ac9177d910fef64d26389e57e2f20592ca3a5e1de54fcb49ee3b4",
  });
  assert.deepEqual(plan041Anchor.plan040Input, {
    profileId: plan040Anchor.profileId,
    sourceSha: plan040Anchor.sourceSha,
    aggregateArtifactId: plan040Anchor.aggregateArtifact.id,
    aggregateArtifactDigest: plan040Anchor.aggregateArtifact.digest,
    certificationDigest: plan040Anchor.certification.digest,
    receiptDigest: plan040Anchor.receipt.digest,
  });
  return plan041Anchor;
};

export const validatePlan042Anchor = ({ plan041Anchor, plan042Anchor }) => {
  assert.equal(plan042Anchor.schema, "effect-build/plan042-implementation-trust-anchor@1");
  assert.equal(plan042Anchor.profileId, "effect-build/plan042-implementation@1");
  assert.equal(plan042Anchor.sourceSha, exact.plan042);
  assert.deepEqual(
    {
      releaseSha: plan042Anchor.releaseSha,
      freezeSha: plan042Anchor.freezeSha,
      handoffSha: plan042Anchor.handoffSha,
      plan039Sha: plan042Anchor.plan039Sha,
      plan040Sha: plan042Anchor.plan040Sha,
      plan041Sha: plan042Anchor.plan041Sha,
    },
    {
      releaseSha: exact.release,
      freezeSha: exact.freeze,
      handoffSha: exact.handoff,
      plan039Sha: exact.plan039,
      plan040Sha: exact.plan040,
      plan041Sha: exact.plan041,
    },
  );
  assert.deepEqual(plan042Anchor.workflow, {
    repository: "mannyc2/effect-build",
    name: "plan-042-implementation-certification",
    path: ".github/workflows/architecture-research.yml",
    runId: "32603983985",
    runAttempt: "1",
    eventName: "push",
    ref: "refs/heads/codex/plan042-deno-lane",
    conclusion: "success",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32603983985",
  });
  assert.deepEqual(plan042Anchor.aggregateArtifact, {
    id: "9483687179",
    name: `plan042-implementation-certification-${exact.plan042}`,
    sizeInBytes: 7798,
    digest: "sha256:c06530be389696e96ed7996e0e80eee9fb2ece23cccb06b5ceadb1499b1c62fe",
    url: "https://github.com/mannyc2/effect-build/actions/runs/32603983985/artifacts/9483687179",
  });
  assert.deepEqual(plan042Anchor.certification, {
    file: "plan042-certification.json",
    schema: "effect-build/implementation-certification@1",
    digest: "sha256:6ee3b724c2ff73a229dcad59da7f5d9c3f80d9a2140d9f115f83e350b217a779",
    phase: "implementation",
    claims: 5,
    result: "certified",
  });
  assert.deepEqual(plan042Anchor.receipt, {
    id: "plan042-implementation",
    file: "plan042-implementation.json",
    digest: "sha256:545275dfc5d081887882dd02f9cb54843994cab538141c2229e66db3f0c72ddc",
  });
  assert.deepEqual(plan042Anchor.plan041Input, {
    profileId: plan041Anchor.profileId,
    sourceSha: plan041Anchor.sourceSha,
    aggregateArtifactId: plan041Anchor.aggregateArtifact.id,
    aggregateArtifactDigest: plan041Anchor.aggregateArtifact.digest,
    certificationDigest: plan041Anchor.certification.digest,
    receiptDigest: plan041Anchor.receipt.digest,
  });
  return plan042Anchor;
};

export const validateProfileDocuments = (documents) => {
  const {
    expected,
    freezeAnchor,
    handoffAnchor,
    migrationPlan,
    plan039Anchor,
    plan040Anchor,
    plan041Anchor,
    plan042Anchor,
    profile,
  } = documents;
  validateHistoricalAnchors({ freezeAnchor, handoffAnchor, plan039Anchor });
  validatePlan040Anchor({ plan039Anchor, plan040Anchor });
  validatePlan041Anchor({ plan040Anchor, plan041Anchor });
  validatePlan042Anchor({ plan041Anchor, plan042Anchor });
  assert.equal(profile.schema, "effect-build/implementation-certification-profile@2");
  assert.equal(profile.profileId, "effect-build/plan043-implementation@1");
  assert.equal(profile.plan, "043");
  assert.equal(profile.phase, "implementation");
  assert.equal(profile.receiptDirectoryEnvironment, "PLAN043_RECEIPTS_DIR");
  assert.equal(profile.certificateFile, "plan043-certification.json");
  assert.equal(profile.plan041TrustAnchor, "research/post-0.3/implementation/plan041-trust-anchor.json");
  assert.equal(profile.plan042TrustAnchor, "research/post-0.3/implementation/plan042-trust-anchor.json");
  assert.deepEqual(profile.productionBaseline, {
    releaseSha: exact.release,
    freezeSha: exact.freeze,
    handoffSha: exact.handoff,
    plan039Sha: exact.plan039,
    plan040Sha: exact.plan040,
    plan041Sha: exact.plan041,
    plan042Sha: exact.plan042,
  });
  unique(profile.implementationAllowedPaths, "implementation allowlist is invalid");
  unique(profile.denoImplementationFiles, "Deno implementation file set is invalid");
  unique(profile.nodeSeaImplementationFiles, "Node SEA implementation file set is invalid");
  unique(profile.nodeSeaScopedPaths, "Node SEA scoped path set is invalid");
  unique(profile.nodeSeaCompanionPaths, "Node SEA companion path set is invalid");
  unique(profile.bunImplementationFiles, "Bun implementation file set is invalid");
  unique(profile.esbuildImplementationFiles, "Esbuild implementation file set is invalid");
  unique(profile.coreStagedFiles, "core staged file set is invalid");
  unique(profile.immutablePublicPaths, "immutable public path set is invalid");
  assert.deepEqual(profile.denoImplementationFiles, exactDenoImplementationFiles);
  assert.deepEqual(profile.nodeSeaImplementationFiles, exactNodeSeaImplementationFiles);
  assert.deepEqual(profile.nodeSeaScopedPaths, exactNodeSeaScopedPaths);
  assert.deepEqual(profile.nodeSeaCompanionPaths, exactNodeSeaCompanionPaths);
  assert.deepEqual(profile.currentReceiptIds, ["plan043-implementation"]);
  assert.equal(profile.forbiddenCurrentReceiptIds.includes("plan042-implementation"), true);
  assert.equal(profile.producers.length, 1);
  assert.deepEqual(profile.producers[0].receipts, profile.currentReceiptIds);
  assert.equal(expected.schema, "effect-build/expected-implementation-claims@1");
  assert.equal(expected.profileId, profile.profileId);
  assert.equal(expected.receiptId, profile.currentReceiptIds[0]);
  assert.equal(expected.claims.length, 5);
  for (const claim of expected.claims) {
    assert.ok(["established", "sequenced"].includes(claim.classification));
    unique(claim.assertions, `claim ${claim.id} has invalid assertions`);
  }
  assert.equal(migrationPlan.schema, "effect-build/plan039-core-migration@1");
  return documents;
};

export const loadProfileDocuments = async (repository) => {
  const authenticatedJson = async (path, digest, label) => {
    const bytes = await readFile(resolve(repository, path));
    assert.equal(sha256(bytes), digest, `${label} bytes drifted`);
    return JSON.parse(bytes.toString("utf8"));
  };
  const profile = await authenticatedJson(profilePath, exactDocumentDigests.profile, "implementation profile");
  const documents = {
    profile,
    freezeAnchor: await authenticatedJson(profile.trustAnchor, exactDocumentDigests.freezeAnchor, "freeze trust anchor"),
    handoffAnchor: await authenticatedJson(profile.handoffTrustAnchor, exactDocumentDigests.handoffAnchor, "handoff trust anchor"),
    plan039Anchor: await authenticatedJson(profile.plan039TrustAnchor, exactDocumentDigests.plan039Anchor, "Plan 039 trust anchor"),
    plan040Anchor: await authenticatedJson(profile.plan040TrustAnchor, exactDocumentDigests.plan040Anchor, "Plan 040 trust anchor"),
    plan041Anchor: await authenticatedJson(profile.plan041TrustAnchor, exactDocumentDigests.plan041Anchor, "Plan 041 trust anchor"),
    plan042Anchor: await authenticatedJson(profile.plan042TrustAnchor, exactDocumentDigests.plan042Anchor, "Plan 042 trust anchor"),
    expected: await authenticatedJson(profile.expectedClaims, exactDocumentDigests.expected, "expected claims"),
    migrationPlan: await authenticatedJson(profile.migrationPlan, exactDocumentDigests.migrationPlan, "core migration plan"),
  };
  return validateProfileDocuments(documents);
};

export const validateWorkspaceManifest = ({ currentManifest, handoffManifest, profile }) => {
  const expected = structuredClone(handoffManifest);
  for (const [name, append] of Object.entries(profile.workspaceManifest.scriptAppends)) {
    assert.equal(typeof expected.scripts[name], "string", `handoff script missing: ${name}`);
    expected.scripts[name] += append;
  }
  for (const [name, value] of Object.entries(profile.workspaceManifest.scriptAdds)) {
    assert.equal(expected.scripts[name], undefined, `new script already existed at handoff: ${name}`);
    expected.scripts[name] = value;
  }
  assert.deepEqual(currentManifest, expected, "workspace manifest drifted outside exact Plan 043 registrations");
  return { handoffSha: profile.productionBaseline.handoffSha, ...profile.workspaceManifest };
};

export const validateActiveInstructions = ({ currentInstructions, handoffInstructions }) => {
  assert.equal(handoffInstructions.includes("Plan 039 is ready to begin"), true);
  assert.equal(currentInstructions.includes("Plans 039, 040, 041, 042, and 043 are complete"), true);
  assert.equal(currentInstructions.includes("Plan 044 is ready to begin"), true);
  assert.equal(currentInstructions.includes("publication"), true);
  return {
    handoffSha: exact.handoff,
    path: "AGENTS.md",
    completedPlans: ["039", "040", "041", "042", "043"],
    nextPlan: "044",
    publicationAuthority: "NONE",
  };
};

const pathAllowed = (path, allowed) => allowed.some((entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry);

const denoEnvironment = {
  PLAN042_DENO_EXECUTABLE: "${{ steps.deno-tools.outputs.deno }}",
  DENORT_BIN: "${{ steps.deno-tools.outputs.denort }}",
  DENO_DIR: "${{ runner.temp }}/effect-build-plan042-deno-cache",
};

const nodeEnvironment = {
  PLAN043_NODE_EXECUTABLE: "${{ steps.plan043-node.outputs.node }}",
};

const validateNodeSeaCompanions = ({ importBoundarySource, nodeSeaConsumerSource, paths, profile }) => {
  assert.deepEqual(
    sorted(paths),
    sorted(profile.nodeSeaCompanionPaths),
    "Node SEA registrations and staged consumer must be the exact Plan 043 companion paths",
  );
  assert.deepEqual(
    [...importBoundarySource.matchAll(/"packages\/effect-build-node-sea\/src\/(?:AssembleExecutable|internal\/v04\/selected)\.ts"/g)]
      .map((match) => match[0])
      .sort(),
    [
      '"packages/effect-build-node-sea/src/AssembleExecutable.ts"',
      '"packages/effect-build-node-sea/src/internal/v04/selected.ts"',
    ],
    "Node SEA process ownership registration drifted",
  );
  for (const required of [
    "PLAN043_NODE_EXECUTABLE",
    "effect-build-node-sea/AssembleExecutable",
    'releasedManifest.exports["./AssembleExecutable"] === undefined',
    "EFFECT_BUILD_PLAN043_STAGED_NODE_SEA_CONSUMER=passed",
  ]) assert.equal(nodeSeaConsumerSource.includes(required), true, `staged Node SEA consumer drifted: ${required}`);
};

export const validateCurrentImplementationState = (input) => {
  const {
    bunStagedDiff,
    changedPaths,
    coreStagedDiff,
    denoStagedDiff,
    esbuildStagedDiff,
    head,
    immutablePublicDiff,
    nodeSeaCompanionAddedOrModifiedPaths,
    nodeSeaScopedAddedOrModifiedPaths,
    importBoundarySource,
    nodeSeaConsumerSource,
    planIndexSource,
    planSource,
    profile,
    sourceSha,
    workflowSource,
  } = input;
  assertSha(sourceSha, "invalid current source SHA");
  assert.equal(head, sourceSha, "checkout differs from source SHA");
  assert.deepEqual(input.ancestry, {
    releaseIsFreezeAncestor: true,
    freezeIsHandoffAncestor: true,
    handoffIsPlan039Ancestor: true,
    plan039IsPlan040Ancestor: true,
    plan040IsPlan041Ancestor: true,
    plan041IsPlan042Ancestor: true,
    plan042IsCurrentAncestor: true,
  }, "implementation ancestry is not linear");
  assert.deepEqual(coreStagedDiff, [], "Plan 039 core changed during Plan 043");
  assert.deepEqual(esbuildStagedDiff, [], "Plan 040 Esbuild changed during Plan 043");
  assert.deepEqual(bunStagedDiff, [], "Plan 041 Bun changed during Plan 043");
  assert.deepEqual(denoStagedDiff, [], "Plan 042 Deno changed during Plan 043");
  assert.deepEqual(immutablePublicDiff, [], "released 0.3 public path changed during Plan 043");
  assert.ok(Array.isArray(changedPaths) && changedPaths.length > 0, "implementation has no post-handoff change");
  assert.equal(new Set(changedPaths).size, changedPaths.length, "post-handoff path list contains duplicates");
  assert.deepEqual(
    sorted(nodeSeaScopedAddedOrModifiedPaths),
    sorted(profile.nodeSeaScopedPaths),
    "exactly the eleven Node SEA scoped paths must be added after Plan 042",
  );
  validateNodeSeaCompanions({
    importBoundarySource,
    nodeSeaConsumerSource,
    paths: nodeSeaCompanionAddedOrModifiedPaths,
    profile,
  });
  for (const path of changedPaths) assert.equal(pathAllowed(path, profile.implementationAllowedPaths), true, `path outside implementation scope: ${path}`);
  assert.deepEqual(planSource.match(/^- Status:.*$/gm) ?? [], ["- Status: DONE"], "Plan 043 status is ambiguous");
  assert.deepEqual(
    planIndexSource.match(/^\| 042 \|.*$/gm) ?? [],
    ["| 042 | Implement the frozen Deno executable lane | P1 | L | 039 | DONE |"],
    "Plan 042 index status drifted",
  );
  assert.deepEqual(
    planIndexSource.match(/^\| 043 \|.*$/gm) ?? [],
    ["| 043 | Implement direct Node SEA assembly | P1 | L | 039 | DONE |"],
    "Plan 043 index status drifted",
  );
  assert.deepEqual(
    planIndexSource.match(/^\| 044 \|.*$/gm) ?? [],
    ["| 044 | Hard-cut and certify the frozen 0.4 candidate | P0 | XL | 039-043 | TODO |"],
    "Plan 044 index status drifted",
  );
  assert.equal(planIndexSource.includes("Plan 044 is the next"), true, "Plan 044 is not the documented next plan");
  const workflowDigest = sha256(Buffer.from(workflowSource));
  assert.equal(workflowDigest, exactImplementationWorkflowDigest, "active implementation workflow bytes drifted");
  for (const forbidden of profile.forbiddenInvocations) {
    assert.equal(workflowSource.includes(forbidden), false, `active workflow invokes historical code: ${forbidden}`);
  }
  for (const forbidden of [
    "surface-freeze",
    "plan039-phase-handoff",
    "RESEARCH_RECEIPTS_DIR",
    "run-receipt-producers.mjs",
    "validate-receipts.mjs",
    "PLAN040_RECEIPTS_DIR",
    "PLAN041_RECEIPTS_DIR",
    "PLAN042_RECEIPTS_DIR",
  ]) assert.equal(workflowSource.includes(forbidden), false, `active workflow mixes historical authority: ${forbidden}`);
  const workflow = parseYaml(workflowSource);
  assert.deepEqual(Object.keys(workflow.on ?? {}).sort(), ["push"]);
  assert.deepEqual(workflow.on.push, { branches: [plan043CertificationBranch] });
  assert.deepEqual(workflow.permissions, { actions: "read", contents: "read" });
  assert.deepEqual(workflow.env, {
    SOURCE_SHA: "${{ github.sha }}",
    CERTIFICATION_PROFILE: profile.profileId,
  });
  assert.equal(workflow.name, "plan-043-implementation-certification");
  assert.deepEqual(Object.keys(workflow.jobs), ["plan043-implementation"]);
  const job = workflow.jobs["plan043-implementation"];
  assert.deepEqual(Object.keys(job).sort(), ["runs-on", "steps"], "implementation job can be skipped or altered");
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.ok(Array.isArray(job.steps));
  const bunProvision = job.steps.find((step) => step?.id === "plan041-bun");
  assert.deepEqual(bunProvision, {
    id: "plan041-bun",
    name: "Provision the exact content-authenticated Bun provider coordinate",
    shell: "bash",
    run: 'node scripts/provision-tool-assets.mjs --only bun >> "$GITHUB_OUTPUT"',
    env: { EFFECT_BUILD_TOOL_DIR: "${{ runner.temp }}/effect-build-plan041-bun" },
  });
  const bunVerification = job.steps.find((step) =>
    step?.name === "Verify exact content-authenticated Bun provider coordinate"
  );
  assert.deepEqual(bunVerification?.env, { PLAN041_BUN_EXECUTABLE: "${{ steps.plan041-bun.outputs.bun }}" });
  assert.equal(
    bunVerification?.run,
    [
      'test "${PLAN041_BUN_EXECUTABLE#/}" != "$PLAN041_BUN_EXECUTABLE"',
      'test -x "$PLAN041_BUN_EXECUTABLE"',
      'test "$("$PLAN041_BUN_EXECUTABLE" --version)" = "1.3.9"',
      'echo "PLAN041_BUN_EXECUTABLE=$PLAN041_BUN_EXECUTABLE" >> "$GITHUB_ENV"',
      "",
    ].join("\n"),
  );
  assert.equal(workflowSource.includes("npm install --prefix"), false, "Bun provider must not be provisioned from npm");
  const denoVerification = job.steps.find((step) => step?.name === "Verify exact Deno and denort participant selection");
  assert.deepEqual(denoVerification, {
    name: "Verify exact Deno and denort participant selection",
    shell: "bash",
    env: {
      DENO: "${{ steps.deno-tools.outputs.deno }}",
      DENORT: "${{ steps.deno-tools.outputs.denort }}",
    },
    run: [
      'test "${DENO#/}" != "$DENO"',
      'test "${DENORT#/}" != "$DENORT"',
      'test -x "$DENO"',
      'test -x "$DENORT"',
      'test "$("$DENO" --version | sed -n \'1s/^deno \\([^[:space:]]*\\).*$/\\1/p\')" = "2.9.3"',
      "",
    ].join("\n"),
  });
  const nodeProvision = job.steps.find((step) => step?.id === "plan043-node");
  assert.deepEqual(nodeProvision, {
    id: "plan043-node",
    name: "Provision the exact content-authenticated Node SEA provider coordinate",
    shell: "bash",
    run: 'node scripts/provision-tool-assets.mjs --only node >> "$GITHUB_OUTPUT"',
    env: { EFFECT_BUILD_TOOL_DIR: "${{ runner.temp }}/effect-build-plan043-node" },
  });
  const nodeVerification = job.steps.find((step) =>
    step?.name === "Verify exact content-authenticated Node SEA provider coordinate"
  );
  assert.deepEqual(nodeVerification, {
    name: "Verify exact content-authenticated Node SEA provider coordinate",
    shell: "bash",
    env: nodeEnvironment,
    run: [
      'test "${PLAN043_NODE_EXECUTABLE#/}" != "$PLAN043_NODE_EXECUTABLE"',
      'test -x "$PLAN043_NODE_EXECUTABLE"',
      'test "$("$PLAN043_NODE_EXECUTABLE" --version)" = "v26.7.0"',
      "grep -qx 'ID=ubuntu' /etc/os-release",
      "grep -Eq '^VERSION_ID=\"?24\\.04\"?$' /etc/os-release",
      "file \"$PLAN043_NODE_EXECUTABLE\" | grep -F 'ELF 64-bit LSB' >/dev/null",
      "file \"$PLAN043_NODE_EXECUTABLE\" | grep -F 'x86-64' >/dev/null",
      "readelf -h \"$PLAN043_NODE_EXECUTABLE\" | grep -Eq 'Class:[[:space:]]+ELF64'",
      "readelf -h \"$PLAN043_NODE_EXECUTABLE\" | grep -Eq 'Machine:[[:space:]]+Advanced Micro Devices X86-64'",
      "readelf -l \"$PLAN043_NODE_EXECUTABLE\" | grep -F 'Requesting program interpreter: /lib64/ld-linux-x86-64.so.2' >/dev/null",
      '"$PLAN043_NODE_EXECUTABLE" --help | grep -Eq \'(^|[[:space:]])--build-sea([=[:space:]]|$)\'',
      'test "$("$PLAN043_NODE_EXECUTABLE" -p \'process.config.variables.single_executable_application\')" = "true"',
      'test "$("$PLAN043_NODE_EXECUTABLE" -p \'process.config.variables.node_use_lief\')" = "true"',
      "",
    ].join("\n"),
  });
  const gateIndexes = requiredImplementationCommands.map((command) => {
    const matches = job.steps
      .map((step, index) => ({ index, step }))
      .filter(({ step }) => step?.run === command);
    assert.equal(matches.length, 1, `required workflow gate must appear exactly once: ${command}`);
    const [{ index, step }] = matches;
    for (const bypass of ["if", "continue-on-error", "shell", "working-directory"]) {
      assert.equal(Object.hasOwn(step, bypass), false, `required workflow gate has a bypass: ${command}`);
    }
    const expectedEnvironment = command === "bun install --frozen-lockfile"
      ? { BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/bun-install-cache" }
      : command === "node research/post-0.3/implementation/certify-current-head.mjs"
      ? {
        GITHUB_TOKEN: "${{ github.token }}",
        PLAN043_RECEIPTS_DIR: "${{ runner.temp }}/effect-build-plan043-implementation",
      }
      : [
        "bun run test:integration:v04-deno",
      ].includes(command)
      ? denoEnvironment
      : command === "node research/post-0.3/implementation/staged-deno-adapter.mjs"
      ? { ...denoEnvironment, DENO_DIR: "${{ runner.temp }}/effect-build-plan042-deno-consumer-cache" }
      : [
        "bun run test:integration:v04-node-sea",
        "node research/post-0.3/implementation/staged-node-sea-adapter.mjs",
      ].includes(command)
      ? nodeEnvironment
      : undefined;
    assert.deepEqual(step.env, expectedEnvironment, `required workflow gate environment drifted: ${command}`);
    return index;
  });
  assert.deepEqual(gateIndexes, [...gateIndexes].sort((left, right) => left - right), "required gates are out of order");
  return {
    ancestry: { ...profile.productionBaseline, currentSha: sourceSha },
    changedPaths: sorted(changedPaths),
    coreStagedDiff,
    denoStagedDiff,
    esbuildStagedDiff,
    bunStagedDiff,
    implementationFiles: sorted(profile.nodeSeaScopedPaths),
    nodeSeaCompanionPaths: sorted(nodeSeaCompanionAddedOrModifiedPaths),
    immutablePublicDiff,
    planStatus: "DONE",
    requiredCommands: requiredImplementationCommands,
    workflowDigest,
  };
};

export const validateCurrentRemoteEvidence = (evidence) => {
  assert.equal(evidence.eventSourceSha, evidence.sourceSha);
  assert.equal(evidence.observedSha, evidence.sourceSha);
  assert.equal(evidence.repository, "mannyc2/effect-build");
  assert.equal(evidence.eventName, "push");
  assert.equal(evidence.ref, plan043CertificationRef);
  assert.equal(evidence.refType, "branch");
  assert.equal(evidence.observedRef, plan043CertificationRef);
  return {
    eventName: evidence.eventName,
    eventSourceSha: evidence.eventSourceSha,
    observedRef: evidence.observedRef,
    observedSha: evidence.observedSha,
    repository: evidence.repository,
    ref: evidence.ref,
    refType: evidence.refType,
  };
};

export const validatePlan041Api = ({ artifact, plan041Anchor, run }) => {
  assert.equal(String(run.id), plan041Anchor.workflow.runId);
  assert.equal(String(run.run_attempt), plan041Anchor.workflow.runAttempt);
  assert.equal(run.name, plan041Anchor.workflow.name);
  assert.equal(run.path, plan041Anchor.workflow.path);
  assert.equal(run.event, plan041Anchor.workflow.eventName);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(run.head_sha, plan041Anchor.sourceSha);
  assert.equal(run.repository?.full_name, plan041Anchor.workflow.repository);
  assert.equal(String(artifact.id), plan041Anchor.aggregateArtifact.id);
  assert.equal(artifact.name, plan041Anchor.aggregateArtifact.name);
  assert.equal(artifact.size_in_bytes, plan041Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(artifact.digest, plan041Anchor.aggregateArtifact.digest);
  assert.equal(artifact.expired, false);
  assert.equal(String(artifact.workflow_run.id), plan041Anchor.workflow.runId);
  assert.equal(artifact.workflow_run.head_sha, plan041Anchor.sourceSha);
};

export const validatePlan041Archive = ({ archiveBytes, certificateBytes, entries, plan041Anchor, receiptBytes }) => {
  assert.equal(archiveBytes.byteLength, plan041Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(sha256(archiveBytes), plan041Anchor.aggregateArtifact.digest);
  assert.deepEqual(sorted(entries), sorted([plan041Anchor.certification.file, plan041Anchor.receipt.file]));
  assert.equal(sha256(certificateBytes), plan041Anchor.certification.digest);
  assert.equal(sha256(receiptBytes), plan041Anchor.receipt.digest);
  const certificate = JSON.parse(certificateBytes);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(certificate.profileId, plan041Anchor.profileId);
  assert.equal(certificate.sourceSha, plan041Anchor.sourceSha);
  assert.equal(certificate.result, "certified");
  assert.equal(receipt.profileId, plan041Anchor.profileId);
  assert.equal(receipt.id, plan041Anchor.receipt.id);
  assert.equal(receipt.sourceSha, plan041Anchor.sourceSha);
  assert.equal(receipt.status, "reproduced");
  return { certificate, receipt, sourceSha: plan041Anchor.sourceSha };
};

export const validatePlan042Api = ({ artifact, plan042Anchor, run }) => {
  assert.equal(String(run.id), plan042Anchor.workflow.runId);
  assert.equal(String(run.run_attempt), plan042Anchor.workflow.runAttempt);
  assert.equal(run.name, plan042Anchor.workflow.name);
  assert.equal(run.path, plan042Anchor.workflow.path);
  assert.equal(run.event, plan042Anchor.workflow.eventName);
  assert.equal(run.head_branch, plan042Anchor.workflow.ref.slice("refs/heads/".length));
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(run.head_sha, plan042Anchor.sourceSha);
  assert.equal(run.repository?.full_name, plan042Anchor.workflow.repository);
  assert.equal(run.head_repository?.full_name, plan042Anchor.workflow.repository);
  assert.equal(String(artifact.id), plan042Anchor.aggregateArtifact.id);
  assert.equal(artifact.name, plan042Anchor.aggregateArtifact.name);
  assert.equal(artifact.size_in_bytes, plan042Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(artifact.digest, plan042Anchor.aggregateArtifact.digest);
  assert.equal(artifact.expired, false);
  assert.equal(String(artifact.workflow_run.id), plan042Anchor.workflow.runId);
  assert.equal(artifact.workflow_run.head_sha, plan042Anchor.sourceSha);
  assert.equal(artifact.workflow_run.head_branch, plan042Anchor.workflow.ref.slice("refs/heads/".length));
};

export const validatePlan042Archive = ({ archiveBytes, certificateBytes, entries, plan042Anchor, receiptBytes }) => {
  assert.equal(archiveBytes.byteLength, plan042Anchor.aggregateArtifact.sizeInBytes);
  assert.equal(sha256(archiveBytes), plan042Anchor.aggregateArtifact.digest);
  assert.deepEqual(sorted(entries), sorted([plan042Anchor.certification.file, plan042Anchor.receipt.file]));
  assert.equal(sha256(certificateBytes), plan042Anchor.certification.digest);
  assert.equal(sha256(receiptBytes), plan042Anchor.receipt.digest);
  const certificate = JSON.parse(certificateBytes);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(certificate.schema, plan042Anchor.certification.schema);
  assert.equal(certificate.profileId, plan042Anchor.profileId);
  assert.equal(certificate.plan, "042");
  assert.equal(certificate.phase, plan042Anchor.certification.phase);
  assert.equal(certificate.sourceSha, plan042Anchor.sourceSha);
  assert.equal(certificate.workflow?.workflow, plan042Anchor.workflow.name);
  assert.equal(certificate.workflow?.runId, plan042Anchor.workflow.runId);
  assert.equal(certificate.workflow?.runAttempt, plan042Anchor.workflow.runAttempt);
  assert.equal(certificate.workflow?.eventName, plan042Anchor.workflow.eventName);
  assert.equal(certificate.workflow?.ref, plan042Anchor.workflow.ref);
  assert.equal(certificate.workflow?.refType, "branch");
  assert.equal(certificate.claims, plan042Anchor.certification.claims);
  assert.equal(certificate.result, plan042Anchor.certification.result);
  assert.equal(certificate.historicalInputs?.plan041?.profileId, plan042Anchor.plan041Input.profileId);
  assert.equal(certificate.historicalInputs?.plan041?.sourceSha, plan042Anchor.plan041Input.sourceSha);
  assert.equal(
    certificate.historicalInputs?.plan041?.aggregateArtifact?.id,
    plan042Anchor.plan041Input.aggregateArtifactId,
  );
  assert.equal(
    certificate.historicalInputs?.plan041?.aggregateArtifact?.digest,
    plan042Anchor.plan041Input.aggregateArtifactDigest,
  );
  assert.equal(
    certificate.historicalInputs?.plan041?.certification?.digest,
    plan042Anchor.plan041Input.certificationDigest,
  );
  assert.equal(certificate.historicalInputs?.plan041?.receipt?.digest, plan042Anchor.plan041Input.receiptDigest);
  assert.equal(certificate.sourcePolicyVerifierOrigin?.independentlyProtected, false);
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1");
  assert.equal(receipt.profileId, plan042Anchor.profileId);
  assert.equal(receipt.id, plan042Anchor.receipt.id);
  assert.equal(receipt.sourceSha, plan042Anchor.sourceSha);
  assert.equal(receipt.status, "reproduced");
  assert.equal(receipt.evidence?.plan041Artifact?.sourceSha, plan042Anchor.plan041Input.sourceSha);
  assert.equal(receipt.evidence?.plan041Artifact?.transport, "github-api");
  assert.equal(receipt.evidence?.sourcePolicyVerifierOrigin?.independentlyProtected, false);
  return { certificate, receipt, sourceSha: plan042Anchor.sourceSha };
};

export const historicalAuthoritySummary = ({
  freezeAnchor,
  handoffAnchor,
  plan039Anchor,
  plan040Anchor,
  plan041Anchor,
  plan042Anchor,
}) => ({
  freeze: { profileId: freezeAnchor.profileId, sourceSha: freezeAnchor.sourceSha, aggregateArtifact: freezeAnchor.aggregateArtifact, certification: freezeAnchor.certification },
  handoff: { profileId: handoffAnchor.profileId, sourceSha: handoffAnchor.sourceSha, workflow: handoffAnchor.workflow, aggregateArtifact: handoffAnchor.aggregateArtifact, certification: handoffAnchor.certification, receipt: handoffAnchor.receipt },
  plan039: { profileId: plan039Anchor.profileId, sourceSha: plan039Anchor.sourceSha, workflow: plan039Anchor.workflow, aggregateArtifact: plan039Anchor.aggregateArtifact, certification: plan039Anchor.certification, receipt: plan039Anchor.receipt },
  plan040: { profileId: plan040Anchor.profileId, sourceSha: plan040Anchor.sourceSha, workflow: plan040Anchor.workflow, aggregateArtifact: plan040Anchor.aggregateArtifact, certification: plan040Anchor.certification, receipt: plan040Anchor.receipt },
  plan041: { profileId: plan041Anchor.profileId, sourceSha: plan041Anchor.sourceSha, workflow: plan041Anchor.workflow, aggregateArtifact: plan041Anchor.aggregateArtifact, certification: plan041Anchor.certification, receipt: plan041Anchor.receipt },
  plan042: { profileId: plan042Anchor.profileId, sourceSha: plan042Anchor.sourceSha, workflow: plan042Anchor.workflow, aggregateArtifact: plan042Anchor.aggregateArtifact, certification: plan042Anchor.certification, receipt: plan042Anchor.receipt },
});

export const validateCurrentReceipt = ({
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
}) => {
  assert.equal(receipt.schema, "effect-build/implementation-receipt@1");
  assert.equal(receipt.profileId, profile.profileId);
  assert.equal(receipt.id, expected.receiptId);
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.status, "reproduced");
  assert.deepEqual(receipt.claims, expectedReceiptClaims(expected));
  assert.deepEqual(
    receipt.evidence?.historicalAuthority,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor, plan041Anchor, plan042Anchor }),
    "current receipt historical authority drifted",
  );
  assert.deepEqual(receipt.evidence?.plan042Artifact, { sourceSha: plan042Anchor.sourceSha, transport: "github-api" });
  assert.equal(receipt.evidence?.currentHead?.observedSha, sourceSha);
  assert.equal(receipt.evidence?.currentHead?.repository, plan042Anchor.workflow.repository);
  const policyVerifierOrigin = validateSourcePolicyVerifierOrigin(receipt.evidence?.sourcePolicyVerifierOrigin);
  assert.equal(policyVerifierOrigin.sourceSha, sourceSha);
  assert.equal(receipt.evidence?.repositoryScope?.planStatus, "DONE");
  assert.deepEqual(receipt.evidence?.repositoryScope?.implementationFiles, sorted(profile.nodeSeaScopedPaths));
  assert.deepEqual(receipt.evidence?.repositoryScope?.coreStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.esbuildStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.bunStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.denoStagedDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.nodeSeaCompanionPaths, sorted(profile.nodeSeaCompanionPaths));
  assert.deepEqual(receipt.evidence?.repositoryScope?.immutablePublicDiff, []);
  assert.deepEqual(receipt.evidence?.repositoryScope?.requiredCommands, requiredImplementationCommands);
  assert.equal(receipt.evidence?.repositoryScope?.workflowDigest, exactImplementationWorkflowDigest);
  assert.deepEqual(receipt.evidence?.repositoryScope?.activeInstructions, {
    handoffSha: exact.handoff,
    path: "AGENTS.md",
    completedPlans: ["039", "040", "041", "042", "043"],
    nextPlan: "044",
    publicationAuthority: "NONE",
  });
  assert.deepEqual(receipt.evidence?.repositoryScope?.workspaceManifest, {
    handoffSha: profile.productionBaseline.handoffSha,
    ...profile.workspaceManifest,
  });
  assert.deepEqual(receipt.evidence?.profileSeparation, {
    historicalProfileIds: profile.historicalProfileIds,
    currentProfileId: profile.profileId,
    historicalArtifactsAreInputsOnly: true,
    currentReceiptDirectoryEnvironment: profile.receiptDirectoryEnvironment,
    currentReceiptIds: profile.currentReceiptIds,
    currentCertificateFile: profile.certificateFile,
  });
  assert.equal(profile.forbiddenCurrentReceiptIds.includes(receipt.id), false);
  return receipt;
};

export const validateImplementationCertificate = ({
  certificate,
  currentReceiptDigest,
  expected,
  freezeAnchor,
  handoffAnchor,
  plan039Anchor,
  plan040Anchor,
  plan041Anchor,
  plan042Anchor,
  profile,
  sourcePolicyVerifierOrigin,
  sourceSha,
}) => {
  assert.equal(certificate.schema, "effect-build/implementation-certification@1");
  assert.equal(certificate.profileId, profile.profileId);
  assert.equal(certificate.plan, "043");
  assert.equal(certificate.phase, "implementation");
  assert.equal(certificate.sourceSha, sourceSha);
  assert.deepEqual(certificate.workflow?.repository, plan042Anchor.workflow.repository);
  assert.equal(certificate.workflow?.workflow, "plan-043-implementation-certification");
  assert.match(certificate.workflow?.runId, /^[1-9][0-9]*$/);
  assert.match(certificate.workflow?.runAttempt, /^[1-9][0-9]*$/);
  assert.equal(certificate.workflow?.eventName, "push");
  assert.equal(certificate.workflow?.ref, plan043CertificationRef);
  assert.equal(certificate.workflow?.refType, "branch");
  assert.deepEqual(
    certificate.historicalInputs,
    historicalAuthoritySummary({ freezeAnchor, handoffAnchor, plan039Anchor, plan040Anchor, plan041Anchor, plan042Anchor }),
  );
  assert.deepEqual(certificate.currentReceipts, [{
    id: expected.receiptId,
    file: `${expected.receiptId}.json`,
    digest: currentReceiptDigest,
  }]);
  assert.equal(certificate.currentReceipts.some((receipt) => profile.forbiddenCurrentReceiptIds.includes(receipt.id)), false);
  assert.deepEqual(validateSourcePolicyVerifierOrigin(certificate.sourcePolicyVerifierOrigin), sourcePolicyVerifierOrigin);
  assert.equal(certificate.claims, expected.claims.length);
  assert.equal(certificate.result, "certified");
  return certificate;
};

export const assertValidSourceSha = (value) => assertSha(value, "invalid source SHA");

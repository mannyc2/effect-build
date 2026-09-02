import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { appleEvidenceFileName } from "../apple-certification/canonical.mjs";
import {
  buildContract,
  readInputs,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
} from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const contract = validateContract(buildContract(inputs), inputs);

const projectedPublicApi = () => ({
  schema: "effect-build/public-surface@3",
  packages: Object.fromEntries(Object.entries(contract.publicApiProjection.packages).map(([packageName, surface]) => [
    packageName,
    {
      namespaces: surface.rootNamespaces,
      subpaths: Object.fromEntries(Object.entries(surface.subpaths).map(([subpath, subpathSurface]) => {
        if (Array.isArray(subpathSurface)) return [subpath, { runtime: [], declarations: [] }];
        return [subpath, {
          runtime: [...subpathSurface.operationNamespaces, ...subpathSurface.supportExports.runtime],
          declarations: [...subpathSurface.operationNamespaces, ...subpathSurface.supportExports.declarations],
        }];
      })),
    },
  ])),
});

test("accounts for every research operation and non-operation finding", () => {
  assert.equal(contract.providerOperationRegister.count, 67);
  assert.deepEqual(contract.providerOperationRegister.dispositionCounts, {
    mandatory: 5,
    "positive-proof-gated": 22,
    "conditional-private": 27,
    rejected: 11,
    superseded: 2,
  });
  assert.equal(contract.nonOperationRegister.count, 46);
  assert.deepEqual(contract.nonOperationRegister.dispositionCounts, {
    mandatory: 26,
    "conditional-private": 16,
    rejected: 4,
  });
  assert.deepEqual(contract.privateImplementationRegister.capabilities, [
    {
      id: "PRIVATE-APPLE-NOTARY-SUBMISSION",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotarySubmission",
      path: "packages/effect-build-apple/src/internal/NotarySubmission.ts",
      exports: ["makeSubmissionEngine"],
      visibility: "private",
    },
    {
      id: "PRIVATE-APPLE-NOTARY-JOURNAL-CODEC",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotaryJournalCodec",
      path: "packages/effect-build-apple/src/internal/NotaryJournalCodec.ts",
      exports: [
        "notaryJournalCodecId",
        "encodeNotaryJournalValue",
        "decodeNotaryJournalValue",
        "submissionReferenceFromSubmission",
      ],
      visibility: "private",
    },
    {
      id: "PRIVATE-APPLE-NOTARY-REJECTION-FIXTURE",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotaryRejectionFixture",
      path: "packages/effect-build-apple/src/internal/NotaryRejectionFixture.ts",
      exports: ["Submitter", "submitOnce", "layer"],
      visibility: "private",
    },
    {
      id: "PRIVATE-NODE-SEA-MODES",
      atomIds: ["S05.1", "S06.1", "S07.1"],
      package: "effect-build-node-sea",
      module: "internal/AssembleModes",
      path: "packages/effect-build-node-sea/src/internal/AssembleModes.ts",
      exports: ["assembleDirect"],
      visibility: "private",
    },
  ]);
});

test("materializes exact provider and producer evidence tools in the canonical contract", () => {
  assert.deepEqual(
    contract.exactToolEvidenceRegister.tools.map(({ name, version, evidenceCells }) => ({
      name,
      version,
      evidenceCells,
    })),
    [
      {
        name: "bun",
        version: "1.3.14",
        evidenceCells: [
          "host-native",
          "macos-x64",
          "macos-aarch64",
          "linux-x64-gnu",
          "linux-x64-musl",
          "linux-aarch64-gnu",
          "windows-x64",
        ],
      },
      {
        name: "deno",
        version: "2.9.5",
        evidenceCells: [
          "host-native",
          "macos-x64",
          "macos-aarch64",
          "linux-x64-gnu",
          "linux-aarch64-gnu",
          "windows-x64",
          "windows-aarch64",
        ],
      },
      { name: "node", version: "26.7.0", evidenceCells: ["linux-x64-gnu"] },
      { name: "uv", version: "0.12.0", evidenceCells: ["uv-build", "poetry-core"] },
      { name: "nfpm", version: "2.47.0", evidenceCells: ["deb", "rpm", "apk", "archlinux", "msix"] },
      { name: "syft", version: "1.50.0", evidenceCells: ["spdx-json", "cyclonedx-json"] },
    ],
  );
});

test("binds every live operation, private support, producer capability, and core capability to source", async () => {
  await validateImplementationCoordinates(contract, repositoryRoot);
});

test("keeps Deno bundle breadth and every live Rolldown operation private", () => {
  const operations = contract.providerOperationRegister.operations;
  const denoPrivate = operations
    .filter((operation) => operation.operationId.startsWith("CAN-DENO-") && operation.accounting.surface === "private")
    .map((operation) => operation.operationId);
  assert.deepEqual(denoPrivate, [
    "CAN-DENO-001",
    "CAN-DENO-002",
    "CAN-DENO-003",
    "CAN-DENO-004",
    "CAN-DENO-005",
    "CAN-DENO-006",
    "CAN-DENO-011",
  ]);
  const rolldown = operations.filter((operation) => operation.provider === "rolldown");
  assert.equal(rolldown.filter((operation) => operation.accounting.surface === "private").length, 19);
  assert.deepEqual(
    rolldown.filter((operation) => operation.disposition === "rejected").map((operation) => operation.operationId),
    ["CAN-ROL-021"],
  );
  assert.deepEqual(contract.publicApiProjection.privatePackages, ["effect-build-rolldown"]);
});

test("accounts for every producer family and distinguishes finalizers from native results", () => {
  assert.deepEqual(contract.producerCapabilityRegister.families, [
    "apple",
    "archives",
    "nfpm",
    "python",
    "sbom",
    "windows",
  ]);
  assert.equal(contract.producerCapabilityRegister.count, 19);
  const nonFinalizing = contract.producerCapabilityRegister.capabilities
    .filter((capability) => !capability.finalization.returnsDurableArtifact)
    .map((capability) => `${capability.module}.${capability.exports.join("+")}`);
  assert.deepEqual(nonFinalizing, [
    "Notary.submit",
    "Notary.submitApp",
    "Notary.info",
    "Notary.log",
    "Assess.assess",
  ]);
});

test("makes public-api a strict projection and rejects private package leaks", () => {
  const publicApi = projectedPublicApi();
  assert.equal(validatePublicApiProjection(contract, publicApi), publicApi);
  publicApi.packages["effect-build-rolldown"] = { namespaces: ["Api"], subpaths: {} };
  assert.throws(
    () => validatePublicApiProjection(contract, publicApi),
    /package set is not the combined-contract projection/u,
  );
});

test("assigns durable publication to effect-build and release state to ts-release", () => {
  assert.ok(contract.releaseOwnershipBoundary.effectBuildOwns.includes("atomic-commit"));
  assert.deepEqual(contract.releaseOwnershipBoundary.handoff.identity, ["logicalName", "digest"]);
  assert.ok(contract.releaseOwnershipBoundary.tsReleaseOwns.includes("release-plans"));
  assert.ok(contract.releaseOwnershipBoundary.tsReleaseOwns.includes("mutation-journals-including-apple-notarization"));
  assert.ok(contract.releaseOwnershipBoundary.tsReleaseOwns.includes("continuation"));
  assert.ok(contract.releaseOwnershipBoundary.tsReleaseOwns.includes("publication"));
});

test("keeps npm namespace bootstrap separate from architectural release admission", () => {
  const npm = contract.npmRegistryBoundary;
  const admittedPackages = Object.keys(contract.publicApiProjection.packages).sort();
  const reservedOnlyPackages = [...contract.publicApiProjection.privatePackages].sort();

  assert.deepEqual(npm.trustedPublisher, {
    repository: "mannyc2/effect-build",
    workflow: "release.yml",
    environment: "npm",
    expectedPermissions: ["createPackage"],
    semantics: "expected-npm-11.19.1-trust-record-identity-for-publication-not-live-observation",
  });
  assert.equal(npm.purpose, "repository-package-distribution-only");
  assert.equal(npm.productReleaseOwnership, "unchanged-ts-release-boundary");
  assert.deepEqual(npm.candidateHandoff, {
    producer: "unprivileged-verified-pack-job",
    consumer: "protected-npm-distribution-job",
    identity: ["logicalName", "digest"],
    content: "immutable-package-tarball-bytes",
    repositoryCodeInOidcJob: "forbidden",
  });
  assert.deepEqual(npm.client, { node: "24.14.1", npm: "11.11.0" });
  assert.equal(npm.bootstrap.purpose, "namespace-and-trusted-publisher-bootstrap-only");
  assert.equal(npm.bootstrap.architectureEvidence, false);
  assert.equal(npm.bootstrap.placeholderVersion, "0.0.0-reserved.0");
  assert.equal(npm.bootstrap.placeholderTag, "reserved");
  assert.deepEqual(npm.bootstrap.establishedPackages, [
    "effect-build",
    "effect-build-bun",
    "effect-build-deno",
    "effect-build-esbuild",
    "effect-build-node-sea",
  ]);
  assert.deepEqual(npm.bootstrap.placeholderAtHandoffPackages, [
    "effect-build-apple",
    "effect-build-archives",
    "effect-build-nfpm",
    "effect-build-python",
    "effect-build-rolldown",
    "effect-build-sbom",
    "effect-build-windows",
  ]);
  assert.deepEqual(
    npm.bootstrap.placeholderLedger.map(({ name, version, bootstrapTags }) => ({ name, version, bootstrapTags })),
    npm.bootstrap.placeholderAtHandoffPackages.map((name) => ({
      name,
      version: "0.0.0-reserved.0",
      bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
    })),
  );
  assert.equal(npm.publicationAdmission.source, "publicApiProjection.packages");
  assert.deepEqual(npm.publicationAdmission.packages, admittedPackages);
  assert.deepEqual(npm.publicationAdmission.target, {
    version: "0.6.0",
    presenceAtHandoff: "absent-for-all-admitted-packages",
    expectedDistTagsBeforePublication: [
      { name: "effect-build", tags: { latest: "0.3.0" } },
      {
        name: "effect-build-apple",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
      {
        name: "effect-build-archives",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
      { name: "effect-build-bun", tags: { latest: "0.3.0", reserved: "0.0.0-reserved.0" } },
      { name: "effect-build-deno", tags: { latest: "0.3.0", reserved: "0.0.0-reserved.0" } },
      { name: "effect-build-esbuild", tags: { latest: "0.3.0", reserved: "0.0.0-reserved.0" } },
      {
        name: "effect-build-nfpm",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
      { name: "effect-build-node-sea", tags: { latest: "0.3.0", reserved: "0.0.0-reserved.0" } },
      {
        name: "effect-build-python",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
      {
        name: "effect-build-sbom",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
      {
        name: "effect-build-windows",
        tags: { latest: "0.0.0-reserved.0", reserved: "0.0.0-reserved.0" },
      },
    ],
    expectedLatestBeforePublication: [
      { name: "effect-build", version: "0.3.0" },
      { name: "effect-build-apple", version: "0.0.0-reserved.0" },
      { name: "effect-build-archives", version: "0.0.0-reserved.0" },
      { name: "effect-build-bun", version: "0.3.0" },
      { name: "effect-build-deno", version: "0.3.0" },
      { name: "effect-build-esbuild", version: "0.3.0" },
      { name: "effect-build-nfpm", version: "0.0.0-reserved.0" },
      { name: "effect-build-node-sea", version: "0.3.0" },
      { name: "effect-build-python", version: "0.0.0-reserved.0" },
      { name: "effect-build-sbom", version: "0.0.0-reserved.0" },
      { name: "effect-build-windows", version: "0.0.0-reserved.0" },
    ],
  });
  assert.equal(npm.publicationAdmission.command, "npm-publish");
  assert.equal(npm.publicationAdmission.tag, "latest");
  assert.equal(npm.publicationAdmission.postPublishProof, "downloaded-tarball-integrity");
  assert.equal(npm.publicationAdmission.existingVersionPolicy, "exact-bytes-and-latest-or-stop");
  assert.equal(npm.publicationAdmission.priorLatestPolicy, "exact-contract-ledger-or-target-on-resume");
  assert.equal(npm.publicationAdmission.registryObservation, "isolated-cache-prefer-online");
  assert.equal(npm.publicationAdmission.lifecycleScripts, "disabled");
  assert.equal(npm.reservation.source, "publicApiProjection.privatePackages");
  assert.deepEqual(npm.reservation.packages, reservedOnlyPackages);
  assert.equal(npm.reservation.policy, "placeholder-version-and-tags-remain-unchanged");

  const widened = structuredClone(contract);
  widened.npmRegistryBoundary.publicationAdmission.packages.push("effect-build-rolldown");
  assert.throws(() => validateContract(widened, inputs), /npm release admission must be the public package projection/u);

  const droppedReservation = structuredClone(contract);
  droppedReservation.npmRegistryBoundary.reservation.packages = [];
  assert.throws(() => validateContract(droppedReservation, inputs), /private package names must remain registry placeholders/u);

  const changedBytes = structuredClone(contract);
  changedBytes.npmRegistryBoundary.bootstrap.placeholderLedger[0].bytes += 1;
  assert.throws(
    () => validateContract(changedBytes, inputs),
    /npm namespace placeholders must remain non-architectural bootstrap evidence/u,
  );

  const changedTags = structuredClone(contract);
  changedTags.npmRegistryBoundary.bootstrap.placeholderLedger[0].bootstrapTags.latest = "0.6.0";
  assert.throws(
    () => validateContract(changedTags, inputs),
    /npm namespace placeholders must remain non-architectural bootstrap evidence/u,
  );

  const duplicatedPlaceholder = structuredClone(contract);
  duplicatedPlaceholder.npmRegistryBoundary.bootstrap.placeholderAtHandoffPackages.push("effect-build-apple");
  assert.throws(
    () => validateContract(duplicatedPlaceholder, inputs),
    /npm namespace placeholders must remain non-architectural bootstrap evidence/u,
  );

  const widenedOidcJob = structuredClone(contract);
  widenedOidcJob.npmRegistryBoundary.candidateHandoff.repositoryCodeInOidcJob = "allowed";
  assert.throws(
    () => validateContract(widenedOidcJob, inputs),
    /npm distribution must remain outside the effect-build product release boundary/u,
  );

  const changedTarget = structuredClone(contract);
  changedTarget.npmRegistryBoundary.publicationAdmission.target.version = "0.7.0";
  assert.throws(
    () => validateContract(changedTarget, inputs),
    /npm release target or prior-latest ledger changed/u,
  );

  const changedPriorLatest = structuredClone(contract);
  changedPriorLatest.npmRegistryBoundary.publicationAdmission.target.expectedLatestBeforePublication[0].version =
    "0.2.0";
  assert.throws(
    () => validateContract(changedPriorLatest, inputs),
    /npm release target or prior-latest ledger changed/u,
  );

  const changedPrepublicationTags = structuredClone(contract);
  changedPrepublicationTags.npmRegistryBoundary.publicationAdmission.target
    .expectedDistTagsBeforePublication[3].tags.reserved = "0.0.0-reserved.1";
  assert.throws(
    () => validateContract(changedPrepublicationTags, inputs),
    /npm release target or prior-latest ledger changed/u,
  );
});

test("freezes one exact release-certification policy without copying public package or module sets", () => {
  const release = contract.releaseCertification;
  assert.deepEqual(release.modes, [
    "prepare-exact-sha",
    "certify-exact-sha",
    "publish-certified-bytes",
  ]);
  assert.deepEqual(release.scope, {
    target: "v0.6.0",
    npmPackages: {
      status: "included",
      packageSource: "publicApiProjection.packages",
      appleApiLibrary: "included-as-effect-build-apple",
      packageCountSource: "releaseCertification.publicAdmission.packageCount",
    },
    credentialBackedAppleArtifacts: {
      status: "deferred",
      certification: "not-run-not-passed",
      releaseGate: "excluded-from-v0.6.0",
      products: ["signed-app", "dmg", "pkg"],
      target: "later-separately-qualified-release",
    },
    awsNotaryJournalEvidence: {
      status: "deferred",
      releaseGate: "excluded-from-v0.6.0",
      applicability: "future-credential-backed-apple-artifact-certification-only",
    },
  });
  assert.deepEqual(release.publicAdmission, {
    packageSource: "publicApiProjection.packages",
    packageCount: 11,
    moduleSource: "publicApiProjection.packages package roots and subpaths",
    moduleCount: 42,
    reservationSource: "publicApiProjection.privatePackages",
    reservationCount: 1,
  });
  assert.equal("packages" in release.publicAdmission, false);
  assert.equal("modules" in release.publicAdmission, false);

  assert.deepEqual(release.githubArtifactDigest, {
    canonicalAlgorithm: "sha256",
    canonicalPattern: "^sha256:[0-9a-f]{64}$",
    uploadActionBoundary: {
      acceptedPattern: "^[0-9a-f]{64}$",
      normalization: "prefix-sha256-exactly-once",
    },
    restMetadata: "canonical-exact-equality",
    downloadedZip: "sha256-bytes-equal-canonical-suffix",
    rejectedForms: [
      "uppercase-hex",
      "double-prefixed",
      "non-sha256-algorithm",
      "bare-digest-outside-upload-action-boundary",
    ],
  });
  assert.deepEqual(release.githubArtifactCoordinate, {
    orderedFields: ["workflow", "sourceSha", "runId", "runAttempt", "artifactId", "artifactDigest"],
    fieldFormats: {
      workflow: "exact-repository-workflow-identity",
      sourceSha: "40-lowercase-hex",
      runId: "positive-decimal-string",
      runAttempt: "positive-decimal-string",
      artifactId: "positive-decimal-string",
      artifactDigest: "releaseCertification.githubArtifactDigest",
    },
  });
  assert.deepEqual(release.candidate, {
    protocol: "effect-build/npm-release-candidate@2",
    manifest: "release-candidate.json",
    artifactName: "npm-release-candidate-<sourceSha>",
    workflowPath: ".github/workflows/release.yml",
    coordinate: "releaseCertification.githubArtifactCoordinate",
    retentionDays: 30,
    packageAdmission: "releaseCertification.publicAdmission",
    contents: "exact-admitted-tarballs-plus-one-manifest",
    repositoryCodeInProtectedConsumer: "forbidden",
    event: "workflow_dispatch",
    tarballInspection: {
      protocol: "effect-build/strict-npm-package-ustar-gzip@1",
      blockBytes: 512,
      allowedTypes: ["regular", "directory"],
      manifestPath: "package/package.json",
      root: "package",
      maximumCompressedBytes: 16777216,
      maximumUnpackedBytes: 67108864,
      maximumEntryBytes: 67108864,
      maximumTotalEntryBytes: 67108864,
      maximumManifestBytes: 1048576,
      maximumEntries: 4096,
      gzip: "single-member-rfc1952-fixed-header-no-optional-fields-exact-deflate-consumption-crc32-isize",
      ustar: "posix-ustar-magic-version-octal-only-checksummed-no-pax-gnu-base256-links-or-specials",
      endMarker: "two-zero-blocks-followed-only-by-whole-zero-padding-blocks",
      members: "unique-safe-package-root-regular-files-and-directories-only",
      protectedProjection: {
        sourcePath: "scripts/release/tar-protocol.mjs",
        sourceBytes: 10554,
        sourceDigest: "sha256:cfd70cee204b5d3559fc79037a69cae5a171f914c2df6f015bd0aa38bb3d626d",
        compressedBytes: 3128,
        encoding: "deflate-raw-base64-data-url-exact-source",
      },
    },
    workflow: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
  });
  assert.deepEqual(release.npmAdministrativeInventory, {
    status: "not-observed",
    releaseGate: "excluded-from-v0.6.0",
    doesNotProve: [
      "trusted-publisher-admin-inventory",
      "publishing-access-two-factor-and-token-policy",
    ],
  });
  assert.equal(release.provenanceVerification.purpose, "npm-publication-provenance-verification-only");
  assert.equal(release.provenanceVerification.status, "implemented");
  assert.equal(release.provenanceVerification.module, "scripts/release/sigstore-dsse-verifier.mjs");
  assert.deepEqual(release.provenanceVerification.client, {
    package: "@sigstore/verify",
    version: "3.1.1",
  });
  assert.deepEqual(release.provenanceVerification.bundleClient, {
    package: "@sigstore/bundle",
    version: "4.0.0",
  });
  assert.deepEqual(release.provenanceVerification.protobufClient, {
    package: "@sigstore/protobuf-specs",
    version: "0.5.2",
  });
  assert.equal(
    release.provenanceVerification.trustedRoot.digest,
    "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
  );
  assert.equal(
    release.provenanceVerification.certificateIdentityMatch,
    "exact-anchored-uri-from-contract-release-workflow-identity",
  );

  assert.equal(release.readiness.protocol, "effect-build/release-readiness@3");
  assert.equal(release.readiness.bundleProtocol, "effect-build/release-readiness-evidence-bundle@3");
  assert.equal(
    release.readiness.bundleFraming,
    "protocol-line-u32be-canonical-header-u64be-opaque-payload",
  );
  assert.deepEqual(release.readiness.orderedFiles, [
    "release-readiness.json",
    "release-readiness.bin",
  ]);
  assert.equal(release.readiness.event, "workflow_dispatch");
  assert.deepEqual(release.readiness.dispatch, {
    sourceInput: "source_sha",
    candidateInput: "candidate_reference_json",
    evidenceInputs: [
      { role: "exact-main-ci", input: "exact_main_ci_reference_json" },
      { role: "fake-registry", input: "fake_registry_reference_json" },
      { role: "npm-oidc-certification", input: "npm_oidc_certification_reference_json" },
    ],
    githubInputs: "closed-full-reference-json-downloaded-by-workflow",
  });
  assert.deepEqual(Object.keys(release.readiness.referenceShapes), [
    "candidate",
    "githubRun",
    "githubArtifact",
  ]);
  assert.deepEqual(release.readiness.evidenceRoles, [
    {
      role: "exact-main-ci",
      type: "githubRun",
      protocol: "effect-build/exact-main-ci-observation@1",
      terminal: "success",
      workflowPath: ".github/workflows/ci.yml",
      event: "push",
      maximumAgeSeconds: 86400,
      maximumValiditySeconds: 172800,
      workflow: "mannyc2/effect-build/.github/workflows/ci.yml@refs/heads/main",
    },
    {
      role: "fake-registry",
      type: "githubArtifact",
      protocol: "effect-build/fake-registry-exact-protected-body-certification@2",
      terminal: "success",
      workflowPath: ".github/workflows/release-certification.yml",
      artifactName: "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
      event: "workflow_dispatch",
      maximumAgeSeconds: 86400,
      maximumValiditySeconds: 172800,
      workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
    },
    {
      role: "npm-oidc-certification",
      type: "githubArtifact",
      protocol: "effect-build/npm-oidc-certification-artifact@1",
      terminal: "success",
      workflowPath: ".github/workflows/release.yml",
      artifactName: "effect-build-v0.6.0-npm-oidc-certification",
      event: "workflow_dispatch",
      maximumAgeSeconds: 3600,
      maximumValiditySeconds: 14400,
      workflow: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
    },
  ]);
  for (const removed of [
    "externalEvidencePolicy",
    "externalEvidenceManifest",
    "externalEvidenceAuthentication",
    "externalEvidenceIngress",
    "externalReceipts",
  ]) assert.equal(removed in release.readiness, false);


  assert.deepEqual(release.finalPublicVerification, {
    protocol: "effect-build/final-public-verification@2",
    workflowPath: ".github/workflows/release-verification.yml",
    event: "workflow_dispatch",
    status: "ready",
    upstreamGateSource: "releaseCertification.readiness",
    artifactDisposition: "allowed-on-terminal-readiness-success",
    permissions: {
      actions: "read",
      contents: "read",
      idToken: "none",
      packages: "anonymous-read",
      repositoryMutation: "forbidden",
    },
    dispatch: {
      sourceInput: "source_sha",
      candidateInput: "candidate_reference_json",
      readinessInput: "readiness_reference_json",
      tagInput: "tag_reference_json",
      releaseInput: "release_reference_json",
    },
    referenceShapes: {
      candidate: ["protocol", "coordinate", "artifactName", "manifestDigest", "observedAt", "expiresAt", "bytes"],
      readiness: ["protocol", "coordinate", "artifactName", "manifestDigest", "observedAt", "expiresAt", "bytes"],
      tag: ["repository", "name", "targetSha", "objectType", "form"],
      release: [
        "repository",
        "releaseId",
        "tagName",
        "targetSha",
        "draft",
        "prerelease",
        "immutable",
        "observedAt",
      ],
    },
    candidate: {
      protocolSource: "releaseCertification.candidate.protocol",
      workflowSource: "releaseCertification.candidate.workflow",
      artifactNameSource: "releaseCertification.candidate.artifactName",
      coordinate: "releaseCertification.githubArtifactCoordinate",
      protocol: "effect-build/npm-release-candidate@2",
      workflow: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
      artifactName: "npm-release-candidate-<sourceSha>",
    },
    readiness: {
      protocolSource: "releaseCertification.readiness.protocol",
      workflowSource: "releaseCertification.readiness.workflow",
      artifactNameSource: "releaseCertification.readiness.artifactName",
      coordinate: "releaseCertification.githubArtifactCoordinate",
      protocol: "effect-build/release-readiness@3",
      workflow: "mannyc2/effect-build/.github/workflows/release-readiness.yml@refs/heads/main",
      artifactName: "effect-build-v0.6.0-release-readiness",
    },
    tagPolicy: {
      nameSource: "npmRegistryBoundary.publicationAdmission.target.version prefixed with v",
      objectType: "commit",
      form: "lightweight-direct-commit",
      exactTargetSource: "dispatch.source_sha",
      mutation: "forbidden",
    },
    releasePolicy: {
      idFormat: "positive-decimal-string",
      draft: false,
      prerelease: false,
      tagNameSource: "finalPublicVerification.tag",
      targetShaSource: "authenticated-lightweight-tag-ref-only",
      targetCommitishSource: "releaseCertification.githubAuthority.branchPolicy.name-presentation-only",
      assetSource: "candidate ordered package ledger plus candidate manifest",
      immutabilityDecisionSource: "live-operator-admin-preflight-before-draft-and-public-release",
      mutation: "forbidden",
    },
    publicState: {
      npmRegistrySource: "npmRegistryBoundary.registry",
      versionSource: "npmRegistryBoundary.publicationAdmission.target.version",
      packageSource: "publicApiProjection.packages",
      moduleSource: "publicApiProjection.packages package roots and subpaths",
      releaseAssetSource: "candidate ordered package ledger plus releaseCertification.candidate.manifest",
      requiredChecks: [
        "authenticated-current-main-exact-source",
        "authenticated-candidate-coordinate-and-downloaded-bytes",
        "authenticated-readiness-coordinate-and-downloaded-bytes",
        "lightweight-tag-directly-targets-source",
        "public-release-nondraft-nonprerelease-exact-tag-and-canonical-branch-presentation",
        "twelve-release-assets-candidate-exact-by-name-size-digest-and-download",
        "eleven-anonymous-npm-tarballs-candidate-exact-size-sha256-sha512",
        "eleven-latest-tags-exact-version",
        "eleven-sigstore-provenance-subject-workflow-and-source-exact",
        "fresh-node-and-bun-cache-consumer-smoke-all-public-modules",
        "rolldown-reservation-invariants-unchanged",
      ],
    },
    freshness: { clockSkewSeconds: 60, maximumObservationAgeSeconds: 3600 },
    implementation: {
      status: "implemented",
      module: "scripts/release/final-public-verification.mjs",
      contractAuthentication: "exact-generated-bytes",
      githubBoundary: "github-token-read-only-api-no-cross-origin-authorization",
      npmBoundary: "anonymous-registry-read-only-no-preexisting-auth",
      observationFields: {
        npmPackage: ["name", "version", "latest", "bytes", "sha256", "integrity", "tarballUrl"],
        releaseAsset: ["name", "assetId", "bytes", "digest", "apiUrl", "browserDownloadUrl"],
        provenance: ["name", "attestationUrl", "bundleDigest", "subjectDigest", "workflow", "sourceSha"],
        consumerSmoke: ["schema", "version", "node", "bun", "publicModules", "pipelines", "passed"],
        reservation: ["name", "version", "versions", "latest", "reserved", "bytes", "sha256", "integrity"],
      },
      provenance: {
        attestationPath: "/-/npm/v1/attestations/<encoded-name>@<version>",
        predicateType: "https://slsa.dev/provenance/v1",
        payloadType: "application/vnd.in-toto+json",
        statementType: "https://in-toto.io/Statement/v1",
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        builderId: "https://github.com/actions/runner/github-hosted",
        subjectDigest: "sha512:<128-lowercase-hex>",
        certificateIdentitySource: "releaseCertification.githubAuthority expected release workflow identity",
        certificateIssuerSource: "releaseCertification.provenanceVerification",
        certificateOidSource: "releaseCertification.provenanceVerification",
        workflow: "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
        workflowPath: ".github/workflows/release.yml",
        branchRef: "refs/heads/main",
        repository: "mannyc2/effect-build",
        repositoryId: "1331906770",
        repositoryOwnerId: "126291407",
      },
      consumerSmoke: {
        protocol: "effect-build/final-public-consumer-smoke@1",
        fields: ["schema", "version", "node", "bun", "publicModules", "pipelines", "passed"],
        node: {
          executor: "node",
          command: "node scripts/test-built-consumer.mjs --registry-version <version> --runtime node --json",
          client: "releaseCertification.npmOidcCertification.client",
          cache: "fresh-empty-npm-cache-and-install-root",
          reportFields: ["executor", "version", "npm", "cache", "publicModules", "pipelines", "passed"],
          configurationIsolation:
            "empty-project-user-global-npmrc-explicit-registry-cache-prefix-and-same-child-config-audit-before-and-after-install",
          version: "24.14.1",
          npm: "11.11.0",
        },
        bun: {
          executor: "bun",
          command: "bun scripts/test-built-consumer.mjs --registry-version <version> --runtime bun --json",
          versionSource: "exactToolEvidenceRegister.tools kind=provider name=bun",
          cache: "fresh-empty-bun-cache-and-install-root",
          reportFields: ["executor", "version", "cache", "publicModules", "pipelines", "passed"],
          configurationIsolation:
            "empty-project-user-global-npmrc-and-bunfig-explicit-registry-cache-prefix-and-same-child-npm-config-audit-before-and-after-install",
          version: "1.3.14",
        },
        ambientConfiguration:
          "forbidden-auth-proxy-extra-ca-node-options-and-host-home-config-with-fresh-empty-home-cache-prefix-and-install-root",
        moduleSource: "publicApiProjection.packages package roots and subpaths",
        representativePipelines: [
          "esbuild-in-memory-provider-build",
          "artifact-file-finalization-and-adoption",
          "artifact-byte-mutation-rejection",
        ],
      },
      reservation: {
        package: "effect-build-rolldown",
        ledgerSource: "npmRegistryBoundary.bootstrap.placeholderLedger",
        targetVersion: "forbidden",
        exactVersions: "reservation-ledger-version-only",
        ledger: {
          name: "effect-build-rolldown",
          version: "0.0.0-reserved.0",
          bytes: 334,
          sha256: "eda4638f7eaab55dede0ee5d34954efb88786a645396d91a2a9b04175fb103ff",
          integrity: "sha512-mkI+ekPBY2Y6CyEqXRjnHB2F7RWxn6nTcXuL4C+KoIXL5BFvUu73JY9/JWqGIHLlLdvy4wPm0vnlNIg77KxdAg==",
          bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
        },
      },
    },
    receipt: {
      protocol: "effect-build/final-public-release-receipt@2",
      artifactName: "effect-build-v0.6.0-final-public-release",
      retentionDays: 90,
      orderedFiles: ["final-public-release.json"],
      fields: [
        "schema",
        "sourceSha",
        "observedAt",
        "contract",
        "candidate",
        "readiness",
        "tag",
        "release",
        "npmPackages",
        "releaseAssets",
        "provenance",
        "consumerSmoke",
        "reservation",
        "verdict",
      ],
      terminalVerdict: "success",
      externalArchive: "operator-controlled-retention-required",
    },
    workflow: "mannyc2/effect-build/.github/workflows/release-verification.yml@refs/heads/main",
    repository: "mannyc2/effect-build",
    registry: "https://registry.npmjs.org",
    version: "0.6.0",
    tag: "v0.6.0",
    packageCount: 11,
    moduleCount: 42,
    releaseAssetCount: 12,
  });

  assert.deepEqual(release.githubAuthority, {
    identitySource: "npmRegistryBoundary.trustedPublisher",
    repositoryId: "1331906770",
    repositoryOwnerId: "126291407",
    repositoryVisibility: "public",
    readOnlyTransport: {
      apiOrigin: "https://api.github.com",
      apiVersion: "2022-11-28",
      artifactRedirectHostPolicy: {
        suffixes: ["blob.core.windows.net"],
        match: "dot-subdomain-only",
        redirectStatuses: [302],
        maximumRedirects: 1,
      },
      releaseAssetRedirectHostPolicy: {
        hosts: ["release-assets.githubusercontent.com"],
        match: "exact",
        directStatuses: [200],
        redirectStatuses: [302],
        maximumRedirects: 1,
      },
      metadataMaximumBytes: 8388608,
      artifactMaximumBytes: 1073741824,
      requestInactivityTimeoutMilliseconds: 60000,
      metadataTotalTimeoutMilliseconds: 60000,
      artifactTotalTimeoutMilliseconds: 900000,
      authorization: "api-origin-first-request-only-stripped-before-redirect",
      tlsRootPolicy: "node-bundled-root-certificates-only",
      ambientConfiguration: "forbidden-home-gh-config-proxy-and-extra-ca",
    },
    branchPolicy: {
      name: "main",
      type: "branch",
      deploymentBranchPolicy: { customBranchPolicies: true, protectedBranches: false },
      exactProtectionRuleTypes: ["branch_policy", "required_reviewers"],
    },
    reviewer: { id: 126291407, login: "mannyc2", type: "User", preventSelfReview: false },
    oidcSubjectPolicy: {
      use_default: true,
      use_immutable_subject: true,
      sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
    },
    expectedEnvironmentSubjectSource: "immutable-id-repository-and-environment",
    authorizationSplit: {
      protectedGithubTokenObservations: [
        "repository-metadata",
        "environment-deployment-policy",
        "branch-policy",
        "oidc-subject-policy",
        "current-main",
        "workflow-blob",
      ],
      administrativeExternalOnly: [
        "repository-secret-name-inventory",
        "repository-variable-name-inventory",
        "environment-secret-name-inventory",
        "environment-variable-name-inventory",
      ],
      runtimeForbiddenEnvironmentSource:
        "releaseCertification.npmOidcCertification.forbiddenEnvironmentNames",
      publishGate: "releaseCertification.readiness exact-three-github-evidence aggregate",
      forbiddenCredentialEscalation: ["personal-access-token", "github-app-token", "administrative-token"],
    },
    repository: contract.npmRegistryBoundary.trustedPublisher.repository,
    repositoryOwner: "mannyc2",
    workflow: contract.npmRegistryBoundary.trustedPublisher.workflow,
    environment: contract.npmRegistryBoundary.trustedPublisher.environment,
    expectedEnvironmentSubject:
      "repo:mannyc2@126291407/effect-build@1331906770:environment:npm",
  });
  assert.deepEqual(release.dependencyBootstrap, {
    protocol: "effect-build/checkout-dependency-bootstrap@1",
    client: {
      executable: "bun",
      version: "1.3.14",
    },
    lockfile: {
      path: "bun.lock",
      format: "bun-text-lockfile-v1",
      nonWorkspaceIntegrityAlgorithm: "sha512",
      nonWorkspaceIntegrityPattern: "^sha512-[A-Za-z0-9+/]+={0,2}$",
      requirement: "every-non-workspace-package-exact-integrity-required",
    },
    command: {
      arguments: ["install", "--frozen-lockfile", "--ignore-scripts"],
      lifecycleScripts: "forbidden",
    },
    registries: {
      default: "https://registry.npmjs.org",
      scopes: {
        "@jsr": "https://npm.jsr.io",
      },
    },
    environment: {
      home: "fresh-empty-private",
      cache: "fresh-empty-private",
      temporary: "fresh-empty-private",
      configuration: "exact-auth-free-project-npmrc-empty-user-global-npmrc-and-exact-bunfig",
      configurationFiles: {
        projectNpmrc: {
          path: ".npmrc",
          digest: "sha256:82952390ba119c39e2e495c5afdd42a45129f8ce49918f219eca7bcd6549c7d9",
        },
        bunfig: {
          path: "scripts/release/bunfig.release-bootstrap.toml",
          digest: "sha256:e5de342dbde5ef6b7eadaf1bba167f865a6ecf0d35c8d1ffdd0dbb0726d836b3",
        },
      },
      forbidden: "auth-proxy-extra-ca-node-options-and-host-home-config",
    },
    network: "lockfile-resolved-dependency-bootstrap-only",
    evidence: "never-release-evidence",
  });
  assert.deepEqual(release.npmOidcCertification, {
    client: { node: "24.14.1", npm: "11.11.0" },
    protectedReadOnlyTransport: {
      protocol: "effect-build/protected-release-read-only-transport@1",
      githubPolicySource: "releaseCertification.githubAuthority.readOnlyTransport",
      npmRegistryOriginSource: "npmRegistryBoundary.registry",
      oidcRequest: {
        hostPattern: "^pipelines[a-z0-9-]*\\.actions\\.githubusercontent\\.com$",
        pathPattern:
          "^/[A-Za-z0-9_-]{20,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/_apis/distributedtask/hubs/[A-Za-z]+/plans/[A-Za-z0-9_-]{20,}/jobs/[A-Za-z0-9_-]{20,}/idtoken$",
        initialQuery: "api-version=2.0",
        audienceName: "audience",
        audienceValue: "npm:registry.npmjs.org",
        authorization: "actions-id-token-request-token-only",
      },
      oidcIssuer: {
        origin: "https://token.actions.githubusercontent.com",
        discoveryPath: "/.well-known/openid-configuration",
        jwksPath: "/.well-known/jwks",
      },
      request: {
        method: "GET",
        redirects: 0,
        requestInactivityTimeoutMilliseconds: 60000,
        metadataTotalTimeoutMilliseconds: 60000,
        oidcSequenceTotalTimeoutMilliseconds: 180000,
        maximumJsonBytes: 8388608,
        contentType: "application-json-or-json-suffix",
        contentEncoding: "identity-or-absent",
        partialResponses: "forbidden",
        tlsRootPolicy: "node-bundled-root-certificates-only",
        ambientConfiguration: "forbidden-home-curl-git-npm-proxy-extra-ca-and-node-options",
      },
    },
    evidence: {
      artifactProtocol: "effect-build/npm-oidc-certification-artifact@1",
      protocols: {
        githubOidcClaims: "effect-build/github-oidc-claims@1",
        npmOidcExchangeAccepted: "effect-build/npm-oidc-exchange-accepted@1",
      },
      artifactName: "effect-build-v0.6.0-npm-oidc-certification",
      retentionDays: 30,
      orderedFiles: ["github-oidc-claims.json", "npm-oidc-exchange-accepted.json"],
      receiptFieldPolicy: "closed-objects-additional-fields-forbidden",
      receiptSchemas: {
        githubOidcClaims: [
          "schema",
          "sourceSha",
          "candidate",
          "client",
          "observedAt",
          "claims",
          "claimsDigest",
          "jwtValidation",
          "sourceDigests",
          "registryMutation",
          "proves",
          "doesNotProve",
        ],
        npmOidcExchangeAccepted: [
          "schema",
          "sourceSha",
          "candidate",
          "client",
          "observedAt",
          "packages",
          "exchanges",
          "beforeRegistryStateDigest",
          "afterRegistryStateDigest",
          "sourceDigests",
          "registryMutation",
          "proves",
          "doesNotProve",
        ],
        client: ["node", "npm"],
        sourceDigest: ["path", "sha256"],
        exchange: ["name", "accepted", "markerCount"],
        jwtValidation: [
          "alg",
          "kid",
          "iat",
          "nbf",
          "exp",
          "issuerConfigurationDigest",
          "jwksDigest",
          "signingKeyDigest",
          "signatureVerified",
        ],
      },
      githubOidcClaims: {
        orderedClaimFields: [
          "aud",
          "environment",
          "event_name",
          "iss",
          "ref",
          "ref_type",
          "repository",
          "repository_id",
          "repository_owner",
          "repository_owner_id",
          "repository_visibility",
          "run_attempt",
          "run_id",
          "runner_environment",
          "sha",
          "sub",
          "workflow_ref",
          "workflow_sha",
        ],
        staticClaims: {
          aud: "npm:registry.npmjs.org",
          event_name: "workflow_dispatch",
          iss: "https://token.actions.githubusercontent.com",
          ref_type: "branch",
          repository_visibility: "public",
          runner_environment: "github-hosted",
        },
        derivedClaimSources: {
          environment: "releaseCertification.githubAuthority.environment",
          ref: "refs/heads/<releaseCertification.githubAuthority.branchPolicy.name>",
          repository: "releaseCertification.githubAuthority.repository",
          repository_id: "releaseCertification.githubAuthority.repositoryId",
          repository_owner: "releaseCertification.githubAuthority.repositoryOwner",
          repository_owner_id: "releaseCertification.githubAuthority.repositoryOwnerId",
          run_attempt: "current-protected-workflow-run-attempt",
          run_id: "current-protected-workflow-run-id",
          sha: "receipt.sourceSha",
          sub: "releaseCertification.githubAuthority.expectedEnvironmentSubject",
          workflow_ref: "<repository>/.github/workflows/<workflow>@refs/heads/<branchPolicy.name>",
          workflow_sha: "receipt.sourceSha",
        },
        claimsDigest: "releaseCertification.githubArtifactDigest-of-canonical-claims-json",
        rawJwtRetention: "forbidden",
        jwtValidation: {
          alg: "RS256",
          kid: "nonempty-nul-free",
          numericDates: "safe-integer-seconds",
          iatPastSkewSeconds: 300,
          iatFutureSkewSeconds: 60,
          nbfFutureSkewSeconds: 60,
          expPastSkewSeconds: 60,
          maximumLifetimeSeconds: 600,
          publicDocumentDigests: "releaseCertification.githubArtifactDigest",
          signatureVerified: true,
        },
      },
      npmOidcExchangeAccepted: {
        packages: "npmRegistryBoundary.publicationAdmission.packages-exact-order",
        exchanges: "exact-one-accepted-true-markerCount-one-entry-per-package-in-package-order",
        registryState:
          "before-and-after-releaseCertification.githubArtifactDigest-of-canonical-registry-state-exactly-equal",
      },
      receiptClaims: {
        githubOidcClaims: {
          proves: ["github-oidc-signature-and-exact-claims-validated-at-observed-time"],
          doesNotProve: ["npm-oidc-exchange", "tarball-upload", "provenance", "publication"],
        },
        npmOidcExchangeAccepted: {
          proves: ["package-specific-npm-oidc-exchange-accepted-at-observed-time", "registry-state-unchanged"],
          doesNotProve: ["tarball-upload", "provenance", "publication"],
        },
      },
      bindings: {
        candidate: "releaseCertification.githubArtifactCoordinate",
        client: "releaseCertification.npmOidcCertification.client",
        sourceDigests: "releaseCertification.npmOidcCertification.sourceDigests",
        registryMutation: false,
        digest: "releaseCertification.githubArtifactDigest",
        observedAt: "rfc3339",
        markerCount: 1,
      },
    },
    forbiddenEnvironmentNames: ["NPM_ID_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "SIGSTORE_ID_TOKEN"],
    successMarker: "Successfully retrieved and set token",
    successMarkerCardinality: "exactly-one-per-package-in-private-log",
    sourceDigests: [
      {
        path: "npm/lib/commands/publish.js",
        sha256: "ba4afde95ca02334b0d221213907f458c4ba576c1c583b9d73c8ef99924ba26c",
      },
      {
        path: "npm/lib/utils/oidc.js",
        sha256: "d3cdddc81b038ece6394323dfa2e1ec813b186d7965e0aea0cd2b1c39ce97ef9",
      },
      {
        path: "npm/node_modules/libnpmpublish/lib/publish.js",
        sha256: "39b4994968f6699004c0200ae12cadf328c8d838534315c1978672bf3dd15401",
      },
      {
        path: "npm/node_modules/libnpmpublish/lib/provenance.js",
        sha256: "ee9b1bc8e3f636fbaf5138a3e183ce3c6d42bb5dd57ab004578e534dd08da46b",
      },
      {
        path: "npm/node_modules/@sigstore/sign/dist/identity/ci.js",
        sha256: "23e3c7c5799a54f7818b3d8d8f0bf9980b8b61a1f0b39632b941c6fb82aca327",
      },
    ],
    auditedOrdering: [
      "npm-oidc-exchange-before-dry-run-mutation-guard",
      "libnpmpublish-provenance-before-registry-put",
      "sigstore-provider-order-github-request-token-then-environment-token",
    ],
    dryRunClaim: "package-specific-oidc-exchange-accepted-with-zero-registry-mutation",
    forbiddenDryRunClaims: ["tarball-upload-certified", "provenance-certified", "publication-certified"],
  });

  assert.deepEqual(
    release.fakeRegistry.hypotheticalStateMachine.cases.map(({ id, variants, expected }) => ({
      id,
      ...(variants === undefined ? {} : { variants }),
      expected,
    })),
    [
      { id: "all-absent-full-convergence", expected: "publish-all-eleven" },
      {
        id: "partial-exact-publication",
        expected: "resume-only-missing-within-current-readiness-validity",
      },
      { id: "exact-bytes-latest-wrong", expected: "stop" },
      { id: "target-version-conflicting-bytes", expected: "stop" },
      {
        id: "existing-provenance-invalid",
        variants: [
          "missing",
          "unverifiable",
          "wrong-workflow",
          "wrong-source-sha",
          "wrong-source-oid",
          "duplicate-source-oid",
        ],
        expected: "stop",
      },
      { id: "prior-latest-drift-before-first-mutation", expected: "stop-zero-mutations" },
      { id: "newer-version-present", expected: "stop-zero-mutations" },
      { id: "inconclusive-non-404-registry-read", expected: "stop-zero-mutations" },
      { id: "failure-before-registry-commitment", expected: "stop-zero-mutations" },
      {
        id: "response-loss-after-registry-commitment",
        expected:
          "stop-then-observation-driven-exact-byte-resume-within-current-readiness-validity",
      },
      {
        id: "response-loss-after-bytes-and-tag-before-valid-provenance",
        expected: "stop-before-later-package",
      },
      {
        id: "placeholder-or-reservation-tag-drift",
        variants: ["placeholder-latest", "placeholder-reserved", "reservation-only-latest", "reservation-only-reserved"],
        expected: "stop-zero-mutations",
      },
      { id: "rolldown-non-placeholder-version", expected: "stop-zero-mutations" },
      {
        id: "embedded-publish-config-invalid",
        variants: ["missing", "additional", "non-canonical", "registry-scoped-auth"],
        expected: "stop-zero-mutations",
      },
      {
        id: "forbidden-protected-environment",
        variants: ["NPM_ID_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "SIGSTORE_ID_TOKEN"],
        expected: "stop-zero-mutations",
      },
      {
        id: "post-publish-candidate-mismatch",
        variants: ["bytes", "integrity", "size"],
        expected: "stop-before-later-package",
      },
      { id: "main-advances-before-first-mutation", expected: "stop-zero-mutations" },
      { id: "registry-drift-after-first-mutation", expected: "stop-after-one-committed-mutation" },
      { id: "main-advances-after-first-mutation", expected: "stop-after-one-committed-mutation" },
      { id: "authority-drift-after-first-mutation", expected: "stop-after-one-committed-mutation" },
      {
        id: "adopted-evidence-digest-mismatch",
        variants: ["candidate-zip", "candidate-manifest", "candidate-tarball", "readiness"],
        expected: "stop-zero-mutations",
      },
    ],
  );
  assert.deepEqual(release.fakeRegistry.localQualification, {
    protocol: "effect-build/fake-registry-local-qualification@2",
    workflowPath: ".github/workflows/release-certification.yml",
    artifactName: "effect-build-v0.6.0-fake-registry-local-qualification",
    terminal: "local-qualification",
    retentionDays: 30,
    readinessAdmissible: false,
    proves: [
      "real-purpose-without-readiness-stops-before-first-mutation",
      "sealed-credential-free-exact-purpose-covers-40-state-machine-coordinates",
      "independent-reference-oracle-agrees-with-exact-purpose",
      "npm-oidc-dry-run-body-local-boundaries",
    ],
    doesNotProve: [
      "readiness-admissible-exact-protected-body-certification",
      "readiness-admission",
      "same-candidate-resume-after-readiness-expiry",
      "npm-upload",
      "provenance",
      "publication",
    ],
    workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
  });
  assert.deepEqual(release.fakeRegistry.exactProtectedBodyCertification, {
    protocol: "effect-build/fake-registry-exact-protected-body-certification@2",
    workflowPath: ".github/workflows/release-certification.yml",
    artifactName: "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
    terminal: "success",
    implementationStatus: "implemented",
    status: "supported",
    gateSource: "releaseCertification.readiness.githubAuthentication",
    artifactDisposition: "required-on-terminal-workflow-success",
    readinessAdmission: "requires-same-source-terminal-success-exact-body-artifact",
    retentionDays: 30,
    orderedFiles: ["fake-registry-exact-protected-body.json"],
    receiptFields: [
      "schema",
      "sourceSha",
      "observedAt",
      "workflow",
      "contractDigest",
      "readinessProtocol",
      "candidate",
      "candidateManifestDigest",
      "coordinates",
      "coordinateCount",
      "claims",
      "doesNotProve",
      "realRegistryMutation",
      "realNpmOrRegistryCredentialsUsed",
      "terminal",
    ],
    coordinateFields: [
      "coordinate",
      "status",
      "attemptedFakeMutations",
      "committedFakeMutations",
      "candidateBinding",
      "candidateArtifactDigest",
      "candidateManifestDigest",
    ],
    coordinateSource: "releaseCertification.fakeRegistry.hypotheticalStateMachine.cases-exact-expanded-order",
    exactMutationLedger: release.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger,
    requiredClaims: [
      "exact-protected-reauthorization-and-publisher-bodies-executed-against-stateful-fake-boundaries",
      "all-40-exact-body-case-coordinates-terminal",
      "zero-real-registry-mutation",
    ],
    doesNotProve: [
      "same-candidate-resume-after-readiness-expiry",
      "npm-upload",
      "provenance",
      "publication",
    ],
    certificationPurpose: release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose,
    workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
  });
  assert.deepEqual(release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose, {
    protocol: "effect-build/fake-registry-exact-protected-body-purpose@2",
    selector: {
      environment: "EFFECT_BUILD_PUBLISH_PURPOSE",
      value: "fake-registry-exact-protected-body-certification",
    },
    transportOnlySelectorValue: "fake-registry-exact-protected-body-real-gate-certification",
    transportOnlyPurpose: "sealed-fake-network-executes-real-readiness-gate-without-skipping-or-mutating",
    protectedWorkflowExposure: "forbidden",
    producerWorkflowPath: ".github/workflows/release-certification.yml",
    certificationMode: "publish-certified-bytes",
    instrumentedModes: ["certify-exact-sha", "publish-certified-bytes"],
    skippedStage: "final-readiness-adoption-only",
    sharedBodyStages: [
      "protected-reauthorization",
      "authenticated-contract-adoption",
      "candidate-adoption-and-byte-validation",
      "npm-source-and-environment-authentication",
      "registry-prefix-and-reservation-observation",
      "per-package-main-reauthorization",
      "publish-mutation",
      "exact-byte-latest-and-provenance-verification",
      "terminal-registry-verification",
    ],
    exactEnvironmentFields: [
      "EFFECT_BUILD_FAKE_EXECUTION_ROOT",
      "EFFECT_BUILD_FAKE_NODE",
      "EFFECT_BUILD_FAKE_BOUNDARY",
      "EFFECT_BUILD_FAKE_CONTRACT_PATH",
      "FAKE_RELEASE_STATE",
      "NODE_OPTIONS",
    ],
    executableNames: ["curl", "npm"],
    statePolicy: "one-regular-single-link-json-file-under-exact-execution-root",
    fixtureContractProjection:
      "exact-canonical-generated-contract-with-placeholder-byte-ledger-derived-from-fixture-archives",
    authorityPolicy: "credential-free-fake-boundaries-only-real-authentication-forbidden",
    networkPolicy: "no-real-github-npm-or-oidc-network",
    realPurposeReadinessPolicy: "semantic-final-readiness-required-unconditionally",
    sourceFiles: release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose.sourceFiles,
  });
  assert.equal(release.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger.length, 40);
  assert.deepEqual(
    release.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger
      .filter(({ attemptedFakeMutations, committedFakeMutations }) =>
        attemptedFakeMutations !== 0 || committedFakeMutations !== 0
      )
      .map(({ candidateBinding: _candidateBinding, ...entry }) => entry),
    [
      { coordinate: "all-absent-full-convergence", attemptedFakeMutations: 11, committedFakeMutations: 11 },
      { coordinate: "partial-exact-publication", attemptedFakeMutations: 8, committedFakeMutations: 8 },
      { coordinate: "failure-before-registry-commitment", attemptedFakeMutations: 1, committedFakeMutations: 0 },
      { coordinate: "response-loss-after-registry-commitment", attemptedFakeMutations: 11, committedFakeMutations: 11 },
      {
        coordinate: "response-loss-after-bytes-and-tag-before-valid-provenance",
        attemptedFakeMutations: 1,
        committedFakeMutations: 1,
      },
      { coordinate: "post-publish-candidate-mismatch/bytes", attemptedFakeMutations: 1, committedFakeMutations: 1 },
      { coordinate: "post-publish-candidate-mismatch/integrity", attemptedFakeMutations: 1, committedFakeMutations: 1 },
      { coordinate: "post-publish-candidate-mismatch/size", attemptedFakeMutations: 1, committedFakeMutations: 1 },
      { coordinate: "registry-drift-after-first-mutation", attemptedFakeMutations: 1, committedFakeMutations: 1 },
      { coordinate: "main-advances-after-first-mutation", attemptedFakeMutations: 1, committedFakeMutations: 1 },
      { coordinate: "authority-drift-after-first-mutation", attemptedFakeMutations: 1, committedFakeMutations: 1 },
    ],
  );
  assert.deepEqual(
    release.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger
      .filter(({ candidateBinding }) => candidateBinding === "derived-hostile-candidate")
      .map(({ coordinate }) => coordinate),
    [
      "embedded-publish-config-invalid/missing",
      "embedded-publish-config-invalid/additional",
      "embedded-publish-config-invalid/non-canonical",
      "embedded-publish-config-invalid/registry-scoped-auth",
      "adopted-evidence-digest-mismatch/candidate-manifest",
      "adopted-evidence-digest-mismatch/candidate-tarball",
    ],
  );
  assert.deepEqual(release.fakeRegistry.exactProtectedBody, {
    bodies: ["protected-reauthorization", "publisher"],
    realGateSource: "releaseCertification.readiness",
    fakeGateSource: "releaseCertification.fakeRegistry.exactProtectedBodyCertification.certificationPurpose",
    status: "two-purpose-hard-cut",
    realExpected: "require-exact-three-role-readiness-before-first-registry-mutation",
    fakeExpected: "execute-exact-40-coordinate-state-machine-with-no-real-boundary",
    realBlockedMutationCount: 0,
    proves: [
      "real-purpose-readiness-gate-precedes-first-registry-mutation",
      "exact-fake-purpose-executes-shared-protected-bodies-and-state-machine",
    ],
    doesNotProve: [
      "npm-upload",
      "provenance",
      "publication",
    ],
  });
  assert.equal(
    release.fakeRegistry.hypotheticalStateMachine.status,
    "reference-oracle-only-not-certification",
  );
  assert.equal(
    release.fakeRegistry.hypotheticalStateMachine.testSubject,
    "independent-oracle-compared-with-exact-protected-body",
  );
  assert.equal(release.fakeRegistry.hypotheticalStateMachine.coordinateCount, 40);
  assert.equal(release.fakeRegistry.hypotheticalStateMachine.failureInvariant, "no-later-mutation");
  assert.equal(release.fakeRegistry.hypotheticalStateMachine.mutationCountAssertion, "required-exact-per-case");
  assert.deepEqual(release.fakeRegistry.hypotheticalStateMachine.forbiddenRecoveryCommands, [
    "repack",
    "dist-tag",
    "unpublish",
    "external-credential",
  ]);
  assert.deepEqual(release.fakeRegistry.hypotheticalStateMachine.proves, [
    "algorithmic-convergence-and-fail-closed-state-transitions-at-fake-boundaries",
  ]);
  assert.deepEqual(release.fakeRegistry.hypotheticalStateMachine.doesNotProve, [
    "exact-protected-body-execution",
    "npm-upload",
    "provenance",
    "publication",
  ]);
});

test("uses the canonical generated contract directly for fake release fixtures", () => {
  const canonical = buildContract(inputs);
  assert.equal(
    canonical.releaseCertification.fakeRegistry.exactProtectedBodyCertification.status,
    "supported",
  );
  assert.equal(
    canonical.releaseCertification.fakeRegistry.exactProtectedBodyCertification.artifactDisposition,
    "required-on-terminal-workflow-success",
  );
  assert.equal(canonical.releaseCertification.finalPublicVerification.status, "ready");
  assert.equal(
    canonical.releaseCertification.finalPublicVerification.artifactDisposition,
    "allowed-on-terminal-readiness-success",
  );
  assert.strictEqual(validateContract(canonical, inputs), canonical);

  const blockedPeer = structuredClone(canonical);
  blockedPeer.releaseCertification.fakeRegistry.exactProtectedBodyCertification.status = "blocked";
  assert.throws(
    () => validateContract(blockedPeer, inputs),
    /release certification policy does not match the canonical generated policy/u,
  );
});

test("freezes the exact v0.6 Apple receipt schemas, coordinates, categories, and verdict dependencies", () => {
  const apple = contract.releaseCertification.apple;
  const coordinates = [
    "N-native-mechanics|macos-aarch64",
    "N-native-mechanics|macos-x64",
    "P-signed-bun-app|macos-aarch64",
    "P-signed-bun-app|macos-x64",
    "P-signed-deno-app|macos-aarch64",
    "P-signed-deno-app|macos-x64",
    "P-notarized-stapled-app-private-zip|macos-aarch64",
    "P-notarized-stapled-app-private-zip|macos-x64",
    "P-notarized-stapled-dmg|macos-aarch64",
    "P-notarized-stapled-dmg|macos-x64",
    "P-notarized-stapled-pkg|macos-aarch64",
    "P-notarized-stapled-pkg|macos-x64",
    "G-app|macos-aarch64",
    "G-app|macos-x64",
    "G-dmg|macos-aarch64",
    "G-dmg|macos-x64",
    "G-pkg|macos-aarch64",
    "G-pkg|macos-x64",
    "A0",
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
  ];
  assert.deepEqual(apple.hostedExecution, {
    protocol: "effect-build/apple-hosted-execution@1",
    status: "blocked",
    blockerIds: [
      "released-qualified-ts-release-journal-and-pinned-reusable-workflow",
      "exact-aws-account-bucket-region-role-prefix-and-oidc-job-workflow-ref",
      "frozen-apple-credential-layer-and-secret-name-inventory",
      "bundled-producer-and-clean-host-executor-identities",
      "qualified-arm64-x64-native-and-clean-host-runner-interfaces",
    ],
    artifactDisposition: "forbidden-while-blocked",
    protectedStageIds: ["sign-app", "submit-product", "continue-notary"],
    activationInterfaces: {
      protocol: "effect-build/apple-hosted-activation-interfaces@1",
      status: "unconfigured",
      producer: {
        status: "unconfigured",
        bundleProtocol: "effect-build/apple-producer-bundle@1",
        sourceSha: null,
        bundleDigest: null,
      },
      verifier: {
        status: "unconfigured",
        bundleProtocol: "effect-build/apple-clean-host-verifier-bundle@1",
        sourceSha: null,
        bundleDigest: null,
      },
      certificates: {
        status: "unconfigured",
        teamId: null,
        applicationSha1: null,
        installerSha1: null,
      },
      environment: {
        status: "provisioned-policy-only",
        authorityScope: "environment-policy-only-not-credential-or-runner-qualification",
        repository: "mannyc2/effect-build",
        repositoryId: "1331906770",
        repositoryOwnerId: "126291407",
        environmentId: "20977544910",
        name: "apple-certification",
        canAdminsBypass: true,
        reviewer: {
          id: 126291407,
          login: "mannyc2",
          type: "User",
          preventSelfReview: false,
        },
        branchPolicy: {
          name: "main",
          type: "branch",
          deploymentBranchPolicy: {
            customBranchPolicies: true,
            protectedBranches: false,
          },
          exactProtectionRuleTypes: ["branch_policy", "required_reviewers"],
          branchPolicies: [{ name: "main", type: "branch" }],
        },
        secretNames: [],
        variableNames: [],
        oidcSubjectPolicy: {
          use_default: true,
          use_immutable_subject: true,
          sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
        },
      },
      credentialLayer: {
        status: "unconfigured",
        type: null,
        environment: "apple-certification",
        secretNames: [],
      },
      journal: {
        status: "unconfigured",
        packageName: "@mannyc1/ts-release",
        packageVersion: null,
        sourceSha: null,
        reusableWorkflowRef: null,
        reusableWorkflowSha: null,
        codecId: null,
      },
      aws: {
        status: "unconfigured",
        accountId: null,
        bucketArn: null,
        region: null,
        roleArn: null,
        prefix: "operation-journal/v1",
        retentionPolicyDigest: null,
        iamPolicyDigest: null,
        bucketPolicyDigest: null,
        oidcTrustPolicyDigest: null,
        oidcJobWorkflowRef: null,
        oidcJobWorkflowSha: null,
      },
      runners: {
        status: "unqualified",
        receiptPins: [
          ["N-native", "macos-aarch64"],
          ["N-native", "macos-x64"],
          ["P-signed-app", "macos-aarch64"],
          ["P-signed-app", "macos-x64"],
          ["P-notarized-product", "macos-aarch64"],
          ["P-notarized-product", "macos-x64"],
          ["G-clean-host", "macos-aarch64"],
          ["G-clean-host", "macos-x64"],
          ["A-verdict", null],
        ].map(([category, coordinateArchitecture]) => ({
          category,
          coordinateArchitecture,
          status: "unqualified",
          runnerLabel: null,
          platform: null,
          architecture: null,
          image: null,
          runnerEnvironment: null,
        })),
      },
      continuation: {
        status: "unconfigured",
        initialDelaySeconds: null,
        pollIntervalSeconds: null,
        maximumPolls: null,
        maximumElapsedSeconds: null,
      },
    },
  });
  assert.deepEqual(apple.protocols, {
    request: "effect-build/apple-certification-request@3",
    receipt: "effect-build/apple-certification-receipt@3",
    evidence: "effect-build/apple-certification-evidence@3",
    priorEvidence: "effect-build/apple-certification-prior-evidence@2",
    bundle: "effect-build/apple-certification-bundle@3",
    index: "effect-build/apple-certification-index@2",
  });
  assert.equal(apple.workflowPath, ".github/workflows/apple-certification.yml");
  assert.equal(
    apple.workflow,
    "mannyc2/effect-build/.github/workflows/apple-certification.yml@refs/heads/main",
  );
  assert.deepEqual(apple.artifact, {
    name: "effect-build-v0.6.0-apple-certification",
    retentionDays: 30,
    orderedFiles: ["apple-certification-index.json", "effect-build-v0.6.0-apple-certification.bin"],
    attempt: 1,
  });
  assert.deepEqual(apple.productLineage, {
    canonicalDistributionProvider: "bun",
    canonicalDistributionVersion: "1.3.14",
    products: ["app", "dmg", "pkg"],
    denoCoverage: "signed-app-only",
    privateAppTransport: "zip-not-a-product",
    forbiddenProducts: ["public-zip", "clean-host-zip", "macos-node-sea"],
  });
  assert.equal(
    apple.publicCapabilitySource,
    "producerCapabilityRegister.capabilities family=apple visibility=public",
  );
  assert.equal(apple.publicCapabilityCount, 13);
  assert.deepEqual(apple.coordinates, coordinates);
  assert.deepEqual(apple.counts, { total: 28, N: 2, P: 10, G: 6, A: 10 });
  assert.deepEqual(apple.notaryJournal, {
    protocol: "effect-build-apple/notary-journal@1",
    submissionCodec: "effect-build-apple/notary-journal@1",
  });
  assert.deepEqual(apple.commonReceiptFields, [
    "protocol",
    "coordinate",
    "sourceSha",
    "candidateCoordinate",
    "workflowCoordinate",
    "producerDigest",
    "verifierDigest",
    "observedAt",
    "runnerIdentity",
    "evidenceDigest",
    "dependencies",
    "verdict",
  ]);
  assert.deepEqual(apple.encoding, {
    canonicalJson: "utf8-nfc-recursive-lexicographic-keys-no-insignificant-whitespace-final-lf",
    digest: "releaseCertification.githubArtifactDigest",
    bundleFraming: "protocol-line-u32be-canonical-header-u64be-opaque-payload",
    bundleHeaderFields: [
      "protocol",
      "sourceSha",
      "candidateCoordinate",
      "workflowCoordinate",
      "receiptProtocol",
      "receiptCount",
      "receiptsDigest",
      "receipts",
      "evidenceProtocol",
      "evidenceEntries",
      "payloadBytes",
      "payloadDigest",
    ],
    evidenceEntryFields: ["id", "protocol", "coordinate", "offset", "bytes", "digest"],
    indexFields: [
      "protocol",
      "sourceSha",
      "candidateCoordinate",
      "workflowCoordinate",
      "bundleProtocol",
      "bundleFile",
      "bundleBytes",
      "bundleDigest",
      "receiptCount",
      "orderedCoordinates",
      "receiptsDigest",
      "payloadBytes",
      "payloadDigest",
      "verdict",
    ],
    terminalVerdict: "success",
    offsetAndByteEncoding: "canonical-nonnegative-decimal-string",
    payloadLayout: "ordered-contiguous-zero-based-no-gaps-no-trailing-bytes",
  });
  assert.deepEqual(apple.operationToolLineage, {
    order: "first-executed-distinct-tool",
    componentFields: ["name", "capabilityId"],
    byOperationId: {
      "PROD-APPLE-001": { app: [{ name: "plutil", capabilityId: "plist-lint" }] },
      "PROD-APPLE-002": { app: [{ name: "codesign", capabilityId: "developer-id-signing" }] },
      "PROD-APPLE-003": { dmg: [{ name: "codesign", capabilityId: "developer-id-signing" }] },
      "PROD-APPLE-004": {
        pkg: [
          { name: "productsign", capabilityId: "installer-signing" },
          { name: "pkgutil", capabilityId: "package-signature-verification" },
        ],
      },
      "PROD-APPLE-005": {
        dmg: [
          { name: "codesign", capabilityId: "app-signature-verification" },
          { name: "hdiutil", capabilityId: "udzo-image" },
        ],
      },
      "PROD-APPLE-006": {
        pkg: [
          { name: "codesign", capabilityId: "app-signature-verification" },
          { name: "pkgbuild", capabilityId: "component-package" },
          { name: "productbuild", capabilityId: "flat-package" },
          { name: "pkgutil", capabilityId: "payload-verification" },
        ],
      },
      "PROD-APPLE-007": {
        dmg: [
          { name: "codesign", capabilityId: "signature-verification" },
          { name: "notarytool", capabilityId: "notarization" },
        ],
        pkg: [
          { name: "pkgutil", capabilityId: "package-signature-verification" },
          { name: "notarytool", capabilityId: "notarization" },
        ],
      },
      "PROD-APPLE-008": {
        app: [
          { name: "codesign", capabilityId: "signature-verification" },
          { name: "ditto", capabilityId: "archive-transport" },
          { name: "notarytool", capabilityId: "notarization" },
        ],
      },
      "PROD-APPLE-009": {
        app: [{ name: "notarytool", capabilityId: "notarization" }],
        dmg: [{ name: "notarytool", capabilityId: "notarization" }],
        pkg: [{ name: "notarytool", capabilityId: "notarization" }],
      },
      "PROD-APPLE-010": {
        app: [{ name: "notarytool", capabilityId: "notarization" }],
        dmg: [{ name: "notarytool", capabilityId: "notarization" }],
        pkg: [{ name: "notarytool", capabilityId: "notarization" }],
      },
      "PROD-APPLE-011": {
        app: [
          { name: "codesign", capabilityId: "signature-verification" },
          { name: "stapler", capabilityId: "ticket-stapling" },
        ],
      },
      "PROD-APPLE-012": {
        dmg: [
          { name: "codesign", capabilityId: "signature-verification" },
          { name: "stapler", capabilityId: "ticket-stapling" },
        ],
        pkg: [
          { name: "pkgutil", capabilityId: "package-signature-verification" },
          { name: "stapler", capabilityId: "ticket-stapling" },
        ],
      },
      "PROD-APPLE-013": {
        app: [
          { name: "spctl", capabilityId: "gatekeeper-assessment" },
          { name: "codesign", capabilityId: "signature-verification" },
        ],
        dmg: [
          { name: "spctl", capabilityId: "gatekeeper-assessment" },
          { name: "codesign", capabilityId: "signature-verification" },
        ],
        pkg: [
          { name: "spctl", capabilityId: "gatekeeper-assessment" },
          { name: "pkgutil", capabilityId: "package-signature-verification" },
        ],
      },
    },
  });
  assert.deepEqual(apple.receiptSchemas, {
    runnerIdentity: ["runnerLabel", "platform", "architecture", "image", "imageVersion", "runnerEnvironment"],
    digestIdentity: ["bytes", "digest"],
    executableIdentity: ["provider", "version", "architecture", "target", "nativeFormat", "bytes", "digest"],
    toolObservation: ["name", "version", "executableDigest", "observationDigest"],
    appleToolObservation: ["name", "version", "executableDigest", "observationDigest", "nativeObservation"],
    operationFact: ["operationId", "operation", "inputDigests", "outputDigests", "toolObservations"],
    pairMember: ["architecture", "artifactIdentity"],
    pairedAppManifest: ["provider", "version", "pairDigest", "members", "operationFacts"],
    treeArtifactIdentity: ["product", "architecture", "totalBytes", "manifestDigest"],
    fileArtifactIdentity: ["product", "architecture", "bytes", "digest"],
    pairIdentity: ["product", "provider", "pairDigest", "members"],
    certificateFacts: ["class", "teamId", "sha1", "notBefore", "notAfter"],
    verifierFacts: ["artifactDigest", "certificateSha1", "operationFacts", "toolObservations"],
    journalReference: [
      "protocol",
      "journalId",
      "submissionId",
      "intentRecordDigest",
      "intentSequence",
      "intentTransaction",
      "intentRereadRecordDigest",
      "submissionRecordDigest",
      "submissionSequence",
      "submissionTransaction",
      "submissionRereadRecordDigest",
      "submissionCodec",
      "submissionBytesDigest",
    ],
    acceptedInfo: ["submissionId", "providerStatus", "observationDigest", "toolObservation"],
    acceptedLog: ["submissionId", "providerStatus", "logDigest", "issueCount", "toolObservation"],
    stapleTicket: [
      "submissionId",
      "submittedKind",
      "submittedBytes",
      "submittedDigest",
      "targetKind",
      "targetIdentityKind",
      "targetBytes",
      "targetDigest",
      "targetArchitecture",
      "ticketDigest",
    ],
    assessment: ["product", "architecture", "accepted", "evidenceDigest", "toolObservations"],
    acquisitionTransportIdentity: ["kind", "bytes", "digest", "extractedProductDigest"],
    quarantineEvidence: ["applied", "propagated", "attributeDigest"],
    hostIdentity: ["image", "imageVersion", "architecture", "uid", "fresh", "forbiddenStateAbsent"],
    userFlowEvidence: ["flow", "orderedSteps", "evidenceDigest"],
    sentinelOrInstallEvidence: ["kind", "evidenceDigest"],
    cleanupEvidence: ["orderedSteps", "complete", "evidenceDigest"],
  });
  assert.deepEqual(apple.nativeOperationIds, ["CAN-BUN-012", "CAN-DENO-010"]);
  assert.deepEqual(apple.providerVersions, { bun: "1.3.14", deno: "2.9.5" });
  assert.deepEqual(apple.coordinateRuleFields, [
    "coordinate",
    "category",
    "architecture",
    "provider",
    "product",
    "artifactIdentitySchema",
    "dependencies",
    "operationIds",
    "fieldValues",
  ]);
  assert.equal(apple.receiptFieldPolicy, "closed-tagged-variants-additional-fields-forbidden");
  assert.deepEqual(
    apple.categories.map(({ id, coordinatePrefix, count, requiredFields, forbiddenFields }) => ({
      id,
      coordinatePrefix,
      count,
      requiredFields,
      forbiddenFields,
    })),
    [
      {
        id: "N-native",
        coordinatePrefix: "N-native-mechanics|",
        count: 2,
        requiredFields: [
          "architecture",
          "nativeToolObservations",
          "operationFacts",
          "bunExecutableIdentity",
          "denoExecutableIdentity",
        ],
        forbiddenFields: ["certificate", "credential", "journal", "submission"],
      },
      {
        id: "P-signed-app",
        coordinatePrefix: "P-signed-",
        count: 4,
        requiredFields: [
          "architecture",
          "pairedAppManifest",
          "artifactIdentity",
          "certificateFacts",
          "hardenedRuntime",
          "secureTimestamp",
          "verifierFacts",
        ],
        forbiddenFields: ["notary", "journal", "submission"],
      },
      {
        id: "P-notarized-product",
        coordinatePrefix: "P-notarized-",
        count: 6,
        requiredFields: [
          "signedAppDependency",
          "artifactIdentity",
          "pairIdentity",
          "certificateFacts",
          "journalReference",
          "acceptedInfo",
          "acceptedLog",
          "stapleTicket",
          "assessment",
          "toolObservations",
        ],
        forbiddenFields: ["credential", "privateLogBody"],
      },
      {
        id: "G-clean-host",
        coordinatePrefix: "G-",
        count: 6,
        requiredFields: [
          "producerDependency",
          "acquisitionTransportIdentity",
          "extractedProductIdentity",
          "quarantineEvidence",
          "hostIdentity",
          "userFlowEvidence",
          "sentinelOrInstallEvidence",
          "cleanupEvidence",
        ],
        forbiddenFields: ["credential", "signingIdentity", "journal", "submission"],
      },
      {
        id: "A-verdict",
        coordinatePrefix: "A",
        count: 10,
        requiredFields: ["namedClaims", "orderedDependencies", "subordinateEvidence"],
        forbiddenFields: ["productOutput", "credential", "submissionOwner"],
      },
    ],
  );
  assert.equal(apple.coordinateRules.length, 28);
  assert.deepEqual(apple.coordinateRules.map(({ coordinate }) => coordinate), coordinates);
  assert.deepEqual(apple.coordinateRules.slice(0, 2).map(({ operationIds }) => operationIds), [
    ["CAN-BUN-012", "CAN-DENO-010"],
    ["CAN-BUN-012", "CAN-DENO-010"],
  ]);
  assert.deepEqual(apple.coordinateRules.slice(2, 6).map(({ operationIds }) => operationIds), Array(4).fill([
    "PROD-APPLE-001",
    "PROD-APPLE-002",
  ]));
  assert.deepEqual(apple.coordinateRules.slice(6, 8).map(({ operationIds }) => operationIds), Array(2).fill([
    "PROD-APPLE-002",
    "PROD-APPLE-008",
    "PROD-APPLE-009",
    "PROD-APPLE-010",
    "PROD-APPLE-011",
    "PROD-APPLE-013",
  ]));
  assert.deepEqual(apple.coordinateRules.slice(8, 10).map(({ operationIds }) => operationIds), Array(2).fill([
    "PROD-APPLE-003",
    "PROD-APPLE-005",
    "PROD-APPLE-007",
    "PROD-APPLE-009",
    "PROD-APPLE-010",
    "PROD-APPLE-012",
    "PROD-APPLE-013",
  ]));
  assert.deepEqual(apple.coordinateRules.slice(10, 12).map(({ operationIds }) => operationIds), Array(2).fill([
    "PROD-APPLE-004",
    "PROD-APPLE-006",
    "PROD-APPLE-007",
    "PROD-APPLE-009",
    "PROD-APPLE-010",
    "PROD-APPLE-012",
    "PROD-APPLE-013",
  ]));
  assert.deepEqual(apple.coordinateRules.slice(12).map(({ operationIds }) => operationIds), Array(16).fill([]));
  assert.deepEqual(apple.coordinateRules.slice(2, 6).map(({ dependencies }) => dependencies), [
    [coordinates[0]],
    [coordinates[1]],
    [coordinates[0]],
    [coordinates[1]],
  ]);
  assert.deepEqual(apple.coordinateRules.slice(6, 12).map(({ dependencies }) => dependencies), [
    [coordinates[2]],
    [coordinates[3]],
    [coordinates[2], coordinates[3]],
    [coordinates[2], coordinates[3]],
    [coordinates[2], coordinates[3]],
    [coordinates[2], coordinates[3]],
  ]);
  assert.deepEqual(apple.coordinateRules.slice(12, 18).map(({ dependencies }) => dependencies),
    coordinates.slice(6, 12).map((coordinate) => [coordinate]));
  assert.deepEqual(apple.coordinateRules.slice(6, 12).map(({ fieldValues }) => fieldValues), [
    { signedAppDependency: coordinates[2] },
    { signedAppDependency: coordinates[3] },
    { signedAppDependency: coordinates[2] },
    { signedAppDependency: coordinates[3] },
    { signedAppDependency: coordinates[2] },
    { signedAppDependency: coordinates[3] },
  ]);
  const cleanHostFlows = {
    app: {
      userFlow: "app-launchservices",
      userFlowSteps: [
        "authenticate-acquisition-envelope",
        "acquire-app-preserving-symlinks-and-modes",
        "apply-quarantine",
        "prove-quarantine-propagation",
        "launch-app-via-launchservices-as-normal-user",
        "observe-launch-sentinel",
      ],
      sentinelOrInstallKind: "launch-sentinel",
      cleanupSteps: ["terminate-launched-app", "remove-acquired-app", "prove-target-product-state-absent"],
    },
    dmg: {
      userFlow: "dmg-mount-and-launchservices-app",
      userFlowSteps: [
        "authenticate-acquisition-envelope",
        "acquire-dmg",
        "apply-quarantine",
        "mount-dmg",
        "prove-quarantine-propagation-to-mounted-app",
        "launch-mounted-app-via-launchservices-as-normal-user",
        "observe-launch-sentinel",
      ],
      sentinelOrInstallKind: "launch-sentinel",
      cleanupSteps: [
        "terminate-launched-app",
        "unmount-dmg",
        "remove-acquired-dmg",
        "prove-target-product-state-absent",
      ],
    },
    pkg: {
      userFlow: "pkg-installer-receipt-and-files",
      userFlowSteps: [
        "authenticate-acquisition-envelope",
        "acquire-pkg",
        "apply-quarantine",
        "prove-quarantine-propagation",
        "install-pkg-with-installer-normal-user-flow",
        "observe-install-receipt-and-files",
      ],
      sentinelOrInstallKind: "install-receipt-and-files",
      cleanupSteps: [
        "remove-installed-files",
        "forget-package-receipt",
        "remove-acquired-pkg",
        "prove-target-product-state-absent",
      ],
    },
  };
  assert.deepEqual(apple.coordinateRules.slice(12, 18).map(({ fieldValues }) => fieldValues),
    coordinates.slice(6, 12).map((producerDependency, index) => {
      const product = ["app", "app", "dmg", "dmg", "pkg", "pkg"][index];
      return {
        producerDependency,
        runnerPlatform: "macos",
        runnerEnvironment: "github-hosted",
        uidFormat: "canonical-positive-decimal-string",
        acquisitionTransportKind: "authenticated-symlink-preserving-envelope",
        quarantinePolicy: {
          applied: true,
          propagated: true,
          forbiddenActions: ["remove-quarantine", "disable-gatekeeper", "override-rejection"],
        },
        ...cleanHostFlows[product],
        cleanupComplete: true,
      };
    }));
  assert.deepEqual(apple.verdicts.map(({ coordinate, dependencies }) => ({ coordinate, dependencies })), [
    {
      coordinate: "A0",
      dependencies: [
        "R-current-main",
        "exact-main-ci",
        "candidate",
        "contract-public-surface",
        "lockfile",
        "certifier",
        "clean-host-verifier",
        "protocol-identities",
      ],
    },
    { coordinate: "A1", dependencies: coordinates.slice(0, 2) },
    { coordinate: "A2", dependencies: coordinates.slice(2, 6) },
    { coordinate: "A3", dependencies: [...coordinates.slice(6, 8), ...coordinates.slice(12, 14)] },
    { coordinate: "A4", dependencies: coordinates.slice(6, 8) },
    { coordinate: "A5", dependencies: [...coordinates.slice(8, 10), ...coordinates.slice(14, 16)] },
    { coordinate: "A6", dependencies: [...coordinates.slice(10, 12), ...coordinates.slice(16, 18)] },
    { coordinate: "A7", dependencies: coordinates.slice(6, 12) },
    { coordinate: "A8", dependencies: coordinates.slice(2, 12) },
    { coordinate: "A9", dependencies: coordinates.slice(0, 27) },
  ]);
  assert.deepEqual(apple.verdicts.find(({ coordinate }) => coordinate === "A7")?.subordinateEvidence, [
    "accepted-both-architectures",
    "pending-both-architectures",
    "rejected-both-architectures",
    "info-and-log",
    "fresh-runner-resume",
    "service-failure",
    "interruption",
    "pre-ack-unknown-outcome",
  ]);
  assert.deepEqual(
    apple.coordinateRules.slice(18).map(({ fieldValues }) => fieldValues),
    apple.verdicts.map(({ claims, dependencies, subordinateEvidence }) => ({
      namedClaims: claims,
      orderedDependencies: dependencies,
      subordinateEvidence: subordinateEvidence ?? [],
    })),
  );
  assert.deepEqual(apple.evidenceDescriptorOrder, [
    ...coordinates,
    ...apple.verdicts.find(({ coordinate }) => coordinate === "A7").subordinateEvidence,
  ]);
  assert.deepEqual(
    apple.evidenceFileOrder,
    apple.evidenceDescriptorOrder.map((id) => ({ id, file: appleEvidenceFileName(id) })),
  );
});

test("rejects every release-certification policy mutation", () => {
  const rejects = (mutate) => {
    const changed = structuredClone(contract);
    mutate(changed.releaseCertification);
    assert.throws(
      () => validateContract(changed, inputs),
      /release certification policy does not match the canonical generated policy/u,
    );
  };

  rejects((release) => release.modes.push("legacy-fallback"));
  rejects((release) => release.publicAdmission.packageCount += 1);
  rejects((release) => release.publicAdmission.moduleCount -= 1);
  rejects((release) => release.githubArtifactDigest.canonicalPattern = "^[0-9a-f]{64}$");
  rejects((release) => release.githubArtifactDigest.uploadActionBoundary.normalization = "accept-both-forms");
  rejects((release) => release.githubArtifactCoordinate.orderedFields.pop());
  rejects((release) => release.candidate.protocol = "effect-build/npm-release-candidate@1");
  rejects((release) => release.candidate.workflow = "mannyc2/effect-build/.github/workflows/peer.yml@refs/heads/main");
  rejects((release) => release.githubAuthority.branchPolicy.name = "peer-main");
  rejects((release) => release.githubAuthority.readOnlyTransport.artifactRedirectHostPolicy.suffixes.push("example.com"));
  rejects((release) => release.githubAuthority.readOnlyTransport.releaseAssetRedirectHostPolicy.hosts.push("example.com"));
  rejects((release) => release.githubAuthority.readOnlyTransport.artifactRedirectHostPolicy.maximumRedirects = 2);
  rejects((release) => release.githubAuthority.readOnlyTransport.releaseAssetRedirectHostPolicy.directStatuses.push(206));
  rejects((release) => release.githubAuthority.readOnlyTransport.metadataTotalTimeoutMilliseconds += 1);
  rejects((release) => release.githubAuthority.readOnlyTransport.artifactTotalTimeoutMilliseconds += 1);
  rejects((release) => release.githubAuthority.reviewer.id += 1);
  rejects((release) => release.githubAuthority.oidcSubjectPolicy.sub_claim_prefix += ":peer");
  rejects((release) => release.githubAuthority.authorizationSplit.protectedGithubTokenObservations.push(
    "repository-secret-name-inventory",
  ));
  rejects((release) => release.githubAuthority.authorizationSplit.administrativeExternalOnly.pop());
  rejects((release) => release.githubAuthority.authorizationSplit.forbiddenCredentialEscalation.pop());
  rejects((release) => release.scope.npmPackages.appleApiLibrary = "excluded");
  rejects((release) => release.scope.credentialBackedAppleArtifacts.status = "passed");
  rejects((release) => release.scope.credentialBackedAppleArtifacts.releaseGate = "required");
  rejects((release) => release.scope.awsNotaryJournalEvidence.releaseGate = "required");
  rejects((release) => release.npmAdministrativeInventory.status = "observed");
  rejects((release) => release.npmAdministrativeInventory.doesNotProve.pop());
  rejects((release) => release.dependencyBootstrap.client.version = "latest");
  rejects((release) => release.dependencyBootstrap.command.arguments.pop());
  rejects((release) => release.dependencyBootstrap.lockfile.nonWorkspaceIntegrityPattern = ".*");
  rejects((release) => release.dependencyBootstrap.registries.scopes["@jsr"] = "https://registry.npmjs.org");
  rejects((release) => release.dependencyBootstrap.environment.configurationFiles.projectNpmrc.digest = "sha256:" + "0".repeat(64));
  rejects((release) => release.dependencyBootstrap.environment.configurationFiles.bunfig.path = "bunfig.toml");
  rejects((release) => release.readiness.coordinate = "optional");
  rejects((release) => release.readiness.bundleProtocol += "-fallback");
  rejects((release) => release.readiness.orderedFiles.reverse());
  rejects((release) => release.readiness.aggregateMaximumAgeSeconds = 31536000);
  rejects((release) => release.readiness.zipExtraction.creatorVersionMadeBy = 20);
  rejects((release) => release.readiness.zipExtraction.requiredVersionNeeded = 45);
  rejects((release) => release.readiness.zipExtraction.protectedProjection.sourceDigest = "sha256:" + "0".repeat(64));
  rejects((release) => release.readiness.zipExtraction.protectedProjection.sourceBytes += 1);
  rejects((release) => release.readiness.zipExtraction.maximumArchiveBytes = 1073741824);
  rejects((release) => release.readiness.zipExtraction.maximumCompressionRatio = 1000);
  rejects((release) => release.readiness.zipExtraction.maximumMemberCompressedBytes = 67108864);
  rejects((release) => release.readiness.zipExtraction.maximumMemberUncompressedBytes = 67108864);
  rejects((release) => release.readiness.zipExtraction.maximumTotalUncompressedBytes = 1073741824);
  rejects((release) => release.readiness.zipExtraction.allowedCompressionMethods.push(12));
  rejects((release) => release.candidate.tarballInspection.maximumCompressedBytes = 67108864);
  rejects((release) => release.candidate.tarballInspection.maximumUnpackedBytes = 536870912);
  rejects((release) => release.candidate.tarballInspection.protectedProjection.sourceDigest = "sha256:" + "0".repeat(64));
  rejects((release) => release.readiness.candidate.maximumValiditySeconds = 31536000);
  rejects((release) => release.readiness.dispatch.evidenceInputs.reverse());
  rejects((release) => release.provenanceVerification.purpose = "external-receipts");
  rejects((release) => release.provenanceVerification.client.version = "latest");
  rejects((release) => release.provenanceVerification.runtime.version = "latest");
  rejects((release) => release.provenanceVerification.maximumBundleBytes += 1);
  rejects((release) => release.provenanceVerification.bundleClient.version = "latest");
  rejects((release) =>
    release.provenanceVerification.networkGuard.digest = "sha256:" + "0".repeat(64));
  rejects((release) =>
    release.provenanceVerification.trustedRoot.digest = "sha256:" + "0".repeat(64));
  rejects((release) =>
    release.provenanceVerification.trustedRoot.tuf.acquisition.clients[0].integrity = "sha512-peer"
  );
  rejects((release) => release.provenanceVerification.bundleMediaType += ";legacy=1");
  rejects((release) => release.provenanceVerification.certificateIssuer = "https://example.invalid");
  rejects((release) => release.readiness.candidate.referenceType = "evidence-role");
  rejects((release) => release.readiness.referenceShapes.githubArtifact.pop());
  rejects((release) => release.readiness.evidenceRoles.pop());
  rejects((release) => release.readiness.evidenceRoles[0].role = "candidate");
  rejects((release) => release.readiness.evidenceRoles[0].protocol += "-peer");
  rejects((release) => release.readiness.evidenceRoles[0].terminal = "pending");
  rejects((release) => release.readiness.evidenceRoles[0].workflow += "-peer");
  rejects((release) => release.readiness.evidenceRoles[0].event = "workflow_dispatch");
  rejects((release) => release.readiness.evidenceRoles[0].maximumAgeSeconds = 31536000);
  rejects((release) => release.readiness.evidenceRoles[1].artifactName += "-peer");
  rejects((release) => release.finalPublicVerification.status = "blocked");
  rejects((release) => release.finalPublicVerification.publicState.requiredChecks.pop());
  rejects((release) => release.finalPublicVerification.releasePolicy.targetShaSource = "release-target-commitish");
  rejects((release) => release.finalPublicVerification.releasePolicy.targetCommitishSource = "dispatch.source_sha");
  rejects((release) => release.finalPublicVerification.releaseAssetCount -= 1);
  rejects((release) => release.finalPublicVerification.implementation.status = "placeholder");
  rejects((release) => release.finalPublicVerification.implementation.observationFields.npmPackage.pop());
  rejects((release) => release.finalPublicVerification.implementation.provenance.workflow += "-peer");
  rejects((release) => release.finalPublicVerification.implementation.consumerSmoke.representativePipelines.pop());
  rejects((release) => release.finalPublicVerification.implementation.consumerSmoke.node.configurationIsolation = "ambient");
  rejects((release) => release.finalPublicVerification.implementation.reservation.ledger.sha256 = "0".repeat(64));
  rejects((release) => release.finalPublicVerification.receipt.fields.pop());
  rejects((release) => release.npmOidcCertification.client.npm = "latest");
  rejects((release) => release.npmOidcCertification.protectedReadOnlyTransport.oidcRequest.hostPattern = ".*");
  rejects((release) => release.npmOidcCertification.protectedReadOnlyTransport.oidcRequest.initialQuery = "");
  rejects((release) => release.npmOidcCertification.protectedReadOnlyTransport.request.redirects = 1);
  rejects((release) =>
    release.npmOidcCertification.protectedReadOnlyTransport.request.oidcSequenceTotalTimeoutMilliseconds += 1
  );
  rejects((release) => release.npmOidcCertification.protectedReadOnlyTransport.request.tlsRootPolicy = "system");
  rejects((release) => release.npmOidcCertification.evidence.artifactProtocol += "-peer");
  rejects((release) => release.npmOidcCertification.evidence.protocols.githubOidcClaims += "-fallback");
  rejects((release) => release.npmOidcCertification.evidence.artifactName += "-peer");
  rejects((release) => release.npmOidcCertification.evidence.retentionDays = 1);
  rejects((release) => release.npmOidcCertification.evidence.orderedFiles.reverse());
  rejects((release) => release.npmOidcCertification.evidence.receiptSchemas.githubOidcClaims.pop());
  rejects((release) => release.npmOidcCertification.evidence.receiptSchemas.exchange.pop());
  rejects((release) => release.npmOidcCertification.evidence.receiptClaims.npmOidcExchangeAccepted.proves.pop());
  rejects((release) => release.npmOidcCertification.sourceDigests[0].sha256 = "0".repeat(64));
  rejects((release) => release.npmOidcCertification.forbiddenEnvironmentNames.pop());
  rejects((release) => release.fakeRegistry.exactProtectedBody.realBlockedMutationCount = 1);
  rejects((release) => release.fakeRegistry.localQualification.readinessAdmissible = true);
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.status = "blocked");
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose.transportOnlySelectorValue = "generic-test");
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose.sourceFiles[0].sha256 = "0".repeat(64));
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger[0].candidateBinding = "peer-fixture");
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.requiredClaims.pop());
  rejects((release) => release.fakeRegistry.exactProtectedBody.doesNotProve.pop());
  rejects((release) => release.fakeRegistry.hypotheticalStateMachine.coordinateCount -= 1);
  rejects((release) => release.fakeRegistry.hypotheticalStateMachine.cases.pop());
  rejects((release) => release.fakeRegistry.hypotheticalStateMachine.cases[0].expected = "best-effort");
  rejects((release) => release.apple.protocols.receipt = "effect-build/apple-certification-receipt@2");
  rejects((release) => release.apple.hostedExecution.status = "supported");
  rejects((release) => release.apple.hostedExecution.blockerIds.pop());
  rejects((release) => release.apple.hostedExecution.protectedStageIds.push("peer-stage"));
  rejects((release) => release.apple.hostedExecution.activationInterfaces.status = "configured");
  rejects((release) => release.apple.hostedExecution.activationInterfaces.producer.bundleDigest = `sha256:${"0".repeat(64)}`);
  rejects((release) => release.apple.hostedExecution.activationInterfaces.certificates.teamId = "ABCDE12345");
  rejects((release) => release.apple.hostedExecution.activationInterfaces.environment.canAdminsBypass = false);
  rejects((release) => release.apple.hostedExecution.activationInterfaces.credentialLayer.secretNames.push("PEER_SECRET"));
  rejects((release) => release.apple.hostedExecution.activationInterfaces.journal.packageVersion = "0.0.0-peer");
  rejects((release) => release.apple.hostedExecution.activationInterfaces.aws.accountId = "123456789012");
  rejects((release) => release.apple.hostedExecution.activationInterfaces.runners.receiptPins[0].image = "peer-image");
  rejects((release) => release.apple.hostedExecution.activationInterfaces.continuation.maximumPolls = 1);
  rejects((release) => release.apple.productLineage.denoCoverage = "distribution-fallback");
  rejects((release) => release.apple.publicCapabilityCount -= 1);
  rejects((release) => release.apple.coordinates.reverse());
  rejects((release) => release.apple.counts.P -= 1);
  rejects((release) => release.apple.categories[2].forbiddenFields.pop());
  rejects((release) => release.apple.workflow += "-peer");
  rejects((release) => release.apple.commonReceiptFields.splice(6, 1));
  rejects((release) => release.apple.operationToolLineage.order = "caller-order");
  rejects((release) => release.apple.operationToolLineage.byOperationId["PROD-APPLE-006"].pkg.pop());
  rejects((release) =>
    release.apple.operationToolLineage.byOperationId["PROD-APPLE-013"].pkg[1].capabilityId = "payload-verification"
  );
  rejects((release) => release.apple.receiptSchemas.operationFact.pop());
  rejects((release) => release.apple.receiptSchemas.journalReference.splice(6, 1));
  rejects((release) => (release.apple.receiptSchemaRules.journalReference.intentReread = "optional"));
  rejects((release) => release.apple.receiptSchemaRules.positiveDecimalFields.pop());
  rejects((release) => release.apple.coordinateRules[0].operationIds.pop());
  rejects((release) => release.apple.evidenceDescriptorOrder.pop());
  rejects((release) => release.apple.verdicts[9].dependencies.pop());
});

test("rejects Sigstore trust-material, retained-chain, and same-record lock-integrity mutations", () => {
  const rejectsInputs = (changed) => assert.throws(
    () => validateContract(buildContract(changed), changed),
  );

  rejectsInputs({
    ...inputs,
    sigstoreTrustedRootSource: inputs.sigstoreTrustedRootSource.replace('"mediaType"', '"peerType"'),
  });

  const evidence = new Map(inputs.sigstoreTufEvidenceSources);
  const targetsPath = contract.releaseCertification.provenanceVerification.trustedRoot.tuf
    .acquisition.metadata.targets.path;
  const targets = evidence.get(targetsPath);
  evidence.set(targetsPath, `${targets.slice(0, -2)}A\n`);
  rejectsInputs({ ...inputs, sigstoreTufEvidenceSources: evidence });

  const [left, right] = contract.releaseCertification.provenanceVerification.trustedRoot
    .tuf.acquisition.clients;
  const relocatedLockIntegrity = inputs.lockfileSource
    .replace(left.integrity, "sha512-integrity-swap-sentinel")
    .replace(right.integrity, left.integrity)
    .replace("sha512-integrity-swap-sentinel", right.integrity);
  rejectsInputs({ ...inputs, lockfileSource: relocatedLockIntegrity });

  const packageManifest = structuredClone(inputs.packageManifest);
  packageManifest.devDependencies["@tufjs/models"] = "4.0.0";
  rejectsInputs({ ...inputs, packageManifest });
});

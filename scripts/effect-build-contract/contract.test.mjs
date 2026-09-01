import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { appleEvidenceFileName } from "../apple-certification/canonical.mjs";
import {
  buildContract,
  buildSupportedReleaseFixtureContract,
  readInputs,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
  validateSupportedReleaseFixtureContract,
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
    permission: "publish",
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
});

test("freezes one exact release-certification policy without copying public package or module sets", () => {
  const release = contract.releaseCertification;
  const publicPackageNames = Object.keys(contract.publicApiProjection.packages).sort();
  const expectedAuthorityCheckIds = [
    "github.repository.secrets",
    "github.repository.variables",
    "github.environment.secrets",
    "github.environment.variables",
    "github.environment.policy",
    "github.environment.branchPolicies",
    "github.oidc",
    "npm.client",
    "npm.authentication",
    "npm.trust.projection",
    ...publicPackageNames.map((name) => `npm.trust.${name}`),
    ...publicPackageNames.map((name) => `npm.allowedAction.${name}`),
    "packages.projection",
    ...publicPackageNames.map((name) => `packages.${name}.repository`),
  ];
  assert.deepEqual(release.modes, [
    "prepare-exact-sha",
    "certify-exact-sha",
    "publish-certified-bytes",
  ]);
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
  assert.deepEqual(release.readiness, {
    protocol: "effect-build/release-readiness@1",
    bundleProtocol: "effect-build/release-readiness-evidence-bundle@1",
    bundleFraming: "protocol-line-u32be-canonical-header-u64be-opaque-payload",
    zipExtraction: {
      protocol: "effect-build/strict-flat-zip@1",
      allowedCompressionMethods: [0, 8],
      allowedGeneralPurposeBitMask: 2056,
      allowedExtraFieldIds: [],
      creatorVersionMadeBy: 813,
      requiredVersionNeeded: 20,
      protectedProjection: {
        sourcePath: "scripts/release/zip-protocol.mjs",
        sourceBytes: 15670,
        sourceDigest: "sha256:5a1428e693256fa78abf7358bbf5477b682e4205489cae2c78ef61fd1c2b48a1",
        compressedBytes: 3810,
        encoding: "deflate-raw-base64-data-url-exact-source",
      },
      maximumArchiveBytes: 67108864,
      maximumEntries: 64,
      maximumNameBytes: 255,
      maximumExtraBytes: 4096,
      maximumMemberCompressedBytes: 16777216,
      maximumMemberUncompressedBytes: 16777216,
      maximumTotalUncompressedBytes: 67108864,
      maximumCompressionRatio: 200,
      dataDescriptor: "required-signed-16-byte-exact-central-correlation-when-bit-3-set",
      topology: "single-disk-zero-comment-no-zip64-no-prefix-trailer-or-record-gaps",
      members: "unique-flat-utf8-regular-files-only",
      encryption: "forbidden",
      crc32: "required-before-admission",
    },
    externalEvidencePolicy: "closed-receipts-require-contract-pinned-sigstore-dsse-authentication",
    externalEvidenceManifest: {
      validation: "closed-shape-source-time-terminal-identity-digest-and-byte-correlation",
      producerAuthentication: "required-before-readiness-artifact-production",
      authenticationRequiredRoles: ["npm-authority", "operational-journal", "github-release-governance"],
    },
    externalEvidenceAuthentication: {
      status: "blocked",
      artifactDisposition: "forbidden-while-blocked",
      blocker: "contract-pinned-external-producer-identities-and-provisioned-signers-not-established",
      requiredEnvelope: "sigstore-bundle-v0.3-dsse",
      requiredBindings: [
        "producer-workflow-identity",
        "producer-source-sha",
        "release-source-sha",
        "receipt-protocol",
        "receipt-digest",
        "observed-at",
        "expiration",
      ],
      verifier: {
        status: "implemented",
        module: "scripts/release/sigstore-dsse-verifier.mjs",
        client: { package: "@sigstore/verify", version: "3.1.1" },
        bundleClient: { package: "@sigstore/bundle", version: "4.0.0" },
        protobufClient: { package: "@sigstore/protobuf-specs", version: "0.5.2" },
        runtime: { executable: "node", version: "24.14.1" },
        networkGuard: {
          path: "scripts/release/deny-network.cjs",
          bytes: 4379,
          digest: "sha256:acb4f347c8abb4dbc98d138b487b7cf316a3ccbbbf3a2da2108e68e9b343de77",
          strategy: "preload-standard-node-network-api-denial-plus-audited-direct-verifier-closure",
        },
        trustedRoot: {
          path: "tooling/sigstore/trusted_root.json",
          artifactFile: "sigstore-trusted-root.json",
          mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
          bytes: 6787,
          digest: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
          tuf: {
            mirror: "https://tuf-repo-cdn.sigstore.dev",
            target: "trusted_root.json",
            targetsMetadataVersion: 14,
            targetLength: 6787,
            targetSha256: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
            acquisition: {
              retrievedAt: "2026-08-30T15:07:03.000Z",
              cache: "fresh-empty-temporary-directory",
              home: "isolated-empty-directory",
              network: "exact-official-mirror-only",
              evidenceEncoding: "base64-of-exact-retrieved-bytes",
              verificationModule: "scripts/release/verify-sigstore-tuf-provenance.mjs",
              clients: [
                {
                  package: "@sigstore/tuf",
                  version: "4.0.2",
                  integrity: "sha512-TCAzTy0xzdP79EnxSjq9KQ3eaR7+FmudLC6eRKknVKZbV7ZNlGLClAAQb/HMNJ5n2OBNk2GT1tEmU0xuPr+SLQ==",
                },
                {
                  package: "tuf-js",
                  version: "4.1.0",
                  integrity: "sha512-50QV99kCKH5P/Vs4E2Gzp7BopNV+KzTXqWeaxrfu5IQJBOULRsTIS9seSsOVT8ZnGXzCyx55nYWAi4qJzpZKEQ==",
                },
                {
                  package: "@tufjs/models",
                  version: "4.1.0",
                  integrity: "sha512-Y8cK9aggNRsqJVaKUlEYs4s7CvQ1b1ta2DVPyAimb0I2qhzjNk+A+mxvll/klL0RlfuIUei8BF7YWiua4kQqww==",
                },
              ],
              seedRoot: {
                path: "tooling/sigstore/tuf/seed-root-v14.json.base64",
                version: 14,
                expiresAt: "2026-06-22T13:27:01.000Z",
                bytes: 5490,
                digest: "sha256:c8c41ec13f06ccabf5b48541ee2550098b4c7b5349e1d180390c29a7d5c2642c",
                clientSeedsBytes: 19326,
                clientSeedsDigest: "sha256:1300a33af16967e998983b364ab9988cd5c20e94c44e75d642dbeda1dbc255d9",
              },
              metadata: {
                root: {
                  path: "tooling/sigstore/tuf/root-v15.json.base64",
                  version: 15,
                  expiresAt: "2026-11-20T13:58:18.000Z",
                  bytes: 5630,
                  digest: "sha256:73747011d0857ada15479a16c4cae0f3ed03aac698b523b97e1de314ac9d9ca8",
                },
                timestamp: {
                  path: "tooling/sigstore/tuf/timestamp-v769.json.base64",
                  version: 769,
                  expiresAt: "2026-09-05T19:19:49.000Z",
                  bytes: 449,
                  digest: "sha256:fa85cf89eeeec634759809a793a6056940f57c47b9fa1da4d095b0f9852e18c4",
                },
                snapshot: {
                  path: "tooling/sigstore/tuf/snapshot-v165.json.base64",
                  version: 165,
                  expiresAt: "2036-05-15T08:09:16.000Z",
                  bytes: 1760,
                  digest: "sha256:8f784ab614ec62bfdd5f568eb2a2e3011668449ba235ed4eb7befa99f8469933",
                },
                targets: {
                  path: "tooling/sigstore/tuf/targets-v14.json.base64",
                  version: 14,
                  expiresAt: "2036-05-09T09:00:52.000Z",
                  bytes: 4942,
                  digest: "sha256:6a697f7f8908c8ab26c11786ecb490b54acec97fa8c802e399f065f8a0cc1acd",
                },
              },
              verification: "retained-seed-root-rotation-signatures-expiry-versions-descriptors-and-target-bytes-replay",
            }
          },
          verification: "offline-direct-verifier-no-tuf-network-or-cache-fallback",
        },
        bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        bundleFields: ["mediaType", "verificationMaterial", "dsseEnvelope"],
        verificationMaterialFields: [
          "certificate",
          "tlogEntries",
          "timestampVerificationData",
        ],
        timestampVerificationDataFields: [],
        envelopeFields: ["payload", "payloadType", "signatures"],
        signatureFields: ["sig"],
        payloadType: "application/vnd.effect-build.release-evidence+json;version=1",
        payloadProtocol: "effect-build/authenticated-external-evidence@1",
        payloadFields: [
          "schema",
          "role",
          "producerWorkflow",
          "producerSourceSha",
          "releaseSourceSha",
          "receiptProtocol",
          "receiptBytes",
          "receiptDigest",
          "observedAt",
          "expiresAt",
          "receiptBase64",
        ],
        certificateIssuer: "https://token.actions.githubusercontent.com",
        certificateIdentityMatch: "exact-anchored-uri-from-contract-role-identity",
        certificateOids: {
          buildSignerUri: "1.3.6.1.4.1.57264.1.9",
          sourceRepositoryUri: "1.3.6.1.4.1.57264.1.12",
          sourceRepositoryDigest: "1.3.6.1.4.1.57264.1.13",
        },
        ctLogThreshold: 1,
        tlogThreshold: 1,
        minimumTlogEntries: 1,
        envelopeSignatureCount: 1,
        maximumBundleBytes: 32768,
        maximumReceiptBytes: 16384,
        forbiddenEnvironmentSource:
          "releaseCertification.npmOidcCertification.forbiddenEnvironmentNames",
        network: "forbidden-by-preload-guard-and-audited-direct-verifier-closure",
      },
      producerIdentityFields: [
        "role",
        "certificateIssuer",
        "certificateIdentityURI",
        "workflow",
        "repository",
        "ref",
        "sourceBinding",
      ],
      sourceBinding: {
        releaseSourceFields: ["kind"],
        releaseSourceKind: "release-source-sha",
        exactSourceFields: ["kind", "sourceSha"],
        exactSourceKind: "exact-source-sha",
      },
      producerIdentities: [],
    },
    externalEvidenceIngress: {
      protocol: "effect-build/external-evidence-ingress@1",
      workflowPath: ".github/workflows/release-evidence-ingress.yml",
      event: "workflow_dispatch",
      roles: ["npm-authority", "operational-journal", "github-release-governance"],
      dispatch: {
        sourceInput: "source_sha",
        roleInput: "role",
        referenceInput: "evidence_reference_json",
        bundleInput: "sigstore_bundle_base64",
        maximumReferenceCharacters: 4096,
        maximumBundleBytes: 32768,
        maximumEncodedBundleCharacters: 43692,
        maximumTotalPayloadCharacters: 65535,
      },
      referenceFields: [
        "schema",
        "role",
        "coordinate",
        "artifactName",
        "observedAt",
        "expiresAt",
        "bytes",
      ],
      artifact: {
        nameTemplate: "effect-build-v0.6.0-external-evidence-<role>-<sourceSha>",
        orderedFiles: ["external-evidence-reference.json", "sigstore-bundle.json"],
        retentionDays: 30,
        coordinate: "releaseCertification.githubArtifactCoordinate",
      },
      authority: "transport-only-sigstore-producer-identity-remains-the-sole-evidence-authority",
      readinessInput: "exact-authenticated-ingress-artifact-reference-downloaded-and-byte-validated",
      workflow: "mannyc2/effect-build/.github/workflows/release-evidence-ingress.yml@refs/heads/main",
    },
    manifest: "release-readiness.json",
    evidenceBundle: "release-readiness.bin",
    orderedFiles: ["release-readiness.json", "release-readiness.bin", "sigstore-trusted-root.json"],
    artifactName: "effect-build-v0.6.0-release-readiness",
    workflowPath: ".github/workflows/release-readiness.yml",
    coordinate: "releaseCertification.githubArtifactCoordinate",
    retentionDays: 30,
    clockSkewSeconds: 60,
    aggregateMaximumAgeSeconds: 14400,
    dispatch: {
      sourceInput: "source_sha",
      candidateInput: "candidate_reference_json",
      evidenceInputs: [
        { role: "exact-main-ci", input: "exact_main_ci_reference_json" },
        { role: "fake-registry", input: "fake_registry_reference_json" },
        { role: "npm-authority", input: "npm_authority_evidence_json" },
        { role: "npm-oidc-certification", input: "npm_oidc_certification_reference_json" },
        { role: "apple-certification", input: "apple_certification_reference_json" },
        { role: "operational-journal", input: "operational_journal_evidence_json" },
        { role: "github-release-governance", input: "github_release_governance_evidence_json" },
      ],
      externalIngressReferenceFields: [
        "schema",
        "role",
        "coordinate",
        "artifactName",
        "observedAt",
        "expiresAt",
        "bytes",
      ],
      githubInputs: "closed-full-reference-json-downloaded-by-workflow",
      externalInputs: "three-compact-authenticated-ingress-artifact-references-only",
    },
    githubAuthentication: {
      currentMain: "git-ref-heads-main-exact-sourceSha",
      runStatus: "completed",
      runConclusion: "success",
      artifactExpired: false,
      artifactDigest: "rest-metadata-and-downloaded-zip-sha256-exact",
    },
    githubRunObservation: {
      fields: [
        "schema",
        "workflow",
        "sourceSha",
        "runId",
        "runAttempt",
        "event",
        "headBranch",
        "status",
        "conclusion",
        "createdAt",
        "updatedAt",
      ],
    },
    directObservation: {
      protocol: "effect-build/release-readiness-direct-observation@1",
      fields: ["schema", "sourceSha", "observedAt", "github", "npm"],
      githubFields: [
        "repository",
        "repositoryId",
        "repositoryOwnerId",
        "visibility",
        "environment",
        "deploymentBranchPolicy",
        "deploymentBranchPolicies",
        "oidcSubjectPolicy",
        "workflowPath",
        "workflowDigest",
        "currentMain",
      ],
      environmentFields: ["name", "protectionRuleTypes", "reviewer", "preventSelfReview"],
      reviewerFields: ["id", "login", "type"],
      branchPolicyFields: ["name", "type"],
      npmFields: ["registry", "targetVersion", "packages"],
      npmPackageFields: ["name", "versions", "distTags", "repository", "placeholder"],
      repositoryFields: ["type", "url"],
      placeholderFields: ["version", "bytes", "sha256", "integrity", "tarballUrl"],
      packageSource: "publicApiProjection.packages plus npmRegistryBoundary.reservation.packages",
      placeholderSource: "npmRegistryBoundary.bootstrap.placeholderLedger",
      targetState: "absent-from-all-public-packages",
      authentication: {
        github: "GITHUB_TOKEN-actions-contents-deployments-read",
        npm: "anonymous-no-auth",
      },
      githubEndpoints: [
        "repository-metadata",
        "environment-metadata-and-protection-rules",
        "environment-deployment-branch-policy",
        "environment-custom-deployment-branch-policies",
        "repository-oidc-subject-policy",
        "workflow-blob-at-source-sha",
        "current-main-immediately-before-and-after-collection",
      ],
      npmChecks: [
        "target-version-absent",
        "expected-latest-exact",
        "repository-identity-exact",
        "placeholder-versions-tags-and-downloaded-bytes-exact",
      ],
    },
    externalReceipts: {
      npmAuthority: {
        role: "npm-authority",
        fields: ["checks", "decision", "identity", "issues", "observedAt", "schema", "sourceSha", "summary"],
        checkFields: ["id", "status"],
        summaryFields: ["match", "mismatch", "unobserved"],
        expectedCheckIdSource: "release-authority-auditor-derived-from-generated-contract",
        identitySource: "releaseCertification.githubAuthority-repository-and-environment",
        expectedCheckIds: expectedAuthorityCheckIds,
        identity: "npm-github-authority:mannyc2/effect-build:environment:npm",
      },
      operationalJournal: {
        role: "operational-journal",
        fields: [
          "schema",
          "sourceSha",
          "observedAt",
          "terminal",
          "identity",
          "ownerRepository",
          "ownerVersion",
          "ownerSourceSha",
          "candidateSourceSha",
          "appleCodecId",
          "awsAccountId",
          "bucketArn",
          "region",
          "roleArn",
          "prefix",
          "retentionPolicyDigest",
          "iamPolicyDigest",
          "bucketPolicyDigest",
          "oidcTrustPolicyDigest",
          "qualificationEvidenceDigest",
          "claims",
          "backendAuthentication",
        ],
        ownerRepository: "mannyc2/ts-release",
        claims: [
          "one-s3-backend-no-fallback",
          "ten-year-compliance-object-lock",
          "conditional-intent-before-provider-call",
          "acknowledgement-and-immediate-exact-reread",
          "cas-response-loss-and-fresh-process-replay-qualified",
          "opaque-consumer-codec-bound",
          "unknown-outcome-no-resubmit",
        ],
        backendAuthentication: "qualified-external-producer-not-reperformed-by-release-readiness",
      },
      githubReleaseGovernance: {
        role: "github-release-governance",
        fields: [
          "schema",
          "sourceSha",
          "observedAt",
          "terminal",
          "identity",
          "repository",
          "endpoint",
          "enabled",
          "decision",
          "decisionReceiptDigest",
          "claims",
          "backendAuthentication",
        ],
        identitySource: "releaseCertification.githubAuthority.repository",
        decisions: [
          {
            enabled: true,
            decision: "enabled-before-release",
            claims: ["future-release-assets-governed-by-github-release-immutability"],
          },
          {
            enabled: false,
            decision: "accepted-disabled-release-assets-not-claimed-immutable",
            claims: ["github-release-assets-not-claimed-immutable", "candidate-and-npm-byte-identity-still-required"],
          },
        ],
        backendAuthentication: "qualified-external-producer-not-reperformed-by-release-readiness",
        identity: "github-release-governance:mannyc2/effect-build",
      },
    },
    candidate: {
      protocolSource: "releaseCertification.candidate.protocol",
      referenceType: "candidate",
      coordinate: "required-exact",
      workflowSource: "releaseCertification.candidate.workflow",
      artifactNameSource: "releaseCertification.candidate.artifactName",
      maximumAgeSeconds: 604800,
      maximumValiditySeconds: 604800,
    },
    referenceShapes: {
      candidate: ["protocol", "coordinate", "artifactName", "manifestDigest", "observedAt", "expiresAt", "bytes"],
      githubRun: [
        "role",
        "type",
        "protocol",
        "workflow",
        "sourceSha",
        "runId",
        "runAttempt",
        "terminal",
        "observedAt",
        "expiresAt",
        "bytes",
        "digest",
      ],
      githubArtifact: [
        "role",
        "type",
        "protocol",
        "coordinate",
        "artifactName",
        "terminal",
        "evidenceObservedAt",
        "observedAt",
        "expiresAt",
        "bytes",
      ],
      externalObservation: [
        "role",
        "type",
        "protocol",
        "identity",
        "sourceSha",
        "terminal",
        "observedAt",
        "expiresAt",
        "bytes",
        "digest",
      ],
    },
    evidenceRoles: [
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
        protocol: "effect-build/fake-registry-exact-protected-body-certification@1",
        terminal: "success",
        workflowPath: ".github/workflows/release-certification.yml",
        artifactName: "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
        event: "workflow_dispatch",
        maximumAgeSeconds: 86400,
        maximumValiditySeconds: 172800,
        workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
      },
      {
        role: "npm-authority",
        type: "externalObservation",
        protocol: "effect-build/release-authority-audit@2",
        terminal: "supported",
        maximumAgeSeconds: 3600,
        maximumValiditySeconds: 14400,
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
      {
        role: "apple-certification",
        type: "githubArtifact",
        protocol: "effect-build/apple-certification-index@2",
        terminal: "success",
        workflowPath: ".github/workflows/apple-certification.yml",
        artifactName: "effect-build-v0.6.0-apple-certification",
        event: "workflow_dispatch",
        maximumAgeSeconds: 86400,
        maximumValiditySeconds: 172800,
        workflow: "mannyc2/effect-build/.github/workflows/apple-certification.yml@refs/heads/main",
      },
      {
        role: "operational-journal",
        type: "externalObservation",
        protocol: "effect-build/notary-journal-qualification@1",
        terminal: "qualified",
        maximumAgeSeconds: 86400,
        maximumValiditySeconds: 172800,
      },
      {
        role: "github-release-governance",
        type: "externalObservation",
        protocol: "effect-build/github-release-governance-observation@1",
        terminal: "resolved",
        maximumAgeSeconds: 3600,
        maximumValiditySeconds: 14400,
      },
    ],
    workflow: "mannyc2/effect-build/.github/workflows/release-readiness.yml@refs/heads/main",
  });

  assert.deepEqual(release.finalPublicVerification, {
    protocol: "effect-build/final-public-verification@1",
    workflowPath: ".github/workflows/release-verification.yml",
    event: "workflow_dispatch",
    status: "blocked",
    upstreamGateSource: "releaseCertification.readiness.externalEvidenceAuthentication",
    blocker: "authenticated-release-readiness-aggregate-cannot-yet-exist",
    artifactDisposition: "forbidden-while-upstream-blocked",
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
      protocol: "effect-build/release-readiness@1",
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
      immutabilityDecisionSource: "releaseCertification.readiness.externalReceipts.githubReleaseGovernance.decisions",
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
      status: "implemented-inert-behind-upstream-gate",
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
        certificateIssuerSource: "releaseCertification.readiness.externalEvidenceAuthentication.verifier",
        certificateOidSource: "releaseCertification.readiness.externalEvidenceAuthentication.verifier",
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
      protocol: "effect-build/final-public-release-receipt@1",
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
      use_immutable_subject: false,
      sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
    },
    expectedEnvironmentSubjectSource: "name-based-repository-and-environment",
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
      publishGate: "releaseCertification.readiness npm-authority closed supported receipt",
      forbiddenCredentialEscalation: ["personal-access-token", "github-app-token", "administrative-token"],
    },
    repository: contract.npmRegistryBoundary.trustedPublisher.repository,
    repositoryOwner: "mannyc2",
    workflow: contract.npmRegistryBoundary.trustedPublisher.workflow,
    environment: contract.npmRegistryBoundary.trustedPublisher.environment,
    expectedEnvironmentSubject: "repo:mannyc2/effect-build:environment:npm",
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
  assert.deepEqual(release.npmAuthorityObservation, {
    rawAllowedActionProjection: ["createPackage"],
    semantics: "authenticated-npm-settings-raw-projection-not-trustedPublisher.permission",
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
      { id: "partial-exact-publication", expected: "resume-only-missing" },
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
        expected: "stop-then-observation-driven-exact-byte-resume",
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
    protocol: "effect-build/fake-registry-local-qualification@1",
    workflowPath: ".github/workflows/release-certification.yml",
    artifactName: "effect-build-v0.6.0-fake-registry-local-qualification",
    terminal: "local-qualification",
    retentionDays: 30,
    readinessAdmissible: false,
    proves: [
      "blocked-real-purpose-stops-before-first-mutation",
      "sealed-credential-free-exact-purpose-covers-40-state-machine-coordinates",
      "independent-reference-oracle-agrees-with-exact-purpose",
      "npm-oidc-dry-run-body-local-boundaries",
    ],
    doesNotProve: [
      "readiness-admissible-exact-protected-body-certification",
      "authenticated-external-evidence",
      "readiness-admission",
      "npm-upload",
      "provenance",
      "publication",
    ],
    workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
  });
  assert.deepEqual(release.fakeRegistry.exactProtectedBodyCertification, {
    protocol: "effect-build/fake-registry-exact-protected-body-certification@1",
    workflowPath: ".github/workflows/release-certification.yml",
    artifactName: "effect-build-v0.6.0-fake-registry-exact-protected-body-certification",
    terminal: "success",
    implementationStatus: "implemented",
    status: "blocked",
    gateSource: "releaseCertification.readiness.externalEvidenceAuthentication",
    artifactDisposition: "forbidden-while-external-authentication-blocked",
    readinessAdmission:
      "requires-same-source-supported-external-authentication-and-terminal-success-exact-body-artifact",
    retentionDays: 30,
    orderedFiles: ["fake-registry-exact-protected-body.json"],
    receiptFields: [
      "schema",
      "sourceSha",
      "observedAt",
      "workflow",
      "contractDigest",
      "externalAuthenticationStatus",
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
    doesNotProve: ["npm-upload", "provenance", "publication"],
    certificationPurpose: release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose,
    workflow: "mannyc2/effect-build/.github/workflows/release-certification.yml@refs/heads/main",
  });
  assert.deepEqual(release.fakeRegistry.exactProtectedBodyCertification.certificationPurpose, {
    protocol: "effect-build/fake-registry-exact-protected-body-purpose@1",
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
      "exact-generated-contract-with-only-closed-supported-activation-and-placeholder-byte-ledger-derived-from-fixture-archives",
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
    realGateSource: "releaseCertification.readiness.externalEvidenceAuthentication",
    fakeGateSource: "releaseCertification.fakeRegistry.exactProtectedBodyCertification.certificationPurpose",
    status: "two-purpose-hard-cut",
    realExpected: "stop-zero-mutations-while-readiness-authentication-is-blocked",
    fakeExpected: "execute-exact-40-coordinate-state-machine-with-no-real-boundary",
    realBlockedMutationCount: 0,
    proves: [
      "real-purpose-blocked-readiness-gate-precedes-first-registry-mutation",
      "exact-fake-purpose-executes-shared-protected-bodies-and-state-machine",
    ],
    doesNotProve: [
      "authenticated-external-evidence",
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
    "authenticated-external-evidence",
    "npm-upload",
    "provenance",
    "publication",
  ]);
});

test("builds the supported release fixture only through one closed canonical activation", () => {
  const activation = {
    protocol: "effect-build/supported-release-fixture-activation@1",
    releaseSourceSha: "1".repeat(40),
    operationalJournal: {
      repository: "mannyc2/ts-release",
      workflowPath: ".github/workflows/operational-journal.yml",
      ref: "refs/heads/main",
      sourceSha: "4".repeat(40),
    },
  };
  const supported = buildSupportedReleaseFixtureContract(inputs, activation);
  const authentication = supported.releaseCertification.readiness.externalEvidenceAuthentication;
  assert.equal(authentication.status, "supported");
  assert.equal(authentication.artifactDisposition, "required-on-terminal-workflow-success");
  assert.deepEqual(authentication.producerIdentities.map(({ role, repository, sourceBinding }) => ({
    role,
    repository,
    sourceBinding,
  })), [
    {
      role: "npm-authority",
      repository: "mannyc2/effect-build",
      sourceBinding: { kind: "release-source-sha" },
    },
    {
      role: "operational-journal",
      repository: "mannyc2/ts-release",
      sourceBinding: { kind: "exact-source-sha", sourceSha: "4".repeat(40) },
    },
    {
      role: "github-release-governance",
      repository: "mannyc2/effect-build",
      sourceBinding: { kind: "release-source-sha" },
    },
  ]);
  assert.equal(
    supported.releaseCertification.fakeRegistry.exactProtectedBodyCertification.status,
    "supported",
  );
  assert.equal(
    supported.releaseCertification.fakeRegistry.exactProtectedBodyCertification.artifactDisposition,
    "required-on-supported-terminal-workflow-success",
  );
  assert.equal(supported.releaseCertification.finalPublicVerification.status, "ready");
  assert.equal(supported.releaseCertification.finalPublicVerification.artifactDisposition, "allowed");
  assert.strictEqual(validateSupportedReleaseFixtureContract(supported, inputs, activation), supported);

  for (const mutate of [
    (value) => value.releaseSourceSha = "not-a-sha",
    (value) => value.operationalJournal.repository = "effect-ts/ts-release",
    (value) => value.operationalJournal.workflowPath = ".github/workflows/peer.yml",
    (value) => value.operationalJournal.ref = "refs/tags/unreviewed",
    (value) => value.operationalJournal.sourceSha = "5".repeat(39),
    (value) => value.fallback = true,
  ]) {
    const changed = structuredClone(activation);
    mutate(changed);
    assert.throws(() => buildSupportedReleaseFixtureContract(inputs, changed));
  }
  const peer = structuredClone(supported);
  peer.releaseCertification.readiness.externalEvidenceAuthentication.producerIdentities[0].workflow +=
    "-peer";
  assert.throws(
    () => validateSupportedReleaseFixtureContract(peer, inputs, activation),
    /differs from the canonical activation model/u,
  );
  assert.throws(
    () => validateContract(supported, inputs),
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
          use_immutable_subject: false,
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
  rejects((release) => release.dependencyBootstrap.client.version = "latest");
  rejects((release) => release.dependencyBootstrap.command.arguments.pop());
  rejects((release) => release.dependencyBootstrap.lockfile.nonWorkspaceIntegrityPattern = ".*");
  rejects((release) => release.dependencyBootstrap.registries.scopes["@jsr"] = "https://registry.npmjs.org");
  rejects((release) => release.dependencyBootstrap.environment.configurationFiles.projectNpmrc.digest = "sha256:" + "0".repeat(64));
  rejects((release) => release.dependencyBootstrap.environment.configurationFiles.bunfig.path = "bunfig.toml");
  rejects((release) => release.npmAuthorityObservation.rawAllowedActionProjection[0] = "publish");
  rejects((release) => release.readiness.coordinate = "optional");
  rejects((release) => release.readiness.bundleProtocol += "-fallback");
  rejects((release) => release.readiness.externalEvidencePolicy = "digest-bound-caller-assertion");
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
  rejects((release) => release.readiness.dispatch.externalIngressReferenceFields.pop());
  rejects((release) => release.readiness.externalEvidenceIngress.roles.reverse());
  rejects((release) => release.readiness.externalEvidenceIngress.dispatch.maximumBundleBytes += 1);
  rejects((release) => release.readiness.externalEvidenceIngress.artifact.orderedFiles.pop());
  rejects((release) => release.readiness.githubAuthentication.runConclusion = "neutral");
  rejects((release) => release.readiness.githubRunObservation.fields.pop());
  rejects((release) => release.readiness.directObservation.githubEndpoints.pop());
  rejects((release) => release.readiness.directObservation.npmChecks.pop());
  rejects((release) => release.readiness.externalEvidenceManifest.authenticationRequiredRoles.pop());
  rejects((release) => release.readiness.externalEvidenceAuthentication.status = "verified");
  rejects((release) => release.readiness.externalEvidenceAuthentication.requiredBindings.pop());
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.client.version = "latest");
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.runtime.version = "latest");
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.maximumBundleBytes += 1);
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.bundleClient.version = "latest");
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.networkGuard.digest = "sha256:" + "0".repeat(64));
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.trustedRoot.digest = "sha256:" + "0".repeat(64));
  rejects((release) =>
    release.readiness.externalEvidenceAuthentication.verifier.trustedRoot.tuf.acquisition.clients[0].integrity =
      "sha512-peer"
  );
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.bundleMediaType += ";legacy=1");
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.signatureFields.push("keyid"));
  rejects((release) => release.readiness.externalEvidenceAuthentication.verifier.payloadFields.pop());
  rejects((release) => release.readiness.externalReceipts.npmAuthority.expectedCheckIds.pop());
  rejects((release) => release.readiness.externalReceipts.operationalJournal.claims.pop());
  rejects((release) => release.readiness.externalReceipts.githubReleaseGovernance.decisions.pop());
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
  rejects((release) => release.finalPublicVerification.status = "ready");
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
  rejects((release) => release.fakeRegistry.exactProtectedBodyCertification.status = "supported");
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
  const targetsPath = contract.releaseCertification.readiness.externalEvidenceAuthentication.verifier.trustedRoot.tuf
    .acquisition.metadata.targets.path;
  const targets = evidence.get(targetsPath);
  evidence.set(targetsPath, `${targets.slice(0, -2)}A\n`);
  rejectsInputs({ ...inputs, sigstoreTufEvidenceSources: evidence });

  const [left, right] = contract.releaseCertification.readiness.externalEvidenceAuthentication.verifier.trustedRoot
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

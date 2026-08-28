import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

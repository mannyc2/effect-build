import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Metadata, MetadataKind } from "@tufjs/models";

import { appleEvidenceFileName } from "../apple-certification/canonical.mjs";
import { parseBunLockfilePackageRecords } from "../release/install-frozen-release-dependencies.mjs";

import {
  adjudicationPath,
  contractPath,
  coreCapabilityRegister,
  denoPrivateOperationIds,
  exactToolEvidenceRegister,
  expectedDispositionCounts,
  fixedPublicSurface,
  mandatoryOperationIds,
  nonOperationRegisterPath,
  npmReleaseTarget,
  npmRegistryBootstrap,
  npmRegistryUrl,
  npmTrustedPublishClient,
  npmTrustedPublisher,
  operationRegisterPath,
  operationTargets,
  privateSupportRegister,
  producerCapabilityRegister,
  publicApiPath,
  releaseCertificationPolicy,
  rolldownRejectedOperationIds,
  sigstoreNetworkGuardPath,
  sigstoreTrustedRootPath,
  supersededOperationIds,
} from "./policy.mjs";

const policyPath = "scripts/effect-build-contract/policy.mjs";
const modelPath = "scripts/effect-build-contract/model.mjs";
const packageManifestPath = "package.json";
const lockfilePath = "bun.lock";
const zipProtocolPath = "scripts/release/zip-protocol.mjs";
const tarProtocolPath = "scripts/release/tar-protocol.mjs";
const terminalReferenceBuilderPath = "scripts/release/build-terminal-reference.mjs";
const sigstoreTufAcquisition = releaseCertificationPolicy.provenanceVerification.trustedRoot.tuf.acquisition;
const sigstoreTufEvidencePaths = [
  sigstoreTufAcquisition.seedRoot.path,
  ...Object.values(sigstoreTufAcquisition.metadata).map(({ path }) => path),
];
const expectedNonOperationDispositionCounts = {
  mandatory: 26,
  "conditional-private": 16,
  rejected: 4,
};
const providerPackages = [
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
  "effect-build-rolldown",
];
const providerSupportExports = {
  "effect-build-bun": {
    Api: { runtime: ["layer"], declarations: ["layer"] },
    Command: { runtime: ["layer"], declarations: ["LayerError", "LayerOptions", "layer"] },
  },
  "effect-build-deno": {
    Command: { runtime: ["layer"], declarations: ["LayerError", "LayerOptions", "layer"] },
  },
  "effect-build-esbuild": {
    Api: { runtime: [], declarations: [] },
    Command: { runtime: ["layer"], declarations: ["LayerError", "LayerOptions", "layer"] },
  },
  "effect-build-node-sea": {
    Command: { runtime: ["layer"], declarations: ["LayerError", "LayerOptions", "layer"] },
  },
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalBase64Evidence = (source, descriptor, label) => {
  if (source !== `${source.trim()}\n` || !/^[A-Za-z0-9+/]+={0,2}\n$/u.test(source)) {
    throw new Error(`${label} must be one canonical base64 evidence file`);
  }
  const bytes = Buffer.from(source.trim(), "base64");
  if (
    bytes.toString("base64") !== source.trim()
    || bytes.byteLength !== descriptor.bytes
    || `sha256:${sha256(bytes)}` !== descriptor.digest
  ) throw new Error(`${label} byte identity changed`);
  return bytes;
};
const sorted = (values) => [...values].sort();
const splitRefs = (value) => value === "" ? [] : value.split(";").filter(Boolean);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const exportedDeclaration = (source, name) => new RegExp(
  `\\bexport\\s+(?:(?:declare|async)\\s+)*(?:const|function|class|interface|type|enum|namespace)\\s+${escapeRegExp(name)}\\b`,
  "u",
).test(source);
const requireText = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty text`);
};
const requireUnique = (values, label) => {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
};
const requireExactObjectKeys = (value, fields, label) => {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !sameJson(Object.keys(value), fields)
  ) throw new Error(`${label} must have the exact canonical fields`);
  return value;
};
const countBy = (entries, select, expected) => Object.fromEntries(
  Object.keys(expected).map((value) => [value, entries.filter((entry) => select(entry) === value).length]),
);
export const parseCsv = (source) => {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/u, ""));
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field !== "" || record.length > 0) {
    record.push(field.replace(/\r$/u, ""));
    records.push(record);
  }
  const [headers, ...rows] = records;
  if (headers === undefined) throw new Error("CSV has no header row");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
};

export const readInputs = async (repositoryRoot) => {
  const read = async (path) => await readFile(resolve(repositoryRoot, path), "utf8");
  const [
    operationSource,
    nonOperationSource,
    adjudicationSource,
    policySource,
    modelSource,
    packageManifestSource,
    lockfileSource,
    publicApiSource,
    zipProtocolSource,
    tarProtocolSource,
    terminalReferenceBuilderSource,
    sigstoreNetworkGuardSource,
    sigstoreTrustedRootSource,
  ] =
    await Promise.all([
      read(operationRegisterPath),
      read(nonOperationRegisterPath),
      read(adjudicationPath),
      read(policyPath),
      read(modelPath),
      read(packageManifestPath),
      read(lockfilePath),
      read(publicApiPath),
      read(zipProtocolPath),
      read(tarProtocolPath),
      read(terminalReferenceBuilderPath),
      read(sigstoreNetworkGuardPath),
      read(sigstoreTrustedRootPath),
    ]);
  const sigstoreTufEvidenceSources = new Map(await Promise.all(
    sigstoreTufEvidencePaths.map(async (path) => [path, await read(path)]),
  ));
  return {
    operationRows: parseCsv(operationSource),
    nonOperationRows: parseCsv(nonOperationSource),
    adjudication: JSON.parse(adjudicationSource),
    packageManifest: JSON.parse(packageManifestSource),
    lockfileSource,
    publicApi: JSON.parse(publicApiSource),
    sigstoreNetworkGuardSource,
    terminalReferenceBuilderSource,
    sigstoreTufEvidenceSources,
    sigstoreTrustedRootSource,
    sources: [
      { path: operationRegisterPath, source: operationSource },
      { path: nonOperationRegisterPath, source: nonOperationSource },
      { path: adjudicationPath, source: adjudicationSource },
      { path: policyPath, source: policySource },
      { path: modelPath, source: modelSource },
      { path: packageManifestPath, source: packageManifestSource },
      { path: lockfilePath, source: lockfileSource },
      { path: zipProtocolPath, source: zipProtocolSource },
      { path: tarProtocolPath, source: tarProtocolSource },
      { path: terminalReferenceBuilderPath, source: terminalReferenceBuilderSource },
      { path: sigstoreNetworkGuardPath, source: sigstoreNetworkGuardSource },
      { path: sigstoreTrustedRootPath, source: sigstoreTrustedRootSource },
      ...[...sigstoreTufEvidenceSources].map(([path, source]) => ({ path, source })),
    ],
  };
};

const operationDisposition = (row) => {
  if (mandatoryOperationIds.has(row.operation_id)) return "mandatory";
  if (supersededOperationIds.has(row.operation_id)) return "superseded";
  if (row.freeze_recommendation === "ship") return "positive-proof-gated";
  if (row.freeze_recommendation === "defer") return "conditional-private";
  if (row.freeze_recommendation === "reject") return "rejected";
  throw new Error(`unknown operation disposition for ${row.operation_id}: ${row.freeze_recommendation}`);
};

const nonOperationDisposition = (row) => {
  if (row.freeze_recommendation === "ship") return "mandatory";
  if (row.freeze_recommendation === "defer") return "conditional-private";
  if (row.freeze_recommendation === "reject") return "rejected";
  throw new Error(`unknown non-operation disposition for ${row.atom_id}: ${row.freeze_recommendation}`);
};

const mechanismFromIdentity = (identity, id) => {
  for (const mechanism of ["host-api", "in-process-api", "selected-command"]) {
    if (identity.includes(` / ${mechanism} / `)) return mechanism;
  }
  throw new Error(`cannot determine provider-native mechanism for ${id}`);
};

const laneFromMechanism = (mechanism) => mechanism === "selected-command" ? "Command" : "Api";

const buildOperation = (row) => {
  const disposition = operationDisposition(row);
  const visibility = disposition === "mandatory" || disposition === "positive-proof-gated"
    ? "public"
    : disposition === "conditional-private"
    ? "private"
    : "absent";
  const mechanism = mechanismFromIdentity(row.semantic_identity, row.operation_id);
  const target = operationTargets[row.operation_id];
  const live = visibility !== "absent";
  if (live && target === undefined) throw new Error(`missing implementation target for ${row.operation_id}`);
  if (!live && target !== undefined && !row.operation_id.startsWith("CAN-ROL-021")) {
    throw new Error(`terminal operation unexpectedly has an implementation target: ${row.operation_id}`);
  }
  const lane = laneFromMechanism(mechanism);
  return {
    operationId: row.operation_id,
    provider: row.proposed_package.replace(/^effect-build-/u, ""),
    semanticIdentity: row.semantic_identity,
    mechanism,
    resultSemantics: {
      providerPublication: row.provider_publication,
      publishedContract: row.published_contract,
      identityOwner: row.identity_owner,
    },
    disposition,
    accounting: {
      implementation: visibility === "public" ? "required-public" : visibility === "private" ? "required-private" : "prohibited",
      surface: visibility,
      test: visibility === "public"
        ? "positive-and-lifecycle"
        : visibility === "private"
        ? "private-implementation-and-gate"
        : "negative-surface",
      evidence: disposition === "conditional-private"
        ? "named-gate-open"
        : disposition === "positive-proof-gated"
        ? "positive-proof-required"
        : disposition === "mandatory"
        ? "semantic-authority"
        : disposition,
    },
    implementation: live
      ? {
        package: row.proposed_package,
        lane,
        module: target.module,
        export: target.exportName,
        path: `packages/${row.proposed_package}/src/${lane}/${target.module}.ts`,
      }
      : null,
    evidenceGate: disposition === "conditional-private" || disposition === "positive-proof-gated"
      ? {
        preFreeze: row.pre_freeze_gate,
        unresolved: splitRefs(row.unresolved_evidence),
        failureAction: row.gate_failure_action,
      }
      : null,
    provenance: {
      source: operationRegisterPath,
      sourceRecommendation: row.freeze_recommendation,
      sourceImplementationStatus: row.implementation_status,
      sourceCertificationStatus: row.certification_status,
    },
  };
};

const buildNonOperation = (row) => {
  const disposition = nonOperationDisposition(row);
  return {
    atomId: row.atom_id,
    provider: row.provider,
    sourceSet: row.source_set,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    classification: row.classification,
    relatedOperationIds: splitRefs(row.canonical_operation_ids),
    disposition,
    accounting: {
      implementation: disposition === "mandatory"
        ? "required"
        : disposition === "conditional-private"
        ? "conditional-private"
        : "prohibited",
      publicSurface: "not-an-operation-export",
      test: disposition === "rejected" ? "negative" : "required",
      evidence: disposition === "conditional-private" ? "named-gate-open" : disposition,
    },
    note: row.note,
    evidenceRefs: splitRefs(row.evidence_coordinate_refs),
    provenance: { source: nonOperationRegisterPath, sourceRecommendation: row.freeze_recommendation },
  };
};

const buildProviderSurface = (operations) => Object.fromEntries(
  providerPackages.flatMap((packageName) => {
    const packageOperations = operations.filter((operation) => operation.implementation?.package === packageName);
    const publicOperations = packageOperations.filter((operation) => operation.accounting.surface === "public");
    if (publicOperations.length === 0) return [];
    const lanes = Object.fromEntries(["Api", "Command"].flatMap((lane) => {
      const laneOperations = publicOperations.filter((operation) => operation.implementation.lane === lane);
      if (laneOperations.length === 0) return [];
      const modules = [...new Set(laneOperations.map((operation) => operation.implementation.module))].sort();
      return [[`./${lane}`, {
        ownerIds: laneOperations.map((operation) => operation.operationId),
        operationNamespaces: modules,
        supportExports: providerSupportExports[packageName]?.[lane] ?? { runtime: [], declarations: [] },
      }]];
    }));
    return [[packageName, { rootNamespaces: Object.keys(lanes).map((lane) => lane.slice(2)), subpaths: lanes }]];
  }),
);

const buildPublicSurfaceProjection = (operations) => {
  const packages = structuredClone(fixedPublicSurface);
  for (const [packageName, surface] of Object.entries(buildProviderSurface(operations))) packages[packageName] = surface;
  const packagesWithRootOwners = Object.fromEntries(Object.entries(packages).map(([packageName, surface]) => {
    const rootOwners = Object.fromEntries(surface.rootNamespaces.map((namespace) => {
      const matchingSubpath = Object.entries(surface.subpaths).find(([subpath]) =>
        subpath === `./${namespace}` || subpath.endsWith(`/${namespace}`)
      )?.[1];
      const fallbackOwners = [...new Set(Object.values(surface.subpaths).flatMap((subpathSurface) =>
        Array.isArray(subpathSurface) ? subpathSurface : subpathSurface.ownerIds
      ))];
      const owners = matchingSubpath === undefined
        ? fallbackOwners
        : Array.isArray(matchingSubpath)
        ? matchingSubpath
        : matchingSubpath.ownerIds;
      return [namespace, owners];
    }));
    return [packageName, { ...surface, rootOwners }];
  }));
  return {
    artifact: publicApiPath,
    authority: "derived-projection-only",
    direction: "effect-build-contract-to-public-api",
    ownershipGranularity: "package-root-and-subpath; every symbol inherits its admitted subpath owners",
    packages: Object.fromEntries(
      Object.entries(packagesWithRootOwners).sort(([left], [right]) => left.localeCompare(right)),
    ),
    privatePackages: ["effect-build-rolldown"],
    forbiddenProviderSubpaths: [
      "./AssembleExecutable",
      "./Build",
      "./Bundle",
      "./CompileExecutable",
      "./Context",
      "./Profile",
      "./Raw",
      "./Watch",
    ],
  };
};

const buildNpmRegistryBoundary = (admittedPackages, reservedOnlyPackages) => ({
  purpose: "repository-package-distribution-only",
  productReleaseOwnership: "unchanged-ts-release-boundary",
  registry: npmRegistryUrl,
  trustedPublisher: npmTrustedPublisher,
  client: npmTrustedPublishClient,
  bootstrap: npmRegistryBootstrap,
  candidateHandoff: {
    producer: "unprivileged-verified-pack-job",
    consumer: "protected-npm-distribution-job",
    identity: ["logicalName", "digest"],
    content: "immutable-package-tarball-bytes",
    repositoryCodeInOidcJob: "forbidden",
  },
  publicationAdmission: {
    source: "publicApiProjection.packages",
    packages: admittedPackages,
    target: npmReleaseTarget,
    command: "npm-publish",
    tag: "latest",
    postPublishProof: "downloaded-tarball-integrity",
    existingVersionPolicy: "exact-bytes-and-latest-or-stop",
    priorLatestPolicy: "exact-contract-ledger-or-target-on-resume",
    registryObservation: "isolated-cache-prefer-online",
    lifecycleScripts: "disabled",
  },
  reservation: {
    source: "publicApiProjection.privatePackages",
    packages: reservedOnlyPackages,
    policy: "placeholder-version-and-tags-remain-unchanged",
  },
});

const appleCategory = (apple, coordinate) => {
  const categories = apple.categories.filter(({ coordinatePrefix }) => coordinate.startsWith(coordinatePrefix));
  if (categories.length !== 1) throw new Error(`Apple coordinate has no unique category: ${coordinate}`);
  return categories[0].id;
};

const appleArchitecture = (coordinate) => coordinate.includes("|") ? coordinate.split("|")[1] : null;

const appleProduct = (coordinate) => {
  if (coordinate.startsWith("P-signed-") || coordinate.startsWith("P-notarized-stapled-app-") || coordinate.startsWith("G-app|")) {
    return "app";
  }
  if (coordinate.startsWith("P-notarized-stapled-dmg|") || coordinate.startsWith("G-dmg|")) return "dmg";
  if (coordinate.startsWith("P-notarized-stapled-pkg|") || coordinate.startsWith("G-pkg|")) return "pkg";
  return null;
};

const appleProvider = (coordinate) => {
  if (coordinate.startsWith("P-signed-deno-")) return "deno";
  if (coordinate.startsWith("P-") || coordinate.startsWith("G-")) return "bun";
  return null;
};

const buildAppleCoordinateRules = (apple, providerOperations, producerCapabilities) => {
  const nativeOperationIds = providerOperations
    .filter((entry) =>
      ["bun", "deno"].includes(entry.provider)
      && entry.semanticIdentity.split(" / ")[1] === "compile-executable"
      && entry.mechanism === "selected-command"
      && entry.disposition === "mandatory"
    )
    .map(({ operationId }) => operationId);
  const capabilityByExport = new Map();
  for (const capability of producerCapabilities) {
    if (capability.family !== "apple" || capability.visibility !== "public") continue;
    for (const exportName of capability.exports) {
      if (capabilityByExport.has(exportName)) throw new Error(`duplicate Apple producer export: ${exportName}`);
      capabilityByExport.set(exportName, capability.id);
    }
  }
  const operationIds = (exportNames) => {
    const selected = new Set(exportNames.map((name) => {
      const id = capabilityByExport.get(name);
      if (id === undefined) throw new Error(`missing Apple producer capability for ${name}`);
      return id;
    }));
    return producerCapabilities.filter(({ id }) => selected.has(id)).map(({ id }) => id);
  };
  const coverage = {
    signedApp: operationIds(apple.operationCoverage.signedApp),
    notarizedApp: operationIds(apple.operationCoverage.notarizedApp),
    notarizedDmg: operationIds(apple.operationCoverage.notarizedDmg),
    notarizedPkg: operationIds(apple.operationCoverage.notarizedPkg),
  };
  const verdictByCoordinate = new Map(apple.verdicts.map((entry) => [entry.coordinate, entry]));
  const signedBunCoordinate = (architecture) => `P-signed-bun-app|${architecture}`;
  const notarizedCoordinate = (product, architecture) =>
    product === "app"
      ? `P-notarized-stapled-app-private-zip|${architecture}`
      : `P-notarized-stapled-${product}|${architecture}`;
  const quarantinePolicy = {
    applied: true,
    propagated: true,
    forbiddenActions: ["remove-quarantine", "disable-gatekeeper", "override-rejection"],
  };
  const cleanHostFlowByProduct = {
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

  const coordinateRules = apple.coordinates.map((coordinate) => {
    const category = appleCategory(apple, coordinate);
    const architecture = appleArchitecture(coordinate);
    const provider = appleProvider(coordinate);
    const product = appleProduct(coordinate);
    let dependencies = [];
    let exactOperationIds = [];
    let fieldValues = {};
    if (category === "N-native") {
      exactOperationIds = nativeOperationIds;
    } else if (category === "P-signed-app") {
      dependencies = [`N-native-mechanics|${architecture}`];
      exactOperationIds = coverage.signedApp;
    } else if (category === "P-notarized-product") {
      const signedAppDependency = signedBunCoordinate(architecture);
      dependencies = product === "app"
        ? [signedAppDependency]
        : apple.pairArchitectureOrder.map(signedBunCoordinate);
      exactOperationIds = product === "app"
        ? coverage.notarizedApp
        : product === "dmg"
        ? coverage.notarizedDmg
        : coverage.notarizedPkg;
      fieldValues = { signedAppDependency };
    } else if (category === "G-clean-host") {
      const producerDependency = notarizedCoordinate(product, architecture);
      dependencies = [producerDependency];
      fieldValues = {
        producerDependency,
        runnerPlatform: "macos",
        runnerEnvironment: "github-hosted",
        uidFormat: "canonical-positive-decimal-string",
        acquisitionTransportKind: "authenticated-symlink-preserving-envelope",
        quarantinePolicy,
        ...cleanHostFlowByProduct[product],
        cleanupComplete: true,
      };
    } else {
      const verdict = verdictByCoordinate.get(coordinate);
      if (verdict === undefined) throw new Error(`missing Apple verdict policy: ${coordinate}`);
      dependencies = verdict.dependencies;
      fieldValues = {
        namedClaims: verdict.claims,
        orderedDependencies: verdict.dependencies,
        subordinateEvidence: verdict.subordinateEvidence ?? [],
      };
    }
    return {
      coordinate,
      category,
      architecture,
      provider,
      product,
      artifactIdentitySchema: product === null
        ? null
        : product === "app"
        ? "treeArtifactIdentity"
        : "fileArtifactIdentity",
      dependencies,
      operationIds: exactOperationIds,
      fieldValues,
    };
  });
  return { coordinateRules, nativeOperationIds };
};

const buildReleaseCertification = (
  publicApiProjection,
  npmRegistryBoundary,
  providerOperations,
  producerCapabilities,
  toolEvidence,
  terminalReferenceBuilderSource,
) => {
  const apple = structuredClone(releaseCertificationPolicy.apple);
  const appleRules = buildAppleCoordinateRules(apple, providerOperations, producerCapabilities);
  const providerVersions = Object.fromEntries(
    ["bun", "deno"].map((name) => {
      const matches = toolEvidence.filter((entry) => entry.kind === "provider" && entry.name === name);
      if (matches.length !== 1) throw new Error(`missing unique Apple provider tool identity: ${name}`);
      return [name, matches[0].version];
    }),
  );
  const trustedPublisher = npmRegistryBoundary.trustedPublisher;
  const [repositoryOwner] = trustedPublisher.repository.split("/");
  const githubAuthority = {
    ...structuredClone(releaseCertificationPolicy.githubAuthority),
    repository: trustedPublisher.repository,
    repositoryOwner,
    workflow: trustedPublisher.workflow,
    environment: trustedPublisher.environment,
    expectedEnvironmentSubject:
      `${releaseCertificationPolicy.githubAuthority.oidcSubjectPolicy.sub_claim_prefix}:environment:${trustedPublisher.environment}`,
  };
  const workflowIdentity = (path) =>
    `${trustedPublisher.repository}/${path}@refs/heads/${githubAuthority.branchPolicy.name}`;
  const candidate = {
    ...structuredClone(releaseCertificationPolicy.candidate),
    workflow: workflowIdentity(releaseCertificationPolicy.candidate.workflowPath),
  };
  const readiness = {
    ...structuredClone(releaseCertificationPolicy.readiness),
    workflow: workflowIdentity(releaseCertificationPolicy.readiness.workflowPath),
    terminalReferences: {
      ...structuredClone(releaseCertificationPolicy.readiness.terminalReferences),
      implementation: {
        ...structuredClone(releaseCertificationPolicy.readiness.terminalReferences.implementation),
        sourceBytes: Buffer.byteLength(terminalReferenceBuilderSource),
        sourceDigest: `sha256:${sha256(terminalReferenceBuilderSource)}`,
      },
    },
    evidenceRoles: releaseCertificationPolicy.readiness.evidenceRoles.map((entry) => entry.workflowPath === undefined
      ? structuredClone(entry)
      : { ...structuredClone(entry), workflow: workflowIdentity(entry.workflowPath) }),
  };
  const targetVersion = npmRegistryBoundary.publicationAdmission.target.version;
  const publicPackageCount = Object.keys(publicApiProjection.packages).length;
  const publicModuleCount = Object.values(publicApiProjection.packages)
    .reduce((count, entry) => count + 1 + Object.keys(entry.subpaths).length, 0);
  const finalPublicVerification = {
    ...structuredClone(releaseCertificationPolicy.finalPublicVerification),
    workflow: workflowIdentity(releaseCertificationPolicy.finalPublicVerification.workflowPath),
    repository: trustedPublisher.repository,
    registry: npmRegistryBoundary.registry,
    version: targetVersion,
    tag: `v${targetVersion}`,
    packageCount: publicPackageCount,
    moduleCount: publicModuleCount,
    releaseAssetCount: publicPackageCount + 1,
    candidate: {
      ...structuredClone(releaseCertificationPolicy.finalPublicVerification.candidate),
      protocol: candidate.protocol,
      workflow: candidate.workflow,
      artifactName: candidate.artifactName,
    },
    readiness: {
      ...structuredClone(releaseCertificationPolicy.finalPublicVerification.readiness),
      protocol: readiness.protocol,
      workflow: readiness.workflow,
      artifactName: readiness.artifactName,
    },
    implementation: {
      ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation),
      provenance: {
        ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation.provenance),
        workflow: candidate.workflow,
        workflowPath: candidate.workflowPath,
        branchRef: `refs/heads/${githubAuthority.branchPolicy.name}`,
        repository: trustedPublisher.repository,
        repositoryId: githubAuthority.repositoryId,
        repositoryOwnerId: githubAuthority.repositoryOwnerId,
      },
      consumerSmoke: {
        ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation.consumerSmoke),
        node: {
          ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation.consumerSmoke.node),
          version: releaseCertificationPolicy.npmOidcCertification.client.node,
          npm: releaseCertificationPolicy.npmOidcCertification.client.npm,
        },
        bun: {
          ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation.consumerSmoke.bun),
          version: toolEvidence.find((entry) => entry.kind === "provider" && entry.name === "bun")?.version,
        },
      },
      reservation: {
        ...structuredClone(releaseCertificationPolicy.finalPublicVerification.implementation.reservation),
        ledger: structuredClone(
          npmRegistryBoundary.bootstrap.placeholderLedger.find((entry) => entry.name === "effect-build-rolldown"),
        ),
      },
    },
  };
  const fakeRegistry = {
    ...structuredClone(releaseCertificationPolicy.fakeRegistry),
    localQualification: {
      ...structuredClone(releaseCertificationPolicy.fakeRegistry.localQualification),
      workflow: workflowIdentity(releaseCertificationPolicy.fakeRegistry.localQualification.workflowPath),
    },
    exactProtectedBodyCertification: {
      ...structuredClone(releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification),
      workflow: workflowIdentity(
        releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification.workflowPath,
      ),
    },
  };
  const appleEvidenceDescriptorOrder = [
    ...apple.coordinates,
    ...apple.verdicts.find(({ coordinate }) => coordinate === "A7").subordinateEvidence,
  ];
  return {
    ...structuredClone(releaseCertificationPolicy),
    candidate,
    fakeRegistry,
    finalPublicVerification,
    githubAuthority,
    readiness,
    publicAdmission: {
      packageSource: "publicApiProjection.packages",
      packageCount: publicPackageCount,
      moduleSource: "publicApiProjection.packages package roots and subpaths",
      moduleCount: publicModuleCount,
      reservationSource: "publicApiProjection.privatePackages",
      reservationCount: publicApiProjection.privatePackages.length,
    },
    apple: {
      ...apple,
      workflow: workflowIdentity(apple.workflowPath),
      nativeOperationSource: apple.operationCoverage.nativeSource,
      nativeOperationIds: appleRules.nativeOperationIds,
      providerVersionSource: "exactToolEvidenceRegister.tools kind=provider name in bun,deno",
      providerVersions,
      coordinateRules: appleRules.coordinateRules,
      evidenceDescriptorOrder: appleEvidenceDescriptorOrder,
      evidenceFileOrder: appleEvidenceDescriptorOrder.map((id) => ({ id, file: appleEvidenceFileName(id) })),
      publicCapabilitySource: "producerCapabilityRegister.capabilities family=apple visibility=public",
      publicCapabilityCount: producerCapabilities
        .filter((entry) => entry.family === "apple" && entry.visibility === "public")
        .length,
    },
  };
};

export const buildContract = (inputs) => {
  const operations = inputs.operationRows.map(buildOperation);
  const nonOperations = inputs.nonOperationRows.map(buildNonOperation);
  const publicApiProjection = buildPublicSurfaceProjection(operations);
  const admittedPackages = Object.keys(publicApiProjection.packages).sort();
  const reservedOnlyPackages = [...publicApiProjection.privatePackages].sort();
  const npmRegistryBoundary = buildNpmRegistryBoundary(admittedPackages, reservedOnlyPackages);
  return {
    schema: "effect-build/combined-contract@1",
    status: "authoritative-hard-cut-contract",
    authority: {
      semanticAuthority: [operationRegisterPath, nonOperationRegisterPath, adjudicationPath],
      implementationAuthority: contractPath,
      supersedes: ["tooling/research-complete-contract.json", "tooling/v05-contract.json"],
      rule: "one generated contract; source and public-surface snapshots are inputs or projections, never peer product authorities",
    },
    provenance: {
      deterministicGeneration: true,
      generator: "scripts/effect-build-contract/generate.mjs",
      validator: "scripts/effect-build-contract/validate.mjs",
      sources: inputs.sources.map(({ path, source }) => ({ path, sha256: sha256(source) })),
    },
    invariants: {
      providerSurface: "permanent operation-specific provider-native Api and Command lanes; no flat legacy surface",
      toolSelection: "explicit path or one deterministic PATH walk; no registry, fallback, raw argv, retry, or automatic installation",
      launch: "selected authenticated tool is reauthenticated immediately before every launch",
      identities: ["construction-host", "selected-authenticated-tool", "artifact-target", "target-runner"],
      lifecycle: "scoped ownership, interruption safety, and provider-owned typed errors",
      durableBoundary: "only explicit finalizing operations return canonical durable file, tree, or executable artifacts",
      nativeResults: "in-memory native results and provider-direct writes retain provider-native result types",
      artifactCanon: "one core artifact, digest, logical-name, tree, and selected-tool identity model",
      directoryNoReplaceBoundary:
        "Effect FileSystem has no portable atomic no-replace directory rename; tree finalizers use process-local claims plus start/precommit destination rejection, and external writers must coordinate",
      hardCut: "no compatibility layer or legacy fallback",
    },
    exactToolEvidenceRegister: {
      count: exactToolEvidenceRegister.length,
      tools: exactToolEvidenceRegister,
    },
    coreCapabilityRegister: {
      count: coreCapabilityRegister.length,
      capabilities: coreCapabilityRegister,
    },
    providerOperationRegister: {
      source: operationRegisterPath,
      count: operations.length,
      dispositionCounts: countBy(operations, (operation) => operation.disposition, expectedDispositionCounts),
      operations,
    },
    nonOperationRegister: {
      source: nonOperationRegisterPath,
      count: nonOperations.length,
      dispositionCounts: countBy(nonOperations, (entry) => entry.disposition, expectedNonOperationDispositionCounts),
      findings: nonOperations,
    },
    privateImplementationRegister: {
      count: privateSupportRegister.length,
      capabilities: privateSupportRegister,
    },
    producerCapabilityRegister: {
      families: ["apple", "archives", "nfpm", "python", "sbom", "windows"],
      count: producerCapabilityRegister.length,
      capabilities: producerCapabilityRegister,
    },
    releaseOwnershipBoundary: {
      effectBuildOwns: [
        "provider-operation-execution",
        "artifact-production",
        "same-parent-staging",
        "artifact-revalidation",
        "atomic-commit",
        "artifact-digest-and-logical-name",
        "apple-notarization-operations",
      ],
      handoff: {
        identity: ["logicalName", "digest"],
        content: "immutable-bytes-or-tree-snapshot",
        mutationAfterHandoff: "forbidden",
      },
      tsReleaseOwns: [
        "release-plans",
        "mutation-journals-including-apple-notarization",
        "continuation",
        "publication",
      ],
      forbiddenInEffectBuild: ["release-plan", "durable-notarization-journal", "continuation", "publication"],
    },
    npmRegistryBoundary,
    releaseCertification: buildReleaseCertification(
      publicApiProjection,
      npmRegistryBoundary,
      operations,
      producerCapabilityRegister,
      exactToolEvidenceRegister,
      inputs.terminalReferenceBuilderSource,
    ),
    publicApiProjection,
    verification: {
      operationAccounting: "exact-67",
      nonOperationAccounting: "exact-46",
      publicSurface: "bidirectional-topology-and-owner-validation",
      privateSurface: "conditional-packages-and-modules-unreachable-from-package-exports",
      consumer: "packed-ts-release-adopter-validates-logical-name-digest-and-immutable-bytes",
    },
  };
};

const validateOwners = (contract) => {
  const publicOperationIds = new Set(
    contract.providerOperationRegister.operations
      .filter((operation) => operation.accounting.surface === "public")
      .map((operation) => operation.operationId),
  );
  const allowedOwnerIds = new Set([
    ...publicOperationIds,
    ...contract.coreCapabilityRegister.capabilities.map((entry) => entry.id),
    ...contract.producerCapabilityRegister.capabilities.map((entry) => entry.id),
  ]);
  const observedOwners = [];
  for (const [packageName, packageSurface] of Object.entries(contract.publicApiProjection.packages)) {
    requireText(packageName, "publicApiProjection package");
    requireUnique(packageSurface.rootNamespaces, `${packageName}.rootNamespaces`);
    if (!sameJson(sorted(Object.keys(packageSurface.rootOwners)), sorted(packageSurface.rootNamespaces))) {
      throw new Error(`${packageName} root ownership is incomplete`);
    }
    for (const [namespace, ownerIds] of Object.entries(packageSurface.rootOwners)) {
      if (!packageSurface.rootNamespaces.includes(namespace)) {
        throw new Error(`${packageName} has owners for an undeclared root namespace ${namespace}`);
      }
      if (!Array.isArray(ownerIds) || ownerIds.length === 0) throw new Error(`${packageName}.${namespace} has no owners`);
      for (const ownerId of ownerIds) {
        if (!allowedOwnerIds.has(ownerId)) throw new Error(`${packageName}.${namespace} has unadmitted owner ${ownerId}`);
        observedOwners.push(ownerId);
      }
    }
    for (const [subpath, subpathSurface] of Object.entries(packageSurface.subpaths)) {
      const ownerIds = Array.isArray(subpathSurface) ? subpathSurface : subpathSurface.ownerIds;
      if (!Array.isArray(ownerIds) || ownerIds.length === 0) throw new Error(`${packageName}${subpath} has no owners`);
      for (const ownerId of ownerIds) {
        if (!allowedOwnerIds.has(ownerId)) throw new Error(`${packageName}${subpath} has unadmitted owner ${ownerId}`);
        observedOwners.push(ownerId);
      }
    }
  }
  for (const operationId of publicOperationIds) {
    if (!observedOwners.includes(operationId)) throw new Error(`public operation has no public surface owner: ${operationId}`);
  }
  for (const capability of contract.producerCapabilityRegister.capabilities) {
    if (capability.visibility === "public" && !observedOwners.includes(capability.id)) {
      throw new Error(`public producer capability has no public surface owner: ${capability.id}`);
    }
  }
};

const validateContractModel = (contract, inputs, expectedReleaseOverride) => {
  if (contract.schema !== "effect-build/combined-contract@1") throw new Error("unexpected combined contract schema");
  if (
    contract.exactToolEvidenceRegister.count !== exactToolEvidenceRegister.length
    || !sameJson(contract.exactToolEvidenceRegister.tools, exactToolEvidenceRegister)
  ) {
    throw new Error("exact tool evidence register does not match canonical policy");
  }
  requireUnique(contract.exactToolEvidenceRegister.tools.map((entry) => entry.id), "exact tool evidence ids");
  requireUnique(contract.exactToolEvidenceRegister.tools.map((entry) => entry.name), "exact tool evidence names");
  for (const tool of contract.exactToolEvidenceRegister.tools) {
    requireText(tool.name, `${tool.id}.name`);
    requireText(tool.version, `${tool.id}.version`);
    requireUnique(tool.executableBindings, `${tool.id}.executableBindings`);
    requireUnique(tool.evidenceCells, `${tool.id}.evidenceCells`);
    if (tool.executableBindings.length === 0 || tool.evidenceCells.length === 0) {
      throw new Error(`${tool.id} must bind an executable and at least one evidence cell`);
    }
  }
  if (contract.providerOperationRegister.count !== 67) throw new Error("provider operation register must contain 67 rows");
  if (contract.nonOperationRegister.count !== 46) throw new Error("non-operation register must contain 46 rows");
  if (!sameJson(contract.providerOperationRegister.dispositionCounts, expectedDispositionCounts)) {
    throw new Error(`unexpected provider disposition counts: ${JSON.stringify(contract.providerOperationRegister.dispositionCounts)}`);
  }
  if (!sameJson(contract.nonOperationRegister.dispositionCounts, expectedNonOperationDispositionCounts)) {
    throw new Error(`unexpected non-operation disposition counts: ${JSON.stringify(contract.nonOperationRegister.dispositionCounts)}`);
  }
  const operations = contract.providerOperationRegister.operations;
  requireUnique(operations.map((operation) => operation.operationId), "provider operation ids");
  requireUnique(contract.nonOperationRegister.findings.map((entry) => entry.atomId), "non-operation ids");
  requireUnique(contract.privateImplementationRegister.capabilities.map((entry) => entry.id), "private support ids");
  const findingsById = new Map(contract.nonOperationRegister.findings.map((entry) => [entry.atomId, entry]));
  for (const capability of contract.privateImplementationRegister.capabilities) {
    if (capability.visibility !== "private") throw new Error(`${capability.id} must remain private`);
    for (const atomId of capability.atomIds) {
      const finding = findingsById.get(atomId);
      if (finding?.disposition !== "conditional-private") {
        throw new Error(`${capability.id} maps non-conditional finding ${atomId}`);
      }
    }
  }
  const adjudicatedIds = new Set(inputs.adjudication.candidates.map((entry) => entry.operationId));
  for (const operation of operations) {
    if (!adjudicatedIds.has(operation.operationId)) throw new Error(`operation lacks surface adjudication: ${operation.operationId}`);
    if (operation.accounting.surface === "absent" && operation.implementation !== null) {
      throw new Error(`absent operation has implementation target: ${operation.operationId}`);
    }
    if (operation.accounting.surface !== "absent" && operation.implementation === null) {
      throw new Error(`live operation lacks implementation target: ${operation.operationId}`);
    }
  }
  const publicCount = operations.filter((operation) => operation.accounting.surface === "public").length;
  const privateCount = operations.filter((operation) => operation.accounting.surface === "private").length;
  const absentCount = operations.filter((operation) => operation.accounting.surface === "absent").length;
  if (publicCount !== 27 || privateCount !== 27 || absentCount !== 13) {
    throw new Error(`unexpected surface counts: public=${publicCount} private=${privateCount} absent=${absentCount}`);
  }
  for (const operationId of denoPrivateOperationIds) {
    const operation = operations.find((entry) => entry.operationId === operationId);
    if (operation?.disposition !== "conditional-private" || operation.accounting.surface !== "private") {
      throw new Error(`${operationId} must remain conditional and private`);
    }
  }
  const rolldown = operations.filter((operation) => operation.provider === "rolldown");
  if (rolldown.length !== 20) throw new Error("Rolldown must account for 20 operations");
  if (rolldown.filter((operation) => operation.accounting.surface === "private").length !== 19) {
    throw new Error("all 19 live Rolldown operations must remain private");
  }
  if (!sameJson(
    rolldown.filter((operation) => operation.disposition === "rejected").map((operation) => operation.operationId),
    rolldownRejectedOperationIds,
  )) throw new Error("Rolldown rejection set changed");
  if (!sameJson(contract.publicApiProjection.privatePackages, ["effect-build-rolldown"])) {
    throw new Error("Rolldown package must remain private");
  }
  const producers = contract.producerCapabilityRegister.capabilities;
  requireUnique(producers.map((entry) => entry.id), "producer capability ids");
  if (producers.length !== 19) throw new Error("producer register must contain 19 canonical capabilities");
  if (!sameJson(sorted(new Set(producers.map((entry) => entry.family))), contract.producerCapabilityRegister.families)) {
    throw new Error("producer family accounting changed");
  }
  for (const producer of producers) {
    if (producer.visibility !== "public") throw new Error(`${producer.id} must explicitly state public visibility`);
    if (typeof producer.finalization?.returnsDurableArtifact !== "boolean") {
      throw new Error(`${producer.id} must explicitly state finalizing semantics`);
    }
  }
  const nonFinalizing = producers.filter((entry) => !entry.finalization.returnsDurableArtifact);
  if (nonFinalizing.length !== 5 || nonFinalizing.some((entry) => entry.family !== "apple")) {
    throw new Error("only Apple notarization and assessment operations are provider-native non-finalizing results");
  }
  if (!sameJson(contract.releaseOwnershipBoundary.handoff.identity, ["logicalName", "digest"])) {
    throw new Error("release adoption identity must be logicalName plus digest");
  }
  if (!contract.releaseOwnershipBoundary.tsReleaseOwns.includes("mutation-journals-including-apple-notarization")) {
    throw new Error("ts-release must own the durable Apple notarization journal");
  }
  const npm = contract.npmRegistryBoundary;
  const admittedPackages = sorted(Object.keys(contract.publicApiProjection.packages));
  const reservedOnlyPackages = sorted(contract.publicApiProjection.privatePackages);
  const namespacePackages = sorted([...admittedPackages, ...reservedOnlyPackages]);
  const bootstrapPackages = sorted([
    ...npmRegistryBootstrap.establishedPackages,
    ...npmRegistryBootstrap.placeholderAtHandoffPackages,
  ]);
  if (!sameJson(npm.trustedPublisher, npmTrustedPublisher)) {
    throw new Error("npm trusted-publisher identity changed");
  }
  requireUnique(npm.trustedPublisher.expectedPermissions, "npm trusted-publisher expected permissions");
  if (
    !sameJson(npm.trustedPublisher.expectedPermissions, ["createPackage"])
    || npm.trustedPublisher.semantics
      !== "expected-npm-11.19.1-trust-record-identity-for-publication-not-live-observation"
  ) throw new Error("npm trusted-publisher expectation must not claim a live administrative observation");
  if (
    npm.purpose !== "repository-package-distribution-only"
    || npm.productReleaseOwnership !== "unchanged-ts-release-boundary"
    || !sameJson(npm.candidateHandoff, {
      producer: "unprivileged-verified-pack-job",
      consumer: "protected-npm-distribution-job",
      identity: ["logicalName", "digest"],
      content: "immutable-package-tarball-bytes",
      repositoryCodeInOidcJob: "forbidden",
    })
  ) {
    throw new Error("npm distribution must remain outside the effect-build product release boundary");
  }
  if (npm.registry !== npmRegistryUrl || !sameJson(npm.client, npmTrustedPublishClient)) {
    throw new Error("npm trusted-publish client identity changed");
  }
  if (!sameJson(npm.bootstrap, npmRegistryBootstrap) || npm.bootstrap.architectureEvidence !== false) {
    throw new Error("npm namespace placeholders must remain non-architectural bootstrap evidence");
  }
  if (!sameJson(bootstrapPackages, namespacePackages)) {
    throw new Error("npm bootstrap accounting must cover the exact public and private package namespace");
  }
  requireUnique(npm.bootstrap.placeholderAtHandoffPackages, "npm placeholder-at-handoff packages");
  requireUnique(npm.bootstrap.placeholderLedger.map((entry) => entry.name), "npm placeholder ledger names");
  if (!sameJson(
    sorted(npm.bootstrap.placeholderLedger.map((entry) => entry.name)),
    sorted(npm.bootstrap.placeholderAtHandoffPackages),
  )) {
    throw new Error("npm placeholder ledger must cover the exact placeholder-at-handoff cohort");
  }
  for (const entry of npm.bootstrap.placeholderLedger) {
    if (
      entry.version !== npm.bootstrap.placeholderVersion
      || entry.bootstrapTags.reserved !== npm.bootstrap.placeholderVersion
      || entry.bootstrapTags.latest !== npm.bootstrap.placeholderVersion
      || !Number.isInteger(entry.bytes)
      || entry.bytes <= 0
      || !/^[0-9a-f]{64}$/u.test(entry.sha256)
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)
    ) {
      throw new Error(`invalid npm placeholder ledger entry: ${entry.name}`);
    }
  }
  if (
    npm.publicationAdmission.source !== "publicApiProjection.packages"
    || !sameJson(sorted(npm.publicationAdmission.packages), admittedPackages)
  ) {
    throw new Error("npm release admission must be the public package projection");
  }
  if (!sameJson(npm.publicationAdmission.target, npmReleaseTarget)) {
    throw new Error("npm release target or prior-latest ledger changed");
  }
  const expectedLatest = npm.publicationAdmission.target.expectedLatestBeforePublication;
  const expectedDistTags = npm.publicationAdmission.target.expectedDistTagsBeforePublication;
  requireUnique(expectedLatest.map((entry) => entry.name), "npm expected prior-latest package names");
  requireUnique(expectedDistTags.map((entry) => entry.name), "npm expected prepublication dist-tag package names");
  if (
    !sameJson(sorted(expectedLatest.map((entry) => entry.name)), admittedPackages)
    || !sameJson(sorted(expectedDistTags.map((entry) => entry.name)), admittedPackages)
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      npm.publicationAdmission.target.version,
    )
    || expectedLatest.some((entry) =>
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(entry.version)
    )
    || expectedDistTags.some((entry) =>
      !sameJson(Object.keys(entry.tags), entry.name === "effect-build" ? ["latest"] : ["latest", "reserved"])
      || Object.values(entry.tags).some((version) =>
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(version)
      )
    )
    || expectedLatest.some(({ name, version }) =>
      expectedDistTags.find((entry) => entry.name === name)?.tags.latest !== version
    )
  ) {
    throw new Error(
      "npm prepublication dist-tag and prior-latest ledgers must cover the exact admitted package set",
    );
  }
  if (
    npm.reservation.source !== "publicApiProjection.privatePackages"
    || !sameJson(sorted(npm.reservation.packages), reservedOnlyPackages)
  ) {
    throw new Error("private package names must remain registry placeholders");
  }
  if (
    npm.publicationAdmission.command !== "npm-publish"
    || npm.publicationAdmission.tag !== "latest"
    || npm.publicationAdmission.postPublishProof !== "downloaded-tarball-integrity"
    || npm.publicationAdmission.existingVersionPolicy !== "exact-bytes-and-latest-or-stop"
    || npm.publicationAdmission.priorLatestPolicy !== "exact-contract-ledger-or-target-on-resume"
    || npm.publicationAdmission.registryObservation !== "isolated-cache-prefer-online"
    || npm.publicationAdmission.lifecycleScripts !== "disabled"
    || npm.reservation.policy !== "placeholder-version-and-tags-remain-unchanged"
  ) {
    throw new Error("npm release tag promotion policy changed");
  }
  const releaseCertification = contract.releaseCertification;
  const expectedReleaseCertification = expectedReleaseOverride ?? buildReleaseCertification(
    contract.publicApiProjection,
    contract.npmRegistryBoundary,
    contract.providerOperationRegister.operations,
    contract.producerCapabilityRegister.capabilities,
    contract.exactToolEvidenceRegister.tools,
    inputs.terminalReferenceBuilderSource,
  );
  if (!sameJson(releaseCertification, expectedReleaseCertification)) {
    throw new Error("release certification policy does not match the canonical generated policy");
  }
  const publicAdmission = releaseCertification.publicAdmission;
  const scope = releaseCertification.scope;
  const npmAdministrativeInventory = releaseCertification.npmAdministrativeInventory;
  if (
    publicAdmission.packageSource !== "publicApiProjection.packages"
    || publicAdmission.packageCount !== admittedPackages.length
    || publicAdmission.packageCount !== 11
    || publicAdmission.moduleSource !== "publicApiProjection.packages package roots and subpaths"
    || publicAdmission.moduleCount !== 42
    || publicAdmission.reservationSource !== "publicApiProjection.privatePackages"
    || publicAdmission.reservationCount !== reservedOnlyPackages.length
    || publicAdmission.reservationCount !== 1
  ) {
    throw new Error("release certification admission must remain a count-only projection of the public surface");
  }
  if (!sameJson(scope, {
    target: `v${npm.publicationAdmission.target.version}`,
    npmPackages: {
      status: "included",
      packageSource: "publicApiProjection.packages",
      appleApiLibrary: "included-as-effect-build-apple",
      packageCountSource: "releaseCertification.publicAdmission.packageCount",
    },
    credentialBackedAppleArtifacts: {
      status: "deferred",
      certification: "not-run-not-passed",
      releaseGate: "excluded-from-v0.6.1",
      products: ["signed-app", "dmg", "pkg"],
      target: "later-separately-qualified-release",
    },
    awsNotaryJournalEvidence: {
      status: "deferred",
      releaseGate: "excluded-from-v0.6.1",
      applicability: "future-credential-backed-apple-artifact-certification-only",
    },
  })) throw new Error("v0.6 release scope must include Apple APIs and defer credential-backed Apple products");
  requireUnique(npmAdministrativeInventory.doesNotProve, "npm administrative inventory exclusions");
  if (!sameJson(npmAdministrativeInventory, {
    status: "not-observed",
    releaseGate: "excluded-from-v0.6.1",
    doesNotProve: [
      "trusted-publisher-admin-inventory",
      "publishing-access-two-factor-and-token-policy",
    ],
  })) throw new Error("unsupported npm administrative inventory must remain explicitly excluded");
  requireUnique(releaseCertification.modes, "release certification modes");
  requireUnique(
    releaseCertification.githubArtifactCoordinate.orderedFields,
    "release certification artifact coordinate fields",
  );
  const githubAuthority = releaseCertification.githubAuthority;
  const [expectedRepositoryOwner] = npm.trustedPublisher.repository.split("/");
  const readOnlyTransport = githubAuthority.readOnlyTransport;
  requireUnique(readOnlyTransport.artifactRedirectHostPolicy.suffixes, "GitHub artifact redirect host suffixes");
  requireUnique(readOnlyTransport.artifactRedirectHostPolicy.redirectStatuses, "GitHub artifact redirect statuses");
  requireUnique(readOnlyTransport.releaseAssetRedirectHostPolicy.hosts, "GitHub Release asset redirect hosts");
  requireUnique(readOnlyTransport.releaseAssetRedirectHostPolicy.directStatuses, "GitHub Release asset direct statuses");
  requireUnique(readOnlyTransport.releaseAssetRedirectHostPolicy.redirectStatuses, "GitHub Release asset redirect statuses");
  if (
    githubAuthority.identitySource !== "npmRegistryBoundary.trustedPublisher"
    || githubAuthority.repository !== npm.trustedPublisher.repository
    || githubAuthority.repositoryOwner !== expectedRepositoryOwner
    || githubAuthority.workflow !== npm.trustedPublisher.workflow
    || githubAuthority.environment !== npm.trustedPublisher.environment
    || githubAuthority.expectedEnvironmentSubject
      !== `${githubAuthority.oidcSubjectPolicy.sub_claim_prefix}:environment:${npm.trustedPublisher.environment}`
    || githubAuthority.expectedEnvironmentSubjectSource !== "immutable-id-repository-and-environment"
    || !/^[1-9][0-9]*$/u.test(githubAuthority.repositoryId)
    || !/^[1-9][0-9]*$/u.test(githubAuthority.repositoryOwnerId)
    || githubAuthority.repositoryVisibility !== "public"
    || !sameJson(readOnlyTransport, {
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
    })
    || !sameJson(githubAuthority.branchPolicy.exactProtectionRuleTypes, ["branch_policy", "required_reviewers"])
    || githubAuthority.branchPolicy.name !== "main"
    || githubAuthority.branchPolicy.type !== "branch"
    || !sameJson(githubAuthority.branchPolicy.deploymentBranchPolicy, {
      customBranchPolicies: true,
      protectedBranches: false,
    })
    || !Number.isSafeInteger(githubAuthority.reviewer.id)
    || githubAuthority.reviewer.id <= 0
    || githubAuthority.reviewer.preventSelfReview !== false
    || typeof githubAuthority.reviewer.login !== "string"
    || githubAuthority.reviewer.login.length === 0
    || githubAuthority.reviewer.type !== "User"
    || githubAuthority.oidcSubjectPolicy.use_default !== true
    || githubAuthority.oidcSubjectPolicy.use_immutable_subject !== true
    || typeof githubAuthority.oidcSubjectPolicy.sub_claim_prefix !== "string"
    || githubAuthority.oidcSubjectPolicy.sub_claim_prefix.length === 0
  ) {
    throw new Error("release GitHub authority must remain derived from npm authority plus one exact governance policy");
  }
  const authorizationSplit = githubAuthority.authorizationSplit;
  requireUnique(
    authorizationSplit.protectedGithubTokenObservations,
    "protected GitHub token observations",
  );
  requireUnique(
    authorizationSplit.administrativeExternalOnly,
    "external administrative authority observations",
  );
  requireUnique(
    authorizationSplit.forbiddenCredentialEscalation,
    "forbidden GitHub credential escalation",
  );
  if (
    !sameJson(authorizationSplit.protectedGithubTokenObservations, [
      "repository-metadata",
      "environment-deployment-policy",
      "branch-policy",
      "oidc-subject-policy",
      "current-main",
      "workflow-blob",
    ])
    || !sameJson(authorizationSplit.administrativeExternalOnly, [
      "repository-secret-name-inventory",
      "repository-variable-name-inventory",
      "environment-secret-name-inventory",
      "environment-variable-name-inventory",
    ])
    || authorizationSplit.runtimeForbiddenEnvironmentSource
      !== "releaseCertification.npmOidcCertification.forbiddenEnvironmentNames"
    || authorizationSplit.publishGate
      !== "releaseCertification.readiness exact-three-github-evidence aggregate"
    || !sameJson(authorizationSplit.forbiddenCredentialEscalation, [
      "personal-access-token",
      "github-app-token",
      "administrative-token",
    ])
  ) {
    throw new Error("protected GitHub reauthorization must not claim administrative inventory authority");
  }
  if (!sameJson(releaseCertification.dependencyBootstrap, {
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
  })) throw new Error("checkout dependency bootstrap must remain one isolated lock-integrity hard cut");
  const readiness = releaseCertification.readiness;
  requireUnique(readiness.zipExtraction.allowedCompressionMethods, "release readiness ZIP methods");
  if (!sameJson(readiness.zipExtraction, {
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
  })) throw new Error("release readiness ZIP extraction policy must remain exact and bounded");
  const zipProjection = readiness.zipExtraction.protectedProjection;
  const zipProvenance = contract.provenance.sources.find(({ path }) => path === zipProjection.sourcePath);
  const zipInput = inputs?.sources?.find(({ path }) => path === zipProjection.sourcePath);
  if (
    zipProvenance?.sha256 !== zipProjection.sourceDigest.slice("sha256:".length)
    || (zipInput !== undefined && Buffer.byteLength(zipInput.source) !== zipProjection.sourceBytes)
  ) throw new Error("protected ZIP projection does not match its exact source bytes");
  const tarballInspection = releaseCertification.candidate.tarballInspection;
  if (!sameJson(tarballInspection, {
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
  })) throw new Error("release candidate tarball inspection policy must remain exact and bounded");
  const tarProjection = tarballInspection.protectedProjection;
  const tarProvenance = contract.provenance.sources.find(({ path }) => path === tarProjection.sourcePath);
  const tarInput = inputs?.sources?.find(({ path }) => path === tarProjection.sourcePath);
  if (
    tarProvenance?.sha256 !== tarProjection.sourceDigest.slice("sha256:".length)
    || (tarInput !== undefined && Buffer.byteLength(tarInput.source) !== tarProjection.sourceBytes)
    || tarballInspection.maximumCompressedBytes !== readiness.zipExtraction.maximumMemberUncompressedBytes
    || tarballInspection.maximumUnpackedBytes !== readiness.zipExtraction.maximumTotalUncompressedBytes
  ) throw new Error("protected tarball projection or archive bounds differ from the canonical ZIP boundary");
  requireUnique(readiness.orderedFiles, "release readiness aggregate files");
  requireUnique(readiness.evidenceRoles.map((entry) => entry.role), "release readiness evidence roles");
  requireUnique(readiness.evidenceRoles.map((entry) => entry.protocol), "release readiness evidence protocols");
  for (const fields of Object.values(readiness.referenceShapes)) {
    requireUnique(fields, "release readiness reference fields");
  }
  const readinessShapeNames = Object.keys(readiness.referenceShapes).sort();
  const referencedShapeNames = [
    readiness.candidate.referenceType,
    ...new Set(readiness.evidenceRoles.map((entry) => entry.type)),
  ].sort();
  if (
    readiness.protocol !== "effect-build/release-readiness@3"
    || readiness.bundleProtocol !== "effect-build/release-readiness-evidence-bundle@3"
    || readiness.retentionDays !== 30
    || readiness.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || !sameJson(readiness.orderedFiles, [readiness.manifest, readiness.evidenceBundle])
    || readiness.candidate.protocolSource !== "releaseCertification.candidate.protocol"
    || readiness.candidate.coordinate !== "required-exact"
    || readiness.candidate.workflowSource !== "releaseCertification.candidate.workflow"
    || readiness.candidate.artifactNameSource !== "releaseCertification.candidate.artifactName"
    || releaseCertification.candidate.workflowPath !== ".github/workflows/release.yml"
    || releaseCertification.candidate.workflow
      !== `${githubAuthority.repository}/${releaseCertification.candidate.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || releaseCertification.candidate.event !== "workflow_dispatch"
    || readiness.workflow
      !== `${githubAuthority.repository}/${readiness.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || readiness.event !== "workflow_dispatch"
    || readiness.evidenceRoles.length !== 3
    || !sameJson(readinessShapeNames, referencedShapeNames)
    || readiness.evidenceRoles.some((entry) =>
      !/^effect-build\/[a-z0-9-]+@\d+$/u.test(entry.protocol)
      || typeof entry.terminal !== "string"
      || entry.terminal.length === 0
      || !["githubRun", "githubArtifact"].includes(entry.type)
      || entry.workflow
        !== `${githubAuthority.repository}/${entry.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
      || (entry.type === "githubArtifact" && (typeof entry.artifactName !== "string" || entry.artifactName.length === 0))
    )
  ) {
    throw new Error("release readiness must remain one closed candidate plus three GitHub evidence roles");
  }
  const dispatch = readiness.dispatch;
  const dispatchRoleInputs = dispatch?.evidenceInputs;
  requireUnique(dispatchRoleInputs.map((entry) => entry.role), "release readiness dispatch evidence roles");
  requireUnique(dispatchRoleInputs.map((entry) => entry.input), "release readiness dispatch evidence inputs");
  requireUnique(readiness.githubRunObservation.fields, "release readiness GitHub run observation fields");
  const directObservation = readiness.directObservation;
  for (const [name, fields] of Object.entries({
    fields: directObservation.fields,
    githubFields: directObservation.githubFields,
    environmentFields: directObservation.environmentFields,
    reviewerFields: directObservation.reviewerFields,
    branchPolicyFields: directObservation.branchPolicyFields,
    npmFields: directObservation.npmFields,
    npmPackageFields: directObservation.npmPackageFields,
    repositoryFields: directObservation.repositoryFields,
    placeholderFields: directObservation.placeholderFields,
  })) requireUnique(fields, `release readiness direct-observation ${name}`);
  requireUnique(directObservation.githubEndpoints, "release readiness direct GitHub endpoints");
  requireUnique(directObservation.npmChecks, "release readiness direct npm checks");
  if (
    readiness.clockSkewSeconds !== 60
    || readiness.aggregateMaximumAgeSeconds !== 14400
    || readiness.candidate.maximumAgeSeconds !== 604800
    || readiness.candidate.maximumValiditySeconds !== 604800
    || dispatch.sourceInput !== "source_sha"
    || dispatch.candidateInput !== "candidate_reference_json"
    || !sameJson(dispatchRoleInputs.map(({ role }) => role), readiness.evidenceRoles.map(({ role }) => role))
    || dispatchRoleInputs.some(({ input }) => !/^[a-z][a-z0-9_]*_json$/u.test(input))
    || dispatch.githubInputs !== "closed-full-reference-json-downloaded-by-workflow"
    || !sameJson(readiness.githubAuthentication, {
      currentMain: "git-ref-heads-main-exact-sourceSha",
      runStatus: "completed",
      runConclusion: "success",
      artifactExpired: false,
      artifactDigest: "rest-metadata-and-downloaded-zip-sha256-exact",
    })
    || !sameJson(readiness.githubRunObservation.fields, [
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
    ])
    || !sameJson(directObservation, releaseCertificationPolicy.readiness.directObservation)
    || readiness.evidenceRoles.some((entry) => !["push", "workflow_dispatch"].includes(entry.event))
    || readiness.evidenceRoles.some((entry) =>
      !Number.isSafeInteger(entry.maximumAgeSeconds)
      || entry.maximumAgeSeconds <= 0
      || !Number.isSafeInteger(entry.maximumValiditySeconds)
      || entry.maximumValiditySeconds < entry.maximumAgeSeconds
      || entry.maximumValiditySeconds > 172800
    )
  ) {
    throw new Error("release readiness dispatch and GitHub authentication policy must remain exact");
  }
  const provenanceVerification = releaseCertification.provenanceVerification;
  const trustedRoot = provenanceVerification.trustedRoot;
  let decodedTrustedRoot;
  try {
    decodedTrustedRoot = JSON.parse(inputs.sigstoreTrustedRootSource);
  } catch {
    throw new Error("vendored Sigstore trusted-root target must be UTF-8 JSON");
  }
  const acquisition = trustedRoot.tuf.acquisition;
  const evidenceBytes = (descriptor, label) => canonicalBase64Evidence(
    inputs.sigstoreTufEvidenceSources.get(descriptor.path),
    descriptor,
    label,
  );
  const seedRootBytes = evidenceBytes(acquisition.seedRoot, "Sigstore TUF seed root");
  const rootMetadataBytes = evidenceBytes(acquisition.metadata.root, "Sigstore TUF root metadata");
  const timestampMetadataBytes = evidenceBytes(
    acquisition.metadata.timestamp,
    "Sigstore TUF timestamp metadata",
  );
  const snapshotMetadataBytes = evidenceBytes(
    acquisition.metadata.snapshot,
    "Sigstore TUF snapshot metadata",
  );
  const targetsMetadataBytes = evidenceBytes(acquisition.metadata.targets, "Sigstore TUF targets metadata");
  const parseMetadata = (bytes, kind, descriptor, label) => {
    let value;
    try {
      value = Metadata.fromJSON(kind, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    } catch {
      throw new Error(`${label} must be valid signed metadata`);
    }
    if (
      value.signed.version !== descriptor.version
      || new Date(value.signed.expires).toISOString() !== descriptor.expiresAt
    ) throw new Error(`${label} version or expiry changed`);
    return value;
  };
  const seedRoot = parseMetadata(
    seedRootBytes,
    MetadataKind.Root,
    acquisition.seedRoot,
    "Sigstore TUF seed root",
  );
  const rootMetadata = parseMetadata(
    rootMetadataBytes,
    MetadataKind.Root,
    acquisition.metadata.root,
    "Sigstore TUF root metadata",
  );
  const timestampMetadata = parseMetadata(
    timestampMetadataBytes,
    MetadataKind.Timestamp,
    acquisition.metadata.timestamp,
    "Sigstore TUF timestamp metadata",
  );
  const snapshotMetadata = parseMetadata(
    snapshotMetadataBytes,
    MetadataKind.Snapshot,
    acquisition.metadata.snapshot,
    "Sigstore TUF snapshot metadata",
  );
  const targetsMetadata = parseMetadata(
    targetsMetadataBytes,
    MetadataKind.Targets,
    acquisition.metadata.targets,
    "Sigstore TUF targets metadata",
  );
  try {
    seedRoot.verifyDelegate(MetadataKind.Root, seedRoot);
    seedRoot.verifyDelegate(MetadataKind.Root, rootMetadata);
    rootMetadata.verifyDelegate(MetadataKind.Root, rootMetadata);
    rootMetadata.verifyDelegate(MetadataKind.Timestamp, timestampMetadata);
    timestampMetadata.signed.snapshotMeta.verify(snapshotMetadataBytes);
    rootMetadata.verifyDelegate(MetadataKind.Snapshot, snapshotMetadata);
    snapshotMetadata.signed.meta[`${MetadataKind.Targets}.json`].verify(targetsMetadataBytes);
    rootMetadata.verifyDelegate(MetadataKind.Targets, targetsMetadata);
  } catch {
    throw new Error("retained Sigstore TUF metadata signature or descriptor chain is invalid");
  }
  const retrievedAt = new Date(acquisition.retrievedAt);
  const targetDescriptor = targetsMetadata.signed.targets[trustedRoot.tuf.target];
  const tufClients = new Map(acquisition.clients.map((entry) => [entry.package, entry]));
  const lockRecords = parseBunLockfilePackageRecords(inputs.lockfileSource);
  const lockContainsClient = (entry) => {
    const matches = lockRecords.filter(([name]) => name === entry.package);
    return matches.length === 1
      && matches[0][1]?.[0] === `${entry.package}@${entry.version}`
      && matches[0][1]?.at(-1) === entry.integrity;
  };
  if (
    provenanceVerification.purpose !== "npm-publication-provenance-verification-only"
    || provenanceVerification.status !== "implemented"
    || provenanceVerification.module !== "scripts/release/sigstore-dsse-verifier.mjs"
    || !sameJson(provenanceVerification.client, { package: "@sigstore/verify", version: "3.1.1" })
    || !sameJson(provenanceVerification.bundleClient, { package: "@sigstore/bundle", version: "4.0.0" })
    || !sameJson(provenanceVerification.protobufClient, {
      package: "@sigstore/protobuf-specs",
      version: "0.5.2",
    })
    || !sameJson(provenanceVerification.runtime, { executable: "node", version: "24.14.1" })
    || inputs.packageManifest.devDependencies?.[provenanceVerification.client.package]
      !== provenanceVerification.client.version
    || inputs.packageManifest.devDependencies?.[provenanceVerification.bundleClient.package]
      !== provenanceVerification.bundleClient.version
    || inputs.packageManifest.devDependencies?.[provenanceVerification.protobufClient.package]
      !== provenanceVerification.protobufClient.version
    || !sameJson(provenanceVerification.networkGuard, {
      path: sigstoreNetworkGuardPath,
      bytes: 4379,
      digest: "sha256:acb4f347c8abb4dbc98d138b487b7cf316a3ccbbbf3a2da2108e68e9b343de77",
      strategy: "preload-standard-node-network-api-denial-plus-audited-direct-verifier-closure",
    })
    || Buffer.byteLength(inputs.sigstoreNetworkGuardSource) !== provenanceVerification.networkGuard.bytes
    || `sha256:${sha256(inputs.sigstoreNetworkGuardSource)}` !== provenanceVerification.networkGuard.digest
    || acquisition.retrievedAt !== "2026-08-30T15:07:03.000Z"
    || acquisition.cache !== "fresh-empty-temporary-directory"
    || acquisition.home !== "isolated-empty-directory"
    || acquisition.network !== "exact-official-mirror-only"
    || acquisition.evidenceEncoding !== "base64-of-exact-retrieved-bytes"
    || acquisition.verificationModule !== "scripts/release/verify-sigstore-tuf-provenance.mjs"
    || acquisition.verification
      !== "retained-seed-root-rotation-signatures-expiry-versions-descriptors-and-target-bytes-replay"
    || !sameJson(acquisition.clients.map(({ package: name, version }) => ({ package: name, version })), [
      { package: "@sigstore/tuf", version: "4.0.2" },
      { package: "tuf-js", version: "4.1.0" },
      { package: "@tufjs/models", version: "4.1.0" },
    ])
    || acquisition.clients.some((entry) =>
      inputs.packageManifest.devDependencies?.[entry.package] !== entry.version || !lockContainsClient(entry))
    || tufClients.size !== acquisition.clients.length
    || seedRoot.signed.version + 1 !== rootMetadata.signed.version
    || timestampMetadata.signed.snapshotMeta.version !== snapshotMetadata.signed.version
    || snapshotMetadata.signed.meta[`${MetadataKind.Targets}.json`].version !== targetsMetadata.signed.version
    || Number.isNaN(retrievedAt.valueOf())
    || rootMetadata.signed.isExpired(retrievedAt)
    || timestampMetadata.signed.isExpired(retrievedAt)
    || snapshotMetadata.signed.isExpired(retrievedAt)
    || targetsMetadata.signed.isExpired(retrievedAt)
    || targetDescriptor?.length !== trustedRoot.tuf.targetLength
    || targetDescriptor?.hashes.sha256 !== trustedRoot.tuf.targetSha256.slice("sha256:".length)
    || !sameJson(trustedRoot, {
      path: sigstoreTrustedRootPath,
      mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
      bytes: 6787,
      digest: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
      tuf: {
        mirror: "https://tuf-repo-cdn.sigstore.dev",
        target: "trusted_root.json",
        targetsMetadataVersion: 14,
        targetLength: 6787,
        targetSha256: "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66",
        acquisition: sigstoreTufAcquisition,
      },
      verification: "offline-direct-verifier-no-tuf-network-or-cache-fallback",
    })
    || Buffer.byteLength(inputs.sigstoreTrustedRootSource) !== trustedRoot.bytes
    || `sha256:${sha256(inputs.sigstoreTrustedRootSource)}` !== trustedRoot.digest
    || decodedTrustedRoot.mediaType !== trustedRoot.mediaType
    || !Array.isArray(decodedTrustedRoot.tlogs)
    || decodedTrustedRoot.tlogs.length === 0
    || !Array.isArray(decodedTrustedRoot.certificateAuthorities)
    || decodedTrustedRoot.certificateAuthorities.length === 0
    || !Array.isArray(decodedTrustedRoot.ctlogs)
    || decodedTrustedRoot.ctlogs.length === 0
    || !Array.isArray(decodedTrustedRoot.timestampAuthorities)
    || decodedTrustedRoot.timestampAuthorities.length === 0
    || provenanceVerification.bundleMediaType !== "application/vnd.dev.sigstore.bundle.v0.3+json"
    || provenanceVerification.certificateIssuer !== "https://token.actions.githubusercontent.com"
    || provenanceVerification.certificateIdentityMatch
      !== "exact-anchored-uri-from-contract-release-workflow-identity"
    || !sameJson(provenanceVerification.certificateOids, {
      buildSignerUri: "1.3.6.1.4.1.57264.1.9",
      sourceRepositoryUri: "1.3.6.1.4.1.57264.1.12",
      sourceRepositoryDigest: "1.3.6.1.4.1.57264.1.13",
    })
    || provenanceVerification.ctLogThreshold !== 1
    || provenanceVerification.tlogThreshold !== 1
    || provenanceVerification.minimumTlogEntries !== 1
    || provenanceVerification.maximumBundleBytes !== 32768
    || provenanceVerification.forbiddenEnvironmentSource
      !== "releaseCertification.npmOidcCertification.forbiddenEnvironmentNames"
    || provenanceVerification.network !== "forbidden-by-preload-guard-and-audited-direct-verifier-closure"
  ) {
    throw new Error("npm provenance verification must retain one pinned offline Sigstore trust boundary");
  }
  const npmOidcRole = readiness.evidenceRoles.find((entry) => entry.role === "npm-oidc-certification");
  if (
    npmOidcRole?.protocol !== releaseCertification.npmOidcCertification.evidence.artifactProtocol
    || npmOidcRole?.workflow !== releaseCertification.candidate.workflow
    || npmOidcRole?.artifactName !== releaseCertification.npmOidcCertification.evidence.artifactName
  ) {
    throw new Error("release readiness evidence roles must reuse the canonical npm OIDC identity");
  }
  const finalPublicVerification = releaseCertification.finalPublicVerification;
  for (const fields of Object.values(finalPublicVerification.referenceShapes)) {
    requireUnique(fields, "final public verification reference fields");
  }
  requireUnique(
    finalPublicVerification.publicState.requiredChecks,
    "final public verification required checks",
  );
  requireUnique(finalPublicVerification.receipt.orderedFiles, "final public verification receipt files");
  requireUnique(finalPublicVerification.receipt.fields, "final public verification receipt fields");
  const finalImplementation = finalPublicVerification.implementation;
  for (const fields of Object.values(finalImplementation.observationFields)) {
    requireUnique(fields, "final public verification observation fields");
  }
  requireUnique(
    finalImplementation.consumerSmoke.representativePipelines,
    "final public verification representative consumer pipelines",
  );
  requireUnique(finalImplementation.consumerSmoke.fields, "final public verification consumer receipt fields");
  requireUnique(finalImplementation.consumerSmoke.node.reportFields, "final public verification Node report fields");
  requireUnique(finalImplementation.consumerSmoke.bun.reportFields, "final public verification Bun report fields");
  const reservationLedger = npm.bootstrap.placeholderLedger.find(
    (entry) => entry.name === "effect-build-rolldown",
  );
  const finalBunVersion = contract.exactToolEvidenceRegister.tools.find(
    (entry) => entry.name === "bun",
  )?.version;
  if (
    finalPublicVerification.protocol !== "effect-build/final-public-verification@2"
    || finalPublicVerification.workflowPath !== ".github/workflows/release-verification.yml"
    || finalPublicVerification.workflow
      !== `${githubAuthority.repository}/${finalPublicVerification.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || finalPublicVerification.event !== "workflow_dispatch"
    || finalPublicVerification.status !== expectedReleaseCertification.finalPublicVerification.status
    || finalPublicVerification.upstreamGateSource
      !== "releaseCertification.readiness"
    || finalPublicVerification.artifactDisposition
      !== expectedReleaseCertification.finalPublicVerification.artifactDisposition
    || !sameJson(finalPublicVerification.permissions, {
      actions: "read",
      contents: "read",
      idToken: "none",
      packages: "anonymous-read",
      repositoryMutation: "forbidden",
    })
    || !sameJson(finalPublicVerification.dispatch, {
      sourceInput: "source_sha",
      candidateInput: "candidate_reference_json",
      readinessInput: "readiness_reference_json",
      tagInput: "tag_reference_json",
      releaseInput: "release_reference_json",
    })
    || !sameJson(Object.keys(finalPublicVerification.referenceShapes), [
      "candidate",
      "readiness",
      "tag",
      "release",
    ])
    || finalPublicVerification.repository !== githubAuthority.repository
    || finalPublicVerification.registry !== npm.registry
    || finalPublicVerification.version !== npm.publicationAdmission.target.version
    || finalPublicVerification.tag !== `v${npm.publicationAdmission.target.version}`
    || finalPublicVerification.packageCount !== publicAdmission.packageCount
    || finalPublicVerification.moduleCount !== publicAdmission.moduleCount
    || finalPublicVerification.releaseAssetCount !== publicAdmission.packageCount + 1
    || finalPublicVerification.candidate.protocol !== releaseCertification.candidate.protocol
    || finalPublicVerification.candidate.workflow !== releaseCertification.candidate.workflow
    || finalPublicVerification.candidate.artifactName !== releaseCertification.candidate.artifactName
    || finalPublicVerification.readiness.protocol !== readiness.protocol
    || finalPublicVerification.readiness.workflow !== readiness.workflow
    || finalPublicVerification.readiness.artifactName !== readiness.artifactName
    || finalPublicVerification.tagPolicy.form !== "lightweight-direct-commit"
    || finalPublicVerification.tagPolicy.objectType !== "commit"
    || finalPublicVerification.tagPolicy.mutation !== "forbidden"
    || finalPublicVerification.releasePolicy.draft !== false
    || finalPublicVerification.releasePolicy.prerelease !== false
    || finalPublicVerification.releasePolicy.targetShaSource !== "authenticated-lightweight-tag-ref-only"
    || finalPublicVerification.releasePolicy.targetCommitishSource
      !== "releaseCertification.githubAuthority.branchPolicy.name-presentation-only"
    || finalPublicVerification.releasePolicy.immutabilityDecisionSource
      !== "live-operator-admin-preflight-before-draft-and-public-release"
    || finalPublicVerification.releasePolicy.mutation !== "forbidden"
    || finalPublicVerification.publicState.packageSource !== "publicApiProjection.packages"
    || finalPublicVerification.publicState.moduleSource
      !== "publicApiProjection.packages package roots and subpaths"
    || finalPublicVerification.publicState.releaseAssetSource
      !== "candidate ordered package ledger plus releaseCertification.candidate.manifest"
    || finalPublicVerification.publicState.requiredChecks.length !== 11
    || finalPublicVerification.freshness.clockSkewSeconds !== 60
    || finalPublicVerification.freshness.maximumObservationAgeSeconds !== 3600
    || finalImplementation.status !== "implemented"
    || finalImplementation.module !== "scripts/release/final-public-verification.mjs"
    || finalImplementation.contractAuthentication !== "exact-generated-bytes"
    || finalImplementation.githubBoundary !== "github-token-read-only-api-no-cross-origin-authorization"
    || finalImplementation.npmBoundary !== "anonymous-registry-read-only-no-preexisting-auth"
    || !sameJson(finalImplementation.observationFields, {
      npmPackage: ["name", "version", "latest", "bytes", "sha256", "integrity", "tarballUrl"],
      releaseAsset: ["name", "assetId", "bytes", "digest", "apiUrl", "browserDownloadUrl"],
      provenance: ["name", "attestationUrl", "bundleDigest", "subjectDigest", "workflow", "sourceSha"],
      consumerSmoke: ["schema", "version", "node", "bun", "publicModules", "pipelines", "passed"],
      reservation: ["name", "version", "versions", "latest", "reserved", "bytes", "sha256", "integrity"],
    })
    || !sameJson(finalImplementation.provenance, {
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
      workflow: releaseCertification.candidate.workflow,
      workflowPath: releaseCertification.candidate.workflowPath,
      branchRef: `refs/heads/${githubAuthority.branchPolicy.name}`,
      repository: githubAuthority.repository,
      repositoryId: githubAuthority.repositoryId,
      repositoryOwnerId: githubAuthority.repositoryOwnerId,
    })
    || !sameJson(finalImplementation.consumerSmoke, {
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
        version: releaseCertification.npmOidcCertification.client.node,
        npm: releaseCertification.npmOidcCertification.client.npm,
      },
      bun: {
        executor: "bun",
        command: "bun scripts/test-built-consumer.mjs --registry-version <version> --runtime bun --json",
        versionSource: "exactToolEvidenceRegister.tools kind=provider name=bun",
        cache: "fresh-empty-bun-cache-and-install-root",
        reportFields: ["executor", "version", "cache", "publicModules", "pipelines", "passed"],
        configurationIsolation:
          "empty-project-user-global-npmrc-and-bunfig-explicit-registry-cache-prefix-and-same-child-npm-config-audit-before-and-after-install",
        version: finalBunVersion,
      },
      ambientConfiguration:
        "forbidden-auth-proxy-extra-ca-node-options-and-host-home-config-with-fresh-empty-home-cache-prefix-and-install-root",
      moduleSource: "publicApiProjection.packages package roots and subpaths",
      representativePipelines: [
        "esbuild-in-memory-provider-build",
        "artifact-file-finalization-and-adoption",
        "artifact-byte-mutation-rejection",
      ],
    })
    || !sameJson(finalImplementation.reservation, {
      package: "effect-build-rolldown",
      ledgerSource: "npmRegistryBoundary.bootstrap.placeholderLedger",
      targetVersion: "forbidden",
      exactVersions: "reservation-ledger-version-only",
      ledger: reservationLedger,
    })
    || finalPublicVerification.receipt.protocol !== "effect-build/final-public-release-receipt@2"
    || finalPublicVerification.receipt.artifactName !== "effect-build-v0.6.1-final-public-release"
    || finalPublicVerification.receipt.retentionDays !== 90
    || !sameJson(finalPublicVerification.receipt.orderedFiles, ["final-public-release.json"])
    || finalPublicVerification.receipt.terminalVerdict !== "success"
    || finalPublicVerification.receipt.externalArchive !== "operator-controlled-retention-required"
  ) {
    throw new Error("final public verification must remain one ready read-only exact-public-state interface");
  }
  requireUnique(
    releaseCertification.npmOidcCertification.forbiddenEnvironmentNames,
    "release certification forbidden environment names",
  );
  const protectedReadOnlyTransport = releaseCertification.npmOidcCertification.protectedReadOnlyTransport;
  if (!sameJson(protectedReadOnlyTransport, {
    protocol: "effect-build/protected-release-read-only-transport@1",
    githubPolicySource: "releaseCertification.githubAuthority.readOnlyTransport",
    npmRegistryOriginSource: "npmRegistryBoundary.registry",
    oidcRequest: {
      hostPattern: "^(?:pipelines[a-z0-9-]*|run-actions-[0-9]+-[a-z0-9-]+)\\.actions\\.githubusercontent\\.com$",
      pathPattern:
        "^(?:/[A-Za-z0-9_-]{20,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/_apis/distributedtask/hubs/[A-Za-z]+/plans/[A-Za-z0-9_-]{20,}/jobs/[A-Za-z0-9_-]{20,}/idtoken|/[0-9]+//idtoken/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$",
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
  })) {
    throw new Error("protected release reads must remain one sealed Node HTTPS projection");
  }
  const npmEvidence = releaseCertification.npmOidcCertification.evidence;
  requireUnique(Object.values(npmEvidence.protocols), "npm OIDC certification receipt protocols");
  requireUnique(npmEvidence.orderedFiles, "npm OIDC certification receipt files");
  for (const [schema, fields] of Object.entries(npmEvidence.receiptSchemas)) {
    requireUnique(fields, `npm OIDC ${schema} receipt fields`);
  }
  for (const [receipt, claims] of Object.entries(npmEvidence.receiptClaims)) {
    requireUnique(claims.proves, `npm OIDC ${receipt} proves claims`);
    requireUnique(claims.doesNotProve, `npm OIDC ${receipt} does-not-prove claims`);
  }
  requireUnique(npmEvidence.githubOidcClaims.orderedClaimFields, "npm OIDC GitHub claim fields");
  const claimPolicyFields = [
    ...Object.keys(npmEvidence.githubOidcClaims.staticClaims),
    ...Object.keys(npmEvidence.githubOidcClaims.derivedClaimSources),
  ];
  requireUnique(claimPolicyFields, "npm OIDC GitHub claim policy fields");
  requireText(npmEvidence.artifactName, "npm OIDC certification artifact name");
  if (
    npmEvidence.retentionDays !== 30
    || npmEvidence.orderedFiles.length !== 2
    || npmEvidence.orderedFiles.some((file) => !/^[a-z0-9-]+\.json$/u.test(file))
    || npmEvidence.receiptFieldPolicy !== "closed-objects-additional-fields-forbidden"
    || !sameJson([...claimPolicyFields].sort(), [...npmEvidence.githubOidcClaims.orderedClaimFields].sort())
    || npmEvidence.githubOidcClaims.rawJwtRetention !== "forbidden"
    || npmEvidence.githubOidcClaims.claimsDigest
      !== "releaseCertification.githubArtifactDigest-of-canonical-claims-json"
    || npmEvidence.githubOidcClaims.jwtValidation.alg !== "RS256"
    || npmEvidence.githubOidcClaims.jwtValidation.signatureVerified !== true
    || npmEvidence.npmOidcExchangeAccepted.registryState
      !== "before-and-after-releaseCertification.githubArtifactDigest-of-canonical-registry-state-exactly-equal"
    || npmEvidence.bindings.candidate !== "releaseCertification.githubArtifactCoordinate"
    || npmEvidence.bindings.client !== "releaseCertification.npmOidcCertification.client"
    || npmEvidence.bindings.sourceDigests !== "releaseCertification.npmOidcCertification.sourceDigests"
    || npmEvidence.bindings.registryMutation !== false
    || npmEvidence.bindings.digest !== "releaseCertification.githubArtifactDigest"
    || npmEvidence.bindings.observedAt !== "rfc3339"
    || npmEvidence.bindings.markerCount !== 1
  ) {
    throw new Error("npm OIDC certification must retain exactly its two canonical JSON receipts for 30 days");
  }
  requireUnique(
    releaseCertification.npmOidcCertification.sourceDigests.map((entry) => entry.path),
    "release certification npm source paths",
  );
  for (const entry of releaseCertification.npmOidcCertification.sourceDigests) {
    requireText(entry.path, "release certification npm source path");
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new Error(`release certification npm source has a non-canonical SHA-256: ${entry.path}`);
    }
  }
  const fakeRegistry = releaseCertification.fakeRegistry;
  const localQualification = fakeRegistry.localQualification;
  const exactProtectedBodyCertification = fakeRegistry.exactProtectedBodyCertification;
  const exactProtectedBody = fakeRegistry.exactProtectedBody;
  const hypotheticalStateMachine = fakeRegistry.hypotheticalStateMachine;
  requireUnique(localQualification.proves, "local fake-registry qualification claims");
  requireUnique(localQualification.doesNotProve, "local fake-registry qualification exclusions");
  requireUnique(
    exactProtectedBodyCertification.requiredClaims,
    "exact protected-body fake-registry certification claims",
  );
  requireUnique(
    exactProtectedBodyCertification.doesNotProve,
    "exact protected-body fake-registry certification exclusions",
  );
  requireUnique(exactProtectedBodyCertification.orderedFiles, "exact protected-body certification files");
  requireUnique(exactProtectedBodyCertification.receiptFields, "exact protected-body certification receipt fields");
  requireUnique(
    exactProtectedBodyCertification.coordinateFields,
    "exact protected-body certification coordinate fields",
  );
  requireUnique(
    exactProtectedBodyCertification.exactMutationLedger.map(({ coordinate }) => coordinate),
    "exact protected-body certification mutation coordinates",
  );
  requireUnique(
    exactProtectedBodyCertification.certificationPurpose.sharedBodyStages,
    "exact protected-body certification shared stages",
  );
  requireUnique(
    exactProtectedBodyCertification.certificationPurpose.exactEnvironmentFields,
    "exact protected-body certification environment fields",
  );
  requireUnique(
    exactProtectedBodyCertification.certificationPurpose.sourceFiles.map(({ path }) => path),
    "exact protected-body certification source files",
  );
  requireUnique(exactProtectedBody.bodies, "release certification exact protected workflow bodies");
  requireUnique(exactProtectedBody.proves, "release certification exact protected-body claims");
  requireUnique(exactProtectedBody.doesNotProve, "release certification exact protected-body exclusions");
  requireUnique(
    hypotheticalStateMachine.forbiddenRecoveryCommands,
    "release certification hypothetical state-machine forbidden recovery commands",
  );
  requireUnique(hypotheticalStateMachine.proves, "release certification hypothetical state-machine claims");
  requireUnique(
    hypotheticalStateMachine.doesNotProve,
    "release certification hypothetical state-machine exclusions",
  );
  const fakeRegistryReadinessRole = readiness.evidenceRoles.find((entry) => entry.role === "fake-registry");
  if (
    localQualification.protocol !== "effect-build/fake-registry-local-qualification@2"
    || localQualification.workflowPath !== ".github/workflows/release-certification.yml"
    || localQualification.workflow
      !== `${githubAuthority.repository}/${localQualification.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || localQualification.artifactName !== "effect-build-v0.6.1-fake-registry-local-qualification"
    || localQualification.terminal !== "local-qualification"
    || localQualification.retentionDays !== 30
    || localQualification.readinessAdmissible !== false
    || !sameJson(localQualification.proves, [
      "real-purpose-without-readiness-stops-before-first-mutation",
      "sealed-credential-free-exact-purpose-covers-40-state-machine-coordinates",
      "independent-reference-oracle-agrees-with-exact-purpose",
      "npm-oidc-dry-run-body-local-boundaries",
    ])
    || !sameJson(localQualification.doesNotProve, [
      "readiness-admissible-exact-protected-body-certification",
      "readiness-admission",
      "same-candidate-resume-after-readiness-expiry",
      "npm-upload",
      "provenance",
      "publication",
    ])
    || exactProtectedBodyCertification.protocol
      !== "effect-build/fake-registry-exact-protected-body-certification@2"
    || exactProtectedBodyCertification.protocol === localQualification.protocol
    || exactProtectedBodyCertification.workflow !== localQualification.workflow
    || exactProtectedBodyCertification.artifactName
      !== "effect-build-v0.6.1-fake-registry-exact-protected-body-certification"
    || exactProtectedBodyCertification.artifactName === localQualification.artifactName
    || exactProtectedBodyCertification.terminal !== "success"
    || exactProtectedBodyCertification.implementationStatus !== "implemented"
    || exactProtectedBodyCertification.status
      !== expectedReleaseCertification.fakeRegistry.exactProtectedBodyCertification.status
    || exactProtectedBodyCertification.gateSource
      !== "releaseCertification.readiness.githubAuthentication"
    || exactProtectedBodyCertification.artifactDisposition
      !== expectedReleaseCertification.fakeRegistry.exactProtectedBodyCertification.artifactDisposition
    || exactProtectedBodyCertification.readinessAdmission
      !== "requires-same-source-terminal-success-exact-body-artifact"
    || exactProtectedBodyCertification.retentionDays !== 30
    || !sameJson(exactProtectedBodyCertification.orderedFiles, ["fake-registry-exact-protected-body.json"])
    || !sameJson(exactProtectedBodyCertification.receiptFields, [
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
    ])
    || !sameJson(exactProtectedBodyCertification.coordinateFields, [
      "coordinate",
      "status",
      "attemptedFakeMutations",
      "committedFakeMutations",
      "candidateBinding",
      "candidateArtifactDigest",
      "candidateManifestDigest",
    ])
    || exactProtectedBodyCertification.coordinateSource
      !== "releaseCertification.fakeRegistry.hypotheticalStateMachine.cases-exact-expanded-order"
    || !sameJson(
      exactProtectedBodyCertification.exactMutationLedger,
      releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger,
    )
    || !sameJson(exactProtectedBodyCertification.requiredClaims, [
      "exact-protected-reauthorization-and-publisher-bodies-executed-against-stateful-fake-boundaries",
      "all-40-exact-body-case-coordinates-terminal",
      "zero-real-registry-mutation",
    ])
    || !sameJson(exactProtectedBodyCertification.doesNotProve, [
      "same-candidate-resume-after-readiness-expiry",
      "npm-upload",
      "provenance",
      "publication",
    ])
    || !sameJson(
      exactProtectedBodyCertification.certificationPurpose,
      releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification.certificationPurpose,
    )
    || fakeRegistryReadinessRole?.protocol !== exactProtectedBodyCertification.protocol
    || fakeRegistryReadinessRole?.workflow !== exactProtectedBodyCertification.workflow
    || fakeRegistryReadinessRole?.artifactName !== exactProtectedBodyCertification.artifactName
    || fakeRegistryReadinessRole?.terminal !== exactProtectedBodyCertification.terminal
    || !sameJson(exactProtectedBody.bodies, ["protected-reauthorization", "publisher"])
    || exactProtectedBody.realGateSource !== "releaseCertification.readiness"
    || exactProtectedBody.fakeGateSource
      !== "releaseCertification.fakeRegistry.exactProtectedBodyCertification.certificationPurpose"
    || exactProtectedBody.status !== "two-purpose-hard-cut"
    || exactProtectedBody.realExpected !== "require-exact-three-role-readiness-before-first-registry-mutation"
    || exactProtectedBody.fakeExpected !== "execute-exact-40-coordinate-state-machine-with-no-real-boundary"
    || exactProtectedBody.realBlockedMutationCount !== 0
    || !sameJson(exactProtectedBody.proves, [
      "real-purpose-readiness-gate-precedes-first-registry-mutation",
      "exact-fake-purpose-executes-shared-protected-bodies-and-state-machine",
    ])
    || !sameJson(exactProtectedBody.doesNotProve, [
      "npm-upload",
      "provenance",
      "publication",
    ])
    || hypotheticalStateMachine.status !== "reference-oracle-only-not-certification"
    || hypotheticalStateMachine.testSubject !== "independent-oracle-compared-with-exact-protected-body"
    || hypotheticalStateMachine.failureInvariant !== "no-later-mutation"
    || hypotheticalStateMachine.mutationCountAssertion !== "required-exact-per-case"
    || !sameJson(hypotheticalStateMachine.forbiddenRecoveryCommands, [
      "repack",
      "dist-tag",
      "unpublish",
      "external-credential",
    ])
    || !sameJson(hypotheticalStateMachine.proves, [
      "algorithmic-convergence-and-fail-closed-state-transitions-at-fake-boundaries",
    ])
    || !sameJson(hypotheticalStateMachine.doesNotProve, [
      "exact-protected-body-execution",
      "npm-upload",
      "provenance",
      "publication",
    ])
  ) {
    throw new Error("fake-registry evidence must distinguish the exact two-purpose body from its reference oracle");
  }
  const fakeCases = hypotheticalStateMachine.cases;
  requireUnique(fakeCases.map((entry) => entry.id), "release certification fake-registry cases");
  for (const entry of fakeCases) {
    requireText(entry.id, "release certification fake-registry case id");
    requireText(entry.expected, `${entry.id}.expected`);
    if (entry.variants !== undefined) requireUnique(entry.variants, `${entry.id}.variants`);
  }
  const fakeCoordinateCount = fakeCases.reduce(
    (count, entry) => count + (entry.variants === undefined ? 1 : entry.variants.length),
    0,
  );
  if (hypotheticalStateMachine.coordinateCount !== 40 || fakeCoordinateCount !== 40) {
    throw new Error("hypothetical fake-registry state machine must retain exactly 40 coordinates");
  }
  if (!sameJson(
    exactProtectedBodyCertification.exactMutationLedger
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
  ) || exactProtectedBodyCertification.exactMutationLedger.some(({ candidateBinding }) =>
    !["exact-release-candidate", "derived-hostile-candidate"].includes(candidateBinding)
  )) {
    throw new Error("exact fake-registry coordinates must state one canonical candidate-byte binding");
  }
  const apple = releaseCertification.apple;
  if (
    apple.publicCapabilitySource !== "producerCapabilityRegister.capabilities family=apple visibility=public"
    || apple.publicCapabilityCount !== 13
  ) {
    throw new Error("Apple release certification must cover all thirteen public producer capabilities");
  }
  requireUnique(Object.values(apple.protocols), "Apple certification protocol ids");
  requireUnique(apple.hostedExecution.blockerIds, "Apple hosted-execution blocker ids");
  requireUnique(apple.hostedExecution.protectedStageIds, "Apple hosted protected-stage ids");
  requireUnique(
    apple.hostedExecution.activationInterfaces.runners.receiptPins.map(
      ({ category, coordinateArchitecture }) => `${category}|${coordinateArchitecture ?? "none"}`,
    ),
    "Apple hosted runner receipt selectors",
  );
  requireUnique(apple.coordinates, "Apple certification coordinates");
  requireUnique(apple.commonReceiptFields, "Apple certification common receipt fields");
  requireUnique(apple.coordinateRuleFields, "Apple certification coordinate rule fields");
  requireUnique(apple.pairArchitectureOrder, "Apple certification pair architecture order");
  requireUnique(apple.cleanHostForbiddenStateIds, "Apple certification clean-host forbidden-state ids");
  requireUnique(apple.encoding.bundleHeaderFields, "Apple certification bundle header fields");
  requireUnique(apple.encoding.evidenceEntryFields, "Apple certification evidence entry fields");
  requireUnique(apple.encoding.indexFields, "Apple certification index fields");
  for (const [schema, fields] of Object.entries(apple.receiptSchemas)) {
    requireUnique(fields, `Apple certification ${schema} schema fields`);
  }
  const appleToolLineage = apple.operationToolLineage;
  const applePublicOperationIds = contract.producerCapabilityRegister.capabilities
    .filter(({ family, visibility }) => family === "apple" && visibility === "public")
    .map(({ id }) => id);
  if (
    appleToolLineage.order !== "first-executed-distinct-tool"
    || !sameJson(appleToolLineage.componentFields, ["name", "capabilityId"])
    || !sameJson(Object.keys(appleToolLineage.byOperationId), applePublicOperationIds)
    || !sameJson(appleToolLineage, releaseCertificationPolicy.apple.operationToolLineage)
  ) {
    throw new Error("Apple operation tool lineage changed from the exact public-operation canon");
  }
  requireUnique(appleToolLineage.componentFields, "Apple operation tool-lineage component fields");
  for (const [operationId, products] of Object.entries(appleToolLineage.byOperationId)) {
    const productEntries = Object.entries(products);
    if (productEntries.length === 0) throw new Error(`${operationId} has no Apple product tool lineage`);
    for (const [product, components] of productEntries) {
      if (!["app", "dmg", "pkg"].includes(product) || !Array.isArray(components) || components.length === 0) {
        throw new Error(`${operationId}/${product} has no exact Apple tool lineage`);
      }
      requireUnique(components.map(({ name }) => name), `${operationId}/${product} Apple tool names`);
      for (const component of components) {
        if (!sameJson(Object.keys(component), appleToolLineage.componentFields)) {
          throw new Error(`${operationId}/${product} Apple tool-lineage component shape changed`);
        }
        requireText(component.name, `${operationId}/${product} Apple tool name`);
        requireText(component.capabilityId, `${operationId}/${product} Apple capability id`);
      }
    }
  }
  for (const [category, paths] of Object.entries(apple.receiptSchemaRules.operationFactPaths)) {
    requireUnique(paths, `Apple certification ${category} operation fact paths`);
  }
  if (
    apple.hostedExecution.protocol !== "effect-build/apple-hosted-execution@1"
    || apple.hostedExecution.status !== "blocked"
    || !sameJson(apple.hostedExecution.blockerIds, [
      "released-qualified-ts-release-journal-and-pinned-reusable-workflow",
      "exact-aws-account-bucket-region-role-prefix-and-oidc-job-workflow-ref",
      "frozen-apple-credential-layer-and-secret-name-inventory",
      "bundled-producer-and-clean-host-executor-identities",
      "qualified-arm64-x64-native-and-clean-host-runner-interfaces",
    ])
    || apple.hostedExecution.artifactDisposition !== "forbidden-while-blocked"
    || !sameJson(apple.hostedExecution.protectedStageIds, ["sign-app", "submit-product", "continue-notary"])
    || !sameJson(
      apple.hostedExecution.activationInterfaces,
      releaseCertificationPolicy.apple.hostedExecution.activationInterfaces,
    )
    || apple.coordinates.length !== 28
    || apple.counts.total !== 28
    || apple.counts.N !== 2
    || apple.counts.P !== 10
    || apple.counts.G !== 6
    || apple.counts.A !== 10
    || apple.counts.total !== apple.counts.N + apple.counts.P + apple.counts.G + apple.counts.A
  ) {
    throw new Error("Apple certification must contain exactly N=2, P=10, G=6, A=10 coordinates");
  }
  if (
    !apple.commonReceiptFields.includes("producerDigest")
    || !apple.commonReceiptFields.includes("verifierDigest")
    || !apple.commonReceiptFields.includes("observedAt")
    || apple.encoding.digest !== "releaseCertification.githubArtifactDigest"
    || apple.encoding.bundleFraming !== "protocol-line-u32be-canonical-header-u64be-opaque-payload"
    || apple.encoding.terminalVerdict !== "success"
    || !sameJson(apple.pairArchitectureOrder, ["macos-aarch64", "macos-x64"])
    || apple.nativeOperationSource !== apple.operationCoverage.nativeSource
    || !sameJson(apple.nativeOperationIds, ["CAN-BUN-012", "CAN-DENO-010"])
    || apple.providerVersionSource !== "exactToolEvidenceRegister.tools kind=provider name in bun,deno"
    || apple.providerVersions.bun !== "1.3.14"
    || apple.providerVersions.deno !== "2.9.5"
    || apple.workflow
      !== `${githubAuthority.repository}/${apple.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || apple.notaryJournal.protocol !== apple.notaryJournal.submissionCodec
    || apple.receiptSchemaRules.closedObjects !== "all-receipt-schema-objects-reject-unknown-fields"
  ) {
    throw new Error("Apple certification receipt encoding and producer/verifier identities changed");
  }
  requireUnique(apple.categories.map((entry) => entry.id), "Apple certification receipt categories");
  for (const category of apple.categories) {
    requireText(category.coordinatePrefix, `${category.id}.coordinatePrefix`);
    requireUnique(category.requiredFields, `${category.id}.requiredFields`);
    requireUnique(category.forbiddenFields, `${category.id}.forbiddenFields`);
    if (category.requiredFields.some((field) => category.forbiddenFields.includes(field))) {
      throw new Error(`${category.id} requires and forbids the same field`);
    }
  }
  if (apple.categories.reduce((count, entry) => count + entry.count, 0) !== apple.coordinates.length) {
    throw new Error("Apple certification receipt categories must partition all coordinates");
  }
  for (const coordinate of apple.coordinates) {
    const categories = apple.categories.filter((category) => coordinate.startsWith(category.coordinatePrefix));
    if (categories.length !== 1) {
      throw new Error(`Apple certification coordinate must match exactly one receipt category: ${coordinate}`);
    }
  }
  requireUnique(apple.verdicts.map((entry) => entry.coordinate), "Apple certification verdict coordinates");
  if (!sameJson(apple.verdicts.map((entry) => entry.coordinate), apple.coordinates.filter((entry) => /^A\d$/u.test(entry)))) {
    throw new Error("Apple certification verdict dependencies must cover exact A0-A9 order");
  }
  const coordinateSet = new Set(apple.coordinates);
  for (const verdict of apple.verdicts) {
    requireUnique(verdict.dependencies, `${verdict.coordinate}.dependencies`);
    requireUnique(verdict.claims, `${verdict.coordinate}.claims`);
    if (verdict.coordinate !== "A0" && verdict.dependencies.some((entry) => !coordinateSet.has(entry))) {
      throw new Error(`${verdict.coordinate} has a dependency outside the Apple coordinate policy`);
    }
    if (verdict.subordinateEvidence !== undefined) {
      requireUnique(verdict.subordinateEvidence, `${verdict.coordinate}.subordinateEvidence`);
    }
  }
  if (
    apple.coordinateRules.length !== apple.coordinates.length
    || !sameJson(apple.coordinateRules.map(({ coordinate }) => coordinate), apple.coordinates)
  ) {
    throw new Error("Apple certification coordinate rules must cover the exact coordinate order");
  }
  const providerOperationIds = new Set(contract.providerOperationRegister.operations.map(({ operationId }) => operationId));
  const producerOperationIds = new Set(contract.producerCapabilityRegister.capabilities.map(({ id }) => id));
  for (const rule of apple.coordinateRules) {
    if (!sameJson(Object.keys(rule), apple.coordinateRuleFields)) {
      throw new Error(`Apple certification coordinate rule has a noncanonical shape: ${rule.coordinate}`);
    }
    if (!coordinateSet.has(rule.coordinate)) {
      throw new Error(`Apple certification coordinate rule is outside the coordinate policy: ${rule.coordinate}`);
    }
    requireUnique(rule.dependencies, `${rule.coordinate}.coordinateRule.dependencies`);
    requireUnique(rule.operationIds, `${rule.coordinate}.coordinateRule.operationIds`);
    const expectedCategory = appleCategory(apple, rule.coordinate);
    const expectedFieldKeys = expectedCategory === "P-notarized-product"
      ? apple.coordinateFieldValuePolicy.notarized
      : expectedCategory === "G-clean-host"
      ? apple.coordinateFieldValuePolicy.cleanHost
      : expectedCategory === "A-verdict"
      ? apple.coordinateFieldValuePolicy.verdict
      : apple.coordinateFieldValuePolicy.other;
    if (
      rule.category !== expectedCategory
      || !sameJson(Object.keys(rule.fieldValues), expectedFieldKeys)
      || !sameJson(rule.dependencies, expectedCategory === "A-verdict" ? rule.fieldValues.orderedDependencies : rule.dependencies)
      || rule.operationIds.some((id) =>
        expectedCategory === "N-native" ? !providerOperationIds.has(id) : !producerOperationIds.has(id)
      )
    ) {
      throw new Error(`Apple certification coordinate correlation changed: ${rule.coordinate}`);
    }
  }
  const a7SubordinateEvidence = apple.verdicts.find(({ coordinate }) => coordinate === "A7")?.subordinateEvidence;
  if (
    a7SubordinateEvidence === undefined
    || !sameJson(apple.evidenceDescriptorOrder, [...apple.coordinates, ...a7SubordinateEvidence])
    || new Set(apple.evidenceDescriptorOrder).size !== apple.evidenceDescriptorOrder.length
    || !sameJson(
      apple.evidenceFileOrder,
      apple.evidenceDescriptorOrder.map((id) => ({ id, file: appleEvidenceFileName(id) })),
    )
    || new Set(apple.evidenceFileOrder.map(({ file }) => file.toLowerCase())).size
      !== apple.evidenceFileOrder.length
  ) {
    throw new Error("Apple certification evidence descriptors must bind 28 primary receipts plus exact A7 evidence");
  }
  validateOwners(contract);
  return contract;
};

export const validateContract = (contract, inputs) => validateContractModel(contract, inputs);

export const validateImplementationCoordinates = async (contract, repositoryRoot) => {
  const requireSource = async (path, label) => {
    try {
      return await readFile(resolve(repositoryRoot, path), "utf8");
    } catch (cause) {
      throw new Error(`${label} implementation source is missing: ${path}`, { cause });
    }
  };
  const requireExport = (source, name, label, path) => {
    if (!exportedDeclaration(source, name)) {
      throw new Error(`${label} implementation export ${name} is missing from ${path}`);
    }
  };

  for (const operation of contract.providerOperationRegister.operations) {
    if (operation.implementation === null) continue;
    const { export: exportName, path } = operation.implementation;
    const source = await requireSource(path, operation.operationId);
    requireExport(source, exportName, operation.operationId, path);
  }
  for (const capability of contract.producerCapabilityRegister.capabilities) {
    const path = `packages/${capability.package}/src/${capability.module}.ts`;
    const source = await requireSource(path, capability.id);
    for (const exportName of capability.exports) requireExport(source, exportName, capability.id, path);
  }
  for (const capability of contract.coreCapabilityRegister.capabilities) {
    const path = `packages/effect-build/src/${capability.module}.ts`;
    await requireSource(path, capability.id);
  }
  for (const capability of contract.privateImplementationRegister.capabilities) {
    const source = await requireSource(capability.path, capability.id);
    for (const exportName of capability.exports) requireExport(source, exportName, capability.id, capability.path);
  }
  return contract;
};

const normalizeExpectedPackage = (surface) => ({
  rootNamespaces: sorted(surface.rootNamespaces),
  subpaths: sorted(Object.keys(surface.subpaths)),
});

export const validatePublicApiProjection = (contract, publicApi) => {
  if (publicApi.schema !== "effect-build/public-surface@3") throw new Error("unexpected public API schema");
  const expectedPackages = contract.publicApiProjection.packages;
  if (!sameJson(sorted(Object.keys(publicApi.packages)), sorted(Object.keys(expectedPackages)))) {
    throw new Error("tooling/public-api.json package set is not the combined-contract projection");
  }
  for (const [packageName, expected] of Object.entries(expectedPackages)) {
    const actual = publicApi.packages[packageName];
    if (actual === undefined) throw new Error(`public API is missing ${packageName}`);
    const expectedTopology = normalizeExpectedPackage(expected);
    const actualTopology = {
      rootNamespaces: sorted(actual.namespaces),
      subpaths: sorted(Object.keys(actual.subpaths)),
    };
    if (!sameJson(actualTopology, expectedTopology)) {
      throw new Error(`${packageName} public topology is not the combined-contract projection`);
    }
    for (const [subpath, subpathSurface] of Object.entries(expected.subpaths)) {
      if (Array.isArray(subpathSurface)) continue;
      const actualSubpath = actual.subpaths[subpath];
      const expectedRuntime = sorted([...subpathSurface.operationNamespaces, ...subpathSurface.supportExports.runtime]);
      const expectedDeclarations = sorted([
        ...subpathSurface.operationNamespaces,
        ...subpathSurface.supportExports.declarations,
      ]);
      if (!sameJson(sorted(actualSubpath.runtime), expectedRuntime)) {
        throw new Error(`${packageName}${subpath} runtime exports are not the admitted operation projection`);
      }
      if (!sameJson(sorted(actualSubpath.declarations), expectedDeclarations)) {
        throw new Error(`${packageName}${subpath} declaration exports are not the admitted operation projection`);
      }
    }
  }
  return publicApi;
};

export const renderJson = (contract) => `${JSON.stringify(contract, null, 2)}\n`;
export { contractPath };

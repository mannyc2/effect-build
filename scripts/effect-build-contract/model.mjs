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
  operationInputContracts,
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
  const paths = [
    operationRegisterPath,
    nonOperationRegisterPath,
    adjudicationPath,
    policyPath,
    modelPath,
    packageManifestPath,
    lockfilePath,
    zipProtocolPath,
    tarProtocolPath,
    terminalReferenceBuilderPath,
    sigstoreNetworkGuardPath,
    sigstoreTrustedRootPath,
    ...sigstoreTufEvidencePaths,
    ...releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification.certificationPurpose.sourcePaths,
  ];
  const sources = await Promise.all(paths.map(async (path) => ({ path, source: await read(path) })));
  const byPath = new Map(sources.map(({ path, source }) => [path, source]));
  return {
    operationRows: parseCsv(byPath.get(operationRegisterPath)),
    nonOperationRows: parseCsv(byPath.get(nonOperationRegisterPath)),
    adjudication: JSON.parse(byPath.get(adjudicationPath)),
    packageManifest: JSON.parse(byPath.get(packageManifestPath)),
    lockfileSource: byPath.get(lockfilePath),
    publicApi: JSON.parse(await read(publicApiPath)),
    sigstoreNetworkGuardSource: byPath.get(sigstoreNetworkGuardPath),
    sigstoreTufEvidenceSources: new Map(sigstoreTufEvidencePaths.map((path) => [path, byPath.get(path)])),
    sigstoreTrustedRootSource: byPath.get(sigstoreTrustedRootPath),
    sources,
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
    ...(operationInputContracts[row.operation_id] === undefined
      ? {}
      : { inputContract: operationInputContracts[row.operation_id] }),
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
  sources,
) => {
  const sourceByPath = new Map(sources.map(({ path, source }) => [path, source]));
  const terminalReferenceBuilderSource = sourceByPath.get(terminalReferenceBuilderPath);
  const { sourcePaths, ...certificationPurpose } = structuredClone(
    releaseCertificationPolicy.fakeRegistry.exactProtectedBodyCertification.certificationPurpose,
  );
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
      certificationPurpose: {
        ...certificationPurpose,
        sourceFiles: sourcePaths.map((path) => ({ path, sha256: sha256(sourceByPath.get(path)) })),
      },
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
      inputs.sources,
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

export const validateContract = (contract, inputs) => {
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
  if (contract.providerOperationRegister.count !== 67) {
    throw new Error("provider operation register must contain 67 rows");
  }
  if (contract.nonOperationRegister.count !== 46) throw new Error("non-operation register must contain 46 rows");
  if (!sameJson(contract.providerOperationRegister.dispositionCounts, expectedDispositionCounts)) {
    throw new Error(
      `unexpected provider disposition counts: ${JSON.stringify(contract.providerOperationRegister.dispositionCounts)}`,
    );
  }
  if (!sameJson(contract.nonOperationRegister.dispositionCounts, expectedNonOperationDispositionCounts)) {
    throw new Error(
      `unexpected non-operation disposition counts: ${JSON.stringify(contract.nonOperationRegister.dispositionCounts)}`,
    );
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
    if (!adjudicatedIds.has(operation.operationId)) {
      throw new Error(`operation lacks surface adjudication: ${operation.operationId}`);
    }
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
  if (
    !sameJson(
      rolldown.filter((operation) => operation.disposition === "rejected").map((operation) => operation.operationId),
      rolldownRejectedOperationIds,
    )
  ) throw new Error("Rolldown rejection set changed");
  if (!sameJson(contract.publicApiProjection.privatePackages, ["effect-build-rolldown"])) {
    throw new Error("Rolldown package must remain private");
  }
  const producers = contract.producerCapabilityRegister.capabilities;
  requireUnique(producers.map((entry) => entry.id), "producer capability ids");
  if (producers.length !== 19) throw new Error("producer register must contain 19 canonical capabilities");
  if (
    !sameJson(sorted(new Set(producers.map((entry) => entry.family))), contract.producerCapabilityRegister.families)
  ) {
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
  if (
    !sameJson(
      sorted(npm.bootstrap.placeholderLedger.map((entry) => entry.name)),
      sorted(npm.bootstrap.placeholderAtHandoffPackages),
    )
  ) {
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
    throw new Error("npm release target or prepublication dist-tag ledger changed");
  }
  const expectedDistTags = npm.publicationAdmission.target.expectedDistTagsBeforePublication;
  requireUnique(expectedDistTags.map((entry) => entry.name), "npm expected prepublication dist-tag package names");
  if (
    !sameJson(sorted(expectedDistTags.map((entry) => entry.name)), admittedPackages)
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      npm.publicationAdmission.target.version,
    )
    || expectedDistTags.some((entry) =>
      !sameJson(Object.keys(entry.tags), entry.name === "effect-build" ? ["latest"] : ["latest", "reserved"])
      || Object.values(entry.tags).some((version) =>
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(version)
      )
    )
  ) {
    throw new Error(
      "npm prepublication dist-tag ledger must cover the exact admitted package set",
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
  const expectedReleaseCertification = buildReleaseCertification(
    contract.publicApiProjection,
    contract.npmRegistryBoundary,
    contract.providerOperationRegister.operations,
    contract.producerCapabilityRegister.capabilities,
    contract.exactToolEvidenceRegister.tools,
    inputs.sources,
  );
  // Policy is declared once. Below this equality check, validate relationships and
  // external evidence rather than repeating the policy's literal values.
  if (!sameJson(releaseCertification, expectedReleaseCertification)) {
    throw new Error("release certification policy does not match the canonical generated policy");
  }
  if (releaseCertification.scope.target !== `v${npm.publicationAdmission.target.version}`) {
    throw new Error("release scope must target the admitted npm version");
  }
  const publicAdmission = releaseCertification.publicAdmission;
  const npmAdministrativeInventory = releaseCertification.npmAdministrativeInventory;
  if (
    publicAdmission.packageCount !== admittedPackages.length
    || publicAdmission.reservationCount !== reservedOnlyPackages.length
  ) {
    throw new Error("release certification admission must remain a count-only projection of the public surface");
  }

  requireUnique(npmAdministrativeInventory.doesNotProve, "npm administrative inventory exclusions");

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
  requireUnique(
    readOnlyTransport.releaseAssetRedirectHostPolicy.directStatuses,
    "GitHub Release asset direct statuses",
  );
  requireUnique(
    readOnlyTransport.releaseAssetRedirectHostPolicy.redirectStatuses,
    "GitHub Release asset redirect statuses",
  );
  if (
    githubAuthority.repository !== npm.trustedPublisher.repository
    || githubAuthority.repositoryOwner !== expectedRepositoryOwner
    || githubAuthority.workflow !== npm.trustedPublisher.workflow
    || githubAuthority.environment !== npm.trustedPublisher.environment
    || githubAuthority.expectedEnvironmentSubject
      !== `${githubAuthority.oidcSubjectPolicy.sub_claim_prefix}:environment:${npm.trustedPublisher.environment}`
    || !/^[1-9][0-9]*$/u.test(githubAuthority.repositoryId)
    || !/^[1-9][0-9]*$/u.test(githubAuthority.repositoryOwnerId)
    || !Number.isSafeInteger(githubAuthority.reviewer.id)
    || githubAuthority.reviewer.id <= 0
    || typeof githubAuthority.reviewer.login !== "string"
    || githubAuthority.reviewer.login.length === 0
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

  const readiness = releaseCertification.readiness;
  requireUnique(readiness.zipExtraction.allowedCompressionMethods, "release readiness ZIP methods");

  const zipProjection = readiness.zipExtraction.protectedProjection;
  const zipProvenance = contract.provenance.sources.find(({ path }) => path === zipProjection.sourcePath);
  const zipInput = inputs?.sources?.find(({ path }) => path === zipProjection.sourcePath);
  if (
    zipProvenance?.sha256 !== zipProjection.sourceDigest.slice("sha256:".length)
    || (zipInput !== undefined && Buffer.byteLength(zipInput.source) !== zipProjection.sourceBytes)
  ) throw new Error("protected ZIP projection does not match its exact source bytes");
  const tarballInspection = releaseCertification.candidate.tarballInspection;

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
    !sameJson(readiness.orderedFiles, [readiness.manifest, readiness.evidenceBundle])
    || releaseCertification.candidate.workflow
      !== `${githubAuthority.repository}/${releaseCertification.candidate.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || readiness.workflow
      !== `${githubAuthority.repository}/${readiness.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || !sameJson(readinessShapeNames, referencedShapeNames)
    || readiness.evidenceRoles.some((entry) =>
      !/^effect-build\/[a-z0-9-]+@\d+$/u.test(entry.protocol)
      || typeof entry.terminal !== "string"
      || entry.terminal.length === 0
      || !["githubRun", "githubArtifact"].includes(entry.type)
      || entry.workflow
        !== `${githubAuthority.repository}/${entry.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
      || (entry.type === "githubArtifact"
        && (typeof entry.artifactName !== "string" || entry.artifactName.length === 0))
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
  for (
    const [name, fields] of Object.entries({
      fields: directObservation.fields,
      githubFields: directObservation.githubFields,
      environmentFields: directObservation.environmentFields,
      reviewerFields: directObservation.reviewerFields,
      branchPolicyFields: directObservation.branchPolicyFields,
      npmFields: directObservation.npmFields,
      npmPackageFields: directObservation.npmPackageFields,
      repositoryFields: directObservation.repositoryFields,
      placeholderFields: directObservation.placeholderFields,
    })
  ) requireUnique(fields, `release readiness direct-observation ${name}`);
  requireUnique(directObservation.githubEndpoints, "release readiness direct GitHub endpoints");
  requireUnique(directObservation.npmChecks, "release readiness direct npm checks");
  if (
    !sameJson(dispatchRoleInputs.map(({ role }) => role), readiness.evidenceRoles.map(({ role }) => role))
    || dispatchRoleInputs.some(({ input }) => !/^[a-z][a-z0-9_]*_json$/u.test(input))
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
  const evidenceBytes = (descriptor, label) =>
    canonicalBase64Evidence(
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
    inputs.packageManifest.devDependencies?.[provenanceVerification.client.package]
      !== provenanceVerification.client.version
    || inputs.packageManifest.devDependencies?.[provenanceVerification.bundleClient.package]
      !== provenanceVerification.bundleClient.version
    || inputs.packageManifest.devDependencies?.[provenanceVerification.protobufClient.package]
      !== provenanceVerification.protobufClient.version
    || Buffer.byteLength(inputs.sigstoreNetworkGuardSource) !== provenanceVerification.networkGuard.bytes
    || `sha256:${sha256(inputs.sigstoreNetworkGuardSource)}` !== provenanceVerification.networkGuard.digest
    || acquisition.clients.some((entry) =>
      inputs.packageManifest.devDependencies?.[entry.package] !== entry.version || !lockContainsClient(entry)
    )
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
    || trustedRoot.bytes !== trustedRoot.tuf.targetLength
    || trustedRoot.digest !== trustedRoot.tuf.targetSha256
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
  if (
    finalPublicVerification.workflow
      !== `${githubAuthority.repository}/${finalPublicVerification.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || finalPublicVerification.status !== expectedReleaseCertification.finalPublicVerification.status
    || finalPublicVerification.artifactDisposition
      !== expectedReleaseCertification.finalPublicVerification.artifactDisposition
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
  ) {
    throw new Error("final public verification must remain one ready read-only exact-public-state interface");
  }
  requireUnique(
    releaseCertification.npmOidcCertification.forbiddenEnvironmentNames,
    "release certification forbidden environment names",
  );

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
    npmEvidence.orderedFiles.some((file) => !/^[a-z0-9-]+\.json$/u.test(file))
    || !sameJson([...claimPolicyFields].sort(), [...npmEvidence.githubOidcClaims.orderedClaimFields].sort())
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
    localQualification.workflow
      !== `${githubAuthority.repository}/${localQualification.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || exactProtectedBodyCertification.protocol === localQualification.protocol
    || exactProtectedBodyCertification.workflow !== localQualification.workflow
    || exactProtectedBodyCertification.artifactName === localQualification.artifactName
    || exactProtectedBodyCertification.status
      !== expectedReleaseCertification.fakeRegistry.exactProtectedBodyCertification.status
    || exactProtectedBodyCertification.artifactDisposition
      !== expectedReleaseCertification.fakeRegistry.exactProtectedBodyCertification.artifactDisposition
    || fakeRegistryReadinessRole?.protocol !== exactProtectedBodyCertification.protocol
    || fakeRegistryReadinessRole?.workflow !== exactProtectedBodyCertification.workflow
    || fakeRegistryReadinessRole?.artifactName !== exactProtectedBodyCertification.artifactName
    || fakeRegistryReadinessRole?.terminal !== exactProtectedBodyCertification.terminal
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
  if (fakeCoordinateCount !== hypotheticalStateMachine.coordinateCount) {
    throw new Error("fake-registry coordinate count must match its expanded cases");
  }
  if (
    !sameJson(
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
    )
  ) {
    throw new Error("exact fake-registry coordinates must state one canonical candidate-byte binding");
  }
  const apple = releaseCertification.apple;

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
    !sameJson(Object.keys(appleToolLineage.byOperationId), applePublicOperationIds)
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
    Object.entries(apple.counts).some(([category, count]) =>
      count !== (category === "total"
        ? apple.coordinates.length
        : apple.coordinates.filter((coordinate) => coordinate.startsWith(category)).length)
    )
  ) {
    throw new Error("Apple certification counts must match its coordinates");
  }
  if (
    !apple.commonReceiptFields.includes("producerDigest")
    || !apple.commonReceiptFields.includes("verifierDigest")
    || !apple.commonReceiptFields.includes("observedAt")
    || apple.nativeOperationSource !== apple.operationCoverage.nativeSource
    || apple.workflow
      !== `${githubAuthority.repository}/${apple.workflowPath}@refs/heads/${githubAuthority.branchPolicy.name}`
    || apple.notaryJournal.protocol !== apple.notaryJournal.submissionCodec
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
  if (
    !sameJson(
      apple.verdicts.map((entry) => entry.coordinate),
      apple.coordinates.filter((entry) => /^A\d$/u.test(entry)),
    )
  ) {
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
  const providerOperationIds = new Set(
    contract.providerOperationRegister.operations.map(({ operationId }) => operationId),
  );
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
      || !sameJson(
        rule.dependencies,
        expectedCategory === "A-verdict" ? rule.fieldValues.orderedDependencies : rule.dependencies,
      )
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

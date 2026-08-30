import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  rolldownRejectedOperationIds,
  supersededOperationIds,
} from "./policy.mjs";

const policyPath = "scripts/effect-build-contract/policy.mjs";
const modelPath = "scripts/effect-build-contract/model.mjs";
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
  const [operationSource, nonOperationSource, adjudicationSource, policySource, modelSource, publicApiSource] =
    await Promise.all([
      read(operationRegisterPath),
      read(nonOperationRegisterPath),
      read(adjudicationPath),
      read(policyPath),
      read(modelPath),
      read(publicApiPath),
    ]);
  return {
    operationRows: parseCsv(operationSource),
    nonOperationRows: parseCsv(nonOperationSource),
    adjudication: JSON.parse(adjudicationSource),
    publicApi: JSON.parse(publicApiSource),
    sources: [
      { path: operationRegisterPath, source: operationSource },
      { path: nonOperationRegisterPath, source: nonOperationSource },
      { path: adjudicationPath, source: adjudicationSource },
      { path: policyPath, source: policySource },
      { path: modelPath, source: modelSource },
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

export const buildContract = (inputs) => {
  const operations = inputs.operationRows.map(buildOperation);
  const nonOperations = inputs.nonOperationRows.map(buildNonOperation);
  const publicApiProjection = buildPublicSurfaceProjection(operations);
  const admittedPackages = Object.keys(publicApiProjection.packages).sort();
  const reservedOnlyPackages = [...publicApiProjection.privatePackages].sort();
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
    npmRegistryBoundary: {
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
    },
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
  requireUnique(expectedLatest.map((entry) => entry.name), "npm expected prior-latest package names");
  if (
    !sameJson(sorted(expectedLatest.map((entry) => entry.name)), admittedPackages)
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      npm.publicationAdmission.target.version,
    )
    || expectedLatest.some((entry) =>
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(entry.version)
    )
  ) {
    throw new Error("npm prior-latest ledger must cover the exact admitted package set with semantic versions");
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

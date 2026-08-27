import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const contractPath = "tooling/research-complete-contract.json";
export const policyPath = "tooling/research-complete-policy.json";
export const r1Path = "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv";
export const nonOperationPath = "research/post-0.3/reconciliation/r1/NON-OPERATION-REGISTER.csv";
export const adjudicationPath = "research/post-0.3/freeze/SURFACE-ADJUDICATION.json";
export const publicApiPath = "tooling/public-api.json";

const expectedDispositionCounts = {
  mandatory: 5,
  "positive-proof-gated": 22,
  "conditional-gate": 27,
  rejected: 11,
  "superseded-direct-sea": 2,
};

const exactCertificationHosts = [
  "linux-x64",
  "linux-arm64",
  "macos-arm64",
  "macos-x64",
  "windows-x64",
];
const exactCertificationHostDefinitions = [
  { id: "linux-x64", runner: "ubuntu-24.04", systemTarget: "linux-x64-gnu" },
  { id: "linux-arm64", runner: "ubuntu-24.04-arm", systemTarget: "linux-aarch64-gnu" },
  { id: "macos-arm64", runner: "macos-15", systemTarget: "macos-aarch64" },
  { id: "macos-x64", runner: "macos-15-intel", systemTarget: "macos-x64" },
  { id: "windows-x64", runner: "windows-2025", systemTarget: "windows-x64" },
];
const exactTargetExecutionHosts = [
  { target: "macos-x64", runner: "macos-15-intel" },
  { target: "macos-aarch64", runner: "macos-15" },
  { target: "linux-x64-gnu", runner: "ubuntu-24.04" },
  { target: "linux-aarch64-gnu", runner: "ubuntu-24.04-arm" },
  { target: "windows-x64", runner: "windows-2025" },
  { target: "windows-aarch64", runner: "windows-11-arm" },
];
const exactCompilerTargetCoordinates = [
  { compiler: "bun", target: "macos-x64" },
  { compiler: "bun", target: "macos-aarch64" },
  { compiler: "bun", target: "linux-x64-gnu" },
  { compiler: "bun", target: "linux-x64-musl" },
  { compiler: "bun", target: "linux-aarch64-gnu" },
  { compiler: "bun", target: "windows-x64" },
  { compiler: "deno", target: "macos-x64" },
  { compiler: "deno", target: "macos-aarch64" },
  { compiler: "deno", target: "linux-x64-gnu" },
  { compiler: "deno", target: "linux-aarch64-gnu" },
  { compiler: "deno", target: "windows-x64" },
  { compiler: "deno", target: "windows-aarch64" },
];
const exactDirectoryGenerationSha256 = "d2b32f79b916f30ed2a98713382b3f68f7a2a59fe786db8d048aa78559abaff7";

const exactSupplementalCategories = ["core", "profiles", "apple", "release"];
const exactSupplementalIds = {
  core: [
    "CORE-ARTIFACT",
    "CORE-SYSTEM-TARGET",
    "CORE-MATRIX",
    "CORE-AUTHOR-TOOL",
    "CORE-AUTHOR-BORROWED-OUTPUT",
    "CORE-AUTHOR-EXECUTABLE",
    "CORE-COMPATIBILITY-HYBRID",
    "CORE-API-COMMAND-BOUNDARY",
    "CORE-LIFECYCLE",
    "CORE-DURABLE-FILE",
    "CORE-DIRECTORY-GENERATION",
  ],
  profiles: [
    "PROFILE-NODE-SEALED-MAIN",
    "PROFILE-BROWSER-MODULE-PAYLOAD",
    "PROFILE-INCREMENTAL-NODE-MAIN",
    "PROFILE-TYPED-WATCH-PROTOCOL",
  ],
  apple: [
    "APPLE-ARTIFACT",
    "APPLE-CODE-SIGN",
    "APPLE-APP-BUNDLE",
    "APPLE-ZIP",
    "APPLE-DISK-IMAGE",
    "APPLE-INSTALLER-PACKAGE",
    "APPLE-NOTARY",
    "APPLE-STAPLE",
    "APPLE-ASSESS",
  ],
  release: [
    "RELEASE-LOCKSTEP",
    "RELEASE-FIVE-HOSTS",
    "RELEASE-RECEIPT-ARCHIVE",
    "RELEASE-AUTHORITY-SEPARATION",
    "RELEASE-SECURITY",
    "RELEASE-APPLE-CERTIFICATION",
  ],
};
const exactProviderPackages = [
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
  "effect-build-rolldown",
];
const exactFirstPartyPackages = [
  "effect-build",
  "effect-build-apple",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];
const exactConditionalPackageCandidates = ["effect-build-rolldown"];
const exactAuthorModules = ["Author/Tool", "Author/BorrowedOutput", "Author/Executable"];
const exactSeparateAuthorities = [
  "implementation",
  "test",
  "certification",
  "merge",
  "release-approval",
  "publication",
  "post-release-verification",
];
const exactReleaseCandidateIdentity = {
  sourceRepository: "https://github.com/mannyc2/effect-build",
  sourceRef: "refs/heads/main",
  workflowRepository: "mannyc2/effect-build",
  workflowPath: ".github/workflows/candidate.yml",
  workflowRef: "refs/heads/main",
  workflowEvent: "push",
  descriptorArtifactName: "effect-build-release-candidate-descriptor",
  descriptorFileName: "release-candidate.json",
  payloadArtifactName: "effect-build-release-candidate-payload",
  maximumAgeSeconds: 86_400,
  requiredDescriptorFields: [
    "schema",
    "version",
    "sourceRepository",
    "sourceRef",
    "sourceSha",
    "workflowRepository",
    "workflowPath",
    "workflowRef",
    "workflowRunId",
    "workflowRunAttempt",
    "workflowRunHeadSha",
    "checkedOutSourceSha",
    "payloadArtifactId",
    "payloadArtifactName",
    "payloadArtifactDigest",
    "createdAt",
    "expiresAt",
    "packages",
    "publicNodeSeaEvidence",
  ],
};
const exactReleaseCandidatePackageRecordFields = [
  "name",
  "version",
  "filename",
  "dependencyPrerequisites",
  "bytes",
  "sha256",
  "sha1",
  "sha512SRI",
  "packedName",
  "packedVersion",
];
const exactReleaseCandidatePublicNodeSeaEvidenceFields = [
  "protocol",
  "packageName",
  "packageSha256",
  "corePackageSha256",
  "nodeVersion",
  "target",
  "nodeArchiveName",
  "nodeArchiveSha256",
  "nodeExecutableBytes",
  "nodeExecutableSha256",
  "assembledExecutableBytes",
  "assembledExecutableSha256",
  "executionExitCode",
  "executionStdoutSha256",
];
const exactNodeUnsupportedTargets = [{
  target: "macos-x64",
  assemblerCell: "node@26.7.0",
  mechanism: "direct-node-build-sea",
  disposition: "rejected",
  adjudicatedAt: "2026-08-26",
  platformSupportObservation: "node-26.7.0-macos-x64-not-currently-supported",
  observedFailure: "process-terminated-by-signal-SIGSEGV",
  reason: "node-26.7.0-direct-sea-macos-x64-upstream-unsupported-and-sigsegv",
  evidence: [
    "https://nodejs.org/api/single-executable-applications.html#platform-support",
    "https://github.com/nodejs/node/issues/65479",
    "https://github.com/mannyc2/effect-build/actions/runs/32925986358/job/98055230349",
  ],
}];
// Freeze the complete policy-owned Apple schema without duplicating its runtime constants here.
const exactAppleCertificationAuthoritySha256 = "42dc8e394a13c3a59208b68a7f6a9927eeeea2e600a74509f1e911335bd9420c";

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
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/u, ""));
    records.push(record);
  }
  const [headers, ...rows] = records;
  if (headers === undefined) throw new Error("CSV has no header row");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const splitRefs = (value) => value === "" ? [] : value.split(";").filter((entry) => entry.length > 0);
const unique = (values, label) => {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
};
const sorted = (values) => [...values].sort();
const sameSet = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const cartesianCount = (axes) => Object.values(axes).reduce((count, axis) => count * axis.length, 1);
const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
};

const authorityPathFromRef = (reference) => {
  const match = /^(.*\.(?:md|json|csv))(?::.*)?$/u.exec(reference);
  return match?.[1] ?? null;
};

export const readInputs = async (repositoryRoot) => {
  const read = async (path) => await readFile(resolve(repositoryRoot, path), "utf8");
  const [r1Source, nonOperationSource, adjudicationSource, policySource, publicApiSource] = await Promise.all([
    read(r1Path),
    read(nonOperationPath),
    read(adjudicationPath),
    read(policyPath),
    read(publicApiPath),
  ]);
  const policy = JSON.parse(policySource);
  const authorityPaths = new Set([r1Path, nonOperationPath, adjudicationPath, policyPath, publicApiPath]);
  for (const entries of Object.values(policy.supplementalEntries ?? {})) {
    for (const entry of entries) {
      for (const reference of entry.authorityRefs ?? []) {
        const path = authorityPathFromRef(reference);
        if (path !== null) authorityPaths.add(path);
      }
    }
  }
  const authoritySources = await Promise.all(
    [...authorityPaths].sort().map(async (path) => ({ path, source: await read(path) })),
  );
  return {
    repositoryRoot,
    r1Rows: parseCsv(r1Source),
    nonOperationRows: parseCsv(nonOperationSource),
    adjudication: JSON.parse(adjudicationSource),
    policy,
    publicApi: JSON.parse(publicApiSource),
    authoritySources,
  };
};

const classifyOperation = (source, policy) => {
  if (policy.terminalOperationIds.mandatory.includes(source.operation_id)) return "mandatory";
  if (policy.terminalOperationIds.supersededDirectSea.includes(source.operation_id)) {
    return "superseded-direct-sea";
  }
  if (source.freeze_recommendation === "ship") return "positive-proof-gated";
  if (source.freeze_recommendation === "defer") return "conditional-gate";
  if (source.freeze_recommendation === "reject") return "rejected";
  throw new Error(`unknown R1 disposition for ${source.operation_id}: ${source.freeze_recommendation}`);
};

const operationProgress = (source, adjudicated, disposition, policy) => {
  let progress;
  if (disposition === "rejected") {
    progress = {
      implementation: { status: "prohibited-by-research", researchRecordedStatus: source.implementation_status, refs: [] },
      test: { status: "negative-surface-test-unassessed-stage-0", refs: [] },
      evidence: {
        status: "research-rejection-established",
        researchRecordedCertification: source.certification_status,
        gates: [],
        refs: adjudicated.evidence,
      },
    };
  } else if (disposition === "superseded-direct-sea") {
    progress = {
      implementation: {
        status: "prohibited-superseded-legacy-mode",
        researchRecordedStatus: source.implementation_status,
        refs: [],
      },
      test: { status: "negative-surface-test-unassessed-stage-0", refs: [] },
      evidence: {
        status: "research-supersession-established",
        researchRecordedCertification: source.certification_status,
        gates: [],
        refs: adjudicated.evidence,
      },
    };
  } else {
    const evidenceStatus = disposition === "mandatory"
      ? "historically-admitted-current-certification-unassessed"
      : "named-gate-open";
    progress = {
      implementation: {
        status: "unassessed-stage-0",
        researchRecordedStatus: source.implementation_status,
        refs: [],
      },
      test: { status: "unassessed-stage-0", refs: [] },
      evidence: {
        status: evidenceStatus,
        researchRecordedCertification: source.certification_status,
        gates: [adjudicated.preFreezeGate, source.unresolved_evidence].filter((value, index, values) =>
          value !== "" && value !== "not-current-freeze-candidate" && values.indexOf(value) === index
        ),
        refs: adjudicated.evidence,
      },
    };
  }
  const override = policy.operationProgressOverrides?.[source.operation_id];
  if (override === undefined) return progress;
  return {
    implementation: { ...progress.implementation, ...override.implementation },
    test: { ...progress.test, ...override.test },
    evidence: { ...progress.evidence, ...override.evidence },
    progressNote: override.note,
  };
};

const buildOperation = (source, adjudicated, policy) => {
  const disposition = classifyOperation(source, policy);
  const semanticParts = source.semantic_identity.split(" / ").map((part) => part.trim());
  return {
    operationId: source.operation_id,
    semanticIdentity: source.semantic_identity,
    provider: semanticParts[0],
    operation: semanticParts[1],
    mechanism: semanticParts[2],
    lifecycle: semanticParts[3],
    ownership: semanticParts[4],
    disposition,
    semantics: {
      identityOwner: source.identity_owner,
      semanticDisposition: source.semantic_disposition,
      productPriority: source.product_priority,
      providerPublication: source.provider_publication,
      publishedContract: source.published_contract,
      compatibilityCommitment: source.compatibility_commitment,
    },
    proposedSurface: {
      kind: source.surface_kind,
      package: source.proposed_package,
      subpath: source.proposed_subpath === "none" ? null : source.proposed_subpath,
      export: source.proposed_export === "none" ? null : source.proposed_export,
      rootNamespace: source.proposed_root_export === "none" ? null : source.proposed_root_export,
      rationale: source.surface_rationale,
    },
    historicalFreeze: {
      originalDisposition: adjudicated.originalDisposition,
      finalDisposition: adjudicated.finalDisposition,
      revision: adjudicated.revision,
      gateClosure: adjudicated.gateClosure,
      blocker: adjudicated.blocker,
    },
    ...operationProgress(source, adjudicated, disposition, policy),
    provenance: {
      source: r1Path,
      adjudication: adjudicationPath,
      evidenceGateBasis: source.evidence_gate_basis,
    },
  };
};

const nonOperationDisposition = (row) => {
  if (row.freeze_recommendation === "ship") return "mandatory";
  if (row.freeze_recommendation === "defer") return "conditional-gate";
  if (row.freeze_recommendation === "reject") return "rejected";
  throw new Error(`unknown non-operation disposition for ${row.atom_id}: ${row.freeze_recommendation}`);
};

const buildNonOperation = (row, policy) => {
  const disposition = nonOperationDisposition(row);
  const rejected = disposition === "rejected";
  const progress = {
    implementation: { status: rejected ? "prohibited-by-research" : "unassessed-stage-0", refs: [] },
    test: {
      status: rejected ? "negative-surface-test-unassessed-stage-0" : "unassessed-stage-0",
      refs: [],
    },
    evidence: {
      status: rejected ? "research-rejection-established" : disposition === "mandatory"
        ? "research-accepted-current-certification-unassessed"
        : "named-gate-open",
      gates: disposition === "conditional-gate" ? [row.note || row.source_label] : [],
      refs: [nonOperationPath, ...splitRefs(row.evidence_coordinate_refs)],
    },
  };
  const override = policy.nonOperationProgressOverrides?.[row.atom_id];
  const accounting = override === undefined ? progress : {
    implementation: { ...progress.implementation, ...override.implementation },
    test: { ...progress.test, ...override.test },
    evidence: { ...progress.evidence, ...override.evidence },
    progressNote: override.note,
  };
  return {
    atomId: row.atom_id,
    sourceSet: row.source_set,
    sourceId: row.source_id,
    provider: row.provider,
    sourceLabel: row.source_label,
    classification: row.classification,
    canonicalOperationIds: splitRefs(row.canonical_operation_ids),
    disposition,
    ...accounting,
    note: row.note,
    provenance: { source: nonOperationPath },
  };
};

const buildSupplementalEntry = (category, entry) => {
  const terminal = entry.disposition === "rejected";
  const defaultImplementation = { status: terminal ? "prohibited-by-research" : "unassessed-stage-0", refs: [] };
  const defaultTest = {
    status: terminal ? "negative-surface-test-unassessed-stage-0" : "unassessed-stage-0",
    refs: [],
  };
  const defaultEvidence = {
    status: terminal ? "research-rejection-established" : entry.gates.length > 0
      ? "named-gate-open"
      : "research-accepted-current-certification-unassessed",
    gates: entry.gates,
    refs: entry.authorityRefs,
  };
  return {
    ...entry,
    category,
    implementation: entry.implementation ?? defaultImplementation,
    test: entry.test ?? defaultTest,
    evidence: entry.evidence ?? defaultEvidence,
  };
};

const publicExportOwner = (packageName, subpath, exportName, ownerPolicy, targetProviderLanes) => {
  const targetProvider = targetProviderLanes.find((entry) => entry.package === packageName);
  if (targetProvider !== undefined) {
    if (subpath === ".") {
      const lane = targetProvider.lanes.find((entry) => entry.rootNamespace === exportName);
      if (lane !== undefined) return `${packageName}/${lane.lane.toLowerCase()}-root`;
    } else {
      const lane = targetProvider.lanes.find((entry) => entry.packageExport === subpath);
      if (lane !== undefined) {
        return lane.modules.find((entry) => entry.module === exportName)?.semanticOwner
          ?? `${packageName}/${lane.lane.toLowerCase()}-root`;
      }
    }
  }
  const packageOwners = ownerPolicy[packageName];
  return subpath === "."
    ? packageOwners?.rootNamespaces?.[exportName] ?? null
    : packageOwners?.subpaths?.[subpath] ?? null;
};

const buildPublicExports = (publicApi, ownerPolicy, targetProviderLanes) => {
  const entries = [];
  for (const [packageName, packageSurface] of Object.entries(publicApi.packages)) {
    for (const exportName of packageSurface.namespaces) {
      entries.push({
        package: packageName,
        subpath: ".",
        exportName,
        forms: ["namespace"],
        semanticOwner: publicExportOwner(packageName, ".", exportName, ownerPolicy, targetProviderLanes),
      });
    }
    for (const [subpath, subpathSurface] of Object.entries(packageSurface.subpaths)) {
      const names = [...new Set([...subpathSurface.runtime, ...subpathSurface.declarations])];
      for (const exportName of names) {
        const forms = [];
        if (subpathSurface.runtime.includes(exportName)) forms.push("runtime");
        if (subpathSurface.declarations.includes(exportName)) forms.push("declaration");
        entries.push({
          package: packageName,
          subpath,
          exportName,
          forms,
          semanticOwner: publicExportOwner(packageName, subpath, exportName, ownerPolicy, targetProviderLanes),
        });
      }
    }
  }
  return entries;
};

const providerLane = (operation) => {
  if (operation.mechanism === "host-api" || operation.mechanism === "in-process-api") return "Api";
  if (operation.mechanism === "selected-command") return "Command";
  throw new Error(`unknown provider-native mechanism for ${operation.operationId}: ${operation.mechanism}`);
};

const providerModuleName = (operation, policy) => {
  const moduleName = policy.targetModuleOverrides?.[operation.operationId];
  if (moduleName === undefined) throw new Error(`missing target module for ${operation.operationId}`);
  return moduleName;
};

const providerImplementationExport = (operation, policy) => {
  const exportName = policy.targetImplementationExportOverrides?.[operation.operationId];
  if (exportName === undefined) throw new Error(`missing target implementation export for ${operation.operationId}`);
  return exportName;
};

const buildTargetProviderLanes = (operations, policy) => exactProviderPackages.map((packageName) => {
  const providerOperations = operations.filter((operation) =>
    operation.proposedSurface.package === packageName
    && operation.disposition !== "rejected"
    && operation.disposition !== "superseded-direct-sea"
  );
  const lanes = ["Api", "Command"].flatMap((lane) => {
    const laneOperations = providerOperations.filter((operation) => providerLane(operation) === lane);
    if (laneOperations.length === 0) return [];
    const moduleNames = [...new Set(laneOperations.map((operation) => providerModuleName(operation, policy)))];
    return [{
      lane,
      requirement: laneOperations.every((operation) => operation.disposition === "conditional-gate")
        ? "gate-dependent"
        : "required",
      rootNamespace: lane,
      packageExport: `./${lane}`,
      modules: moduleNames.map((moduleName) => {
        const moduleOperations = laneOperations.filter((operation) => providerModuleName(operation, policy) === moduleName);
        return {
          module: moduleName,
          implementationPath: `src/${lane}/${moduleName}.ts`,
          semanticOwner: `${packageName}/${lane.toLowerCase()}/${moduleName}`,
          requirement: moduleOperations.every((operation) => operation.disposition === "conditional-gate")
            ? "gate-dependent"
            : "required",
          operations: moduleOperations.map((operation) => ({
            operationId: operation.operationId,
            export: operation.proposedSurface.export,
            implementationExport: providerImplementationExport(operation, policy),
            disposition: operation.disposition,
          })),
        };
      }),
    }];
  });
  return {
    package: packageName,
    requirement: providerOperations.every((operation) => operation.disposition === "conditional-gate")
      ? "gate-dependent"
      : "required",
    lanes,
    absentLanes: ["Api", "Command"].filter((lane) => !lanes.some((entry) => entry.lane === lane)).map((lane) => ({
      lane,
      reason: "no-live-r1-operation-in-this-native-lane; synthetic-mirroring-is-forbidden",
    })),
  };
});

export const buildContract = (inputs) => {
  const adjudicationById = new Map(inputs.adjudication.candidates.map((entry) => [entry.operationId, entry]));
  const operations = inputs.r1Rows.map((source) => {
    const adjudicated = adjudicationById.get(source.operation_id);
    if (adjudicated === undefined) throw new Error(`R1 operation missing adjudication: ${source.operation_id}`);
    return buildOperation(source, adjudicated, inputs.policy);
  });
  const dispositionCounts = Object.fromEntries(
    Object.keys(expectedDispositionCounts).map((disposition) => [
      disposition,
      operations.filter((operation) => operation.disposition === disposition).length,
    ]),
  );
  const supplemental = Object.fromEntries(
    exactSupplementalCategories.map((category) => [
      category,
      inputs.policy.supplementalEntries[category].map((entry) => buildSupplementalEntry(category, entry)),
    ]),
  );
  const targetProviderLanes = buildTargetProviderLanes(operations, inputs.policy);
  const currentPublicExports = buildPublicExports(
    inputs.publicApi,
    inputs.policy.publicSurfaceOwners,
    targetProviderLanes,
  );
  const evidenceControl = structuredClone(inputs.policy.evidenceControl);
  const nodeRule = evidenceControl.coordinateRules.nodeMainExecutable;
  const unsupportedByTarget = new Map(
    nodeRule.explicitUnsupportedTargets.map((entry) => [entry.target, entry]),
  );
  nodeRule.explicitUnsupportedCoordinates = nodeRule.axes.producerGroup.flatMap((producerGroup) =>
    nodeRule.axes.mainFormat.flatMap((mainFormat) =>
      nodeRule.axes.constructionHost.flatMap((constructionHost) =>
        nodeRule.axes.target.flatMap((target) => {
          const unsupported = unsupportedByTarget.get(target);
          return unsupported === undefined ? [] : [{
            producerGroup,
            mainFormat,
            constructionHost,
            target,
            disposition: unsupported.disposition,
            reason: unsupported.reason,
          }];
        })
      )
    )
  );
  return {
    schema: "effect-build/research-complete-contract@1",
    status: "hard-cut-implemented-local-evidence-external-certification-incomplete",
    authority: {
      replacesAsProductAuthority: inputs.policy.supersedesAsProductAuthority,
      rule: "implement every accepted finding and close every valid gate; never inherit an incomplete public surface as scope",
      generatedFromResearch: true,
      authorityCommits: inputs.policy.authorityCommits,
      separateAuthorities: inputs.policy.invariants.separateAuthorities,
    },
    provenance: {
      sources: inputs.authoritySources.map(({ path, source }) => ({ path, sha256: sha256(source) })),
      deterministicGeneration: true,
      generator: "scripts/research-contract/generate.mjs",
      validator: "scripts/research-contract/validate.mjs",
    },
    invariants: inputs.policy.invariants,
    releaseControl: inputs.policy.releaseControl,
    evidenceControl,
    operationRegister: {
      source: r1Path,
      count: operations.length,
      dispositionCounts,
      operations,
    },
    nonOperationRegister: {
      source: nonOperationPath,
      count: inputs.nonOperationRows.length,
      entries: inputs.nonOperationRows.map((row) => buildNonOperation(row, inputs.policy)),
    },
    supplemental,
    currentPublicSurfaceOwnership: {
      source: publicApiPath,
      authority: "implementation-evidence-only-not-target-scope",
      meaning: "current generated public surface mapped to semantic owners; presence does not imply complete research scope",
      exportCount: currentPublicExports.length,
      exports: currentPublicExports,
    },
    targetPublicSurface: {
      status: "hard-cut-implemented-required-public-conditional-package-private",
      lanePolicy: "operation-specific Api and Command lanes; publish a lane only when it contains an admitted operation; all-conditional lanes and packages remain private; empty and synthetic twins are forbidden",
      providerLanes: targetProviderLanes,
      coreModules: [
        "./Artifact",
        "./SystemTarget",
        "./Matrix",
        "./Author/Tool",
        "./Author/BorrowedOutput",
        "./Author/Executable",
      ],
      privateProfileCandidates: [
        {
          id: "PROFILE-NODE-SEALED-MAIN",
          implementationPath: "packages/effect-build/src/Author/NodeMain.ts",
        },
        {
          id: "PROFILE-BROWSER-MODULE-PAYLOAD",
          implementationPath: "packages/effect-build/src/Profile/BrowserModulePayload.ts",
        },
        {
          id: "PROFILE-INCREMENTAL-NODE-MAIN",
          implementationPath: "packages/effect-build/src/Profile/internal/IncrementalNodeMain.ts",
        },
        {
          id: "PROFILE-TYPED-WATCH-PROTOCOL",
          implementationPath: "packages/effect-build/src/Profile/internal/TypedWatch.ts",
        },
      ],
      appleModules: [
        "./Artifact",
        "./CodeSign",
        "./AppBundle",
        "./Zip",
        "./DiskImage",
        "./InstallerPackage",
        "./Notary",
        "./Staple",
        "./Assess",
      ],
      inheritedProviderSubpathsAreAuthority: false,
      forbiddenInheritedProviderSubpaths: ["./Build", "./Bundle", "./CompileExecutable", "./Context", "./Profile", "./Raw", "./Watch"],
    },
    certification: {
      currentClaim: "local-hard-cut-implementation-and-test-evidence-only",
      implementationAssessment: "all-registered-and-supplemental-findings-explicitly-accounted",
      testAssessment: "local-gates-recorded-external-matrices-and-credentials-open",
      externalEvidenceEarnedByThisContract: false,
    },
  };
};

const assertProgress = (entry, label) => {
  requireText(entry.disposition, `${label}.disposition`);
  requireText(entry.implementation?.status, `${label}.implementation.status`);
  if (!Array.isArray(entry.implementation?.refs)) throw new Error(`${label}.implementation.refs must be an array`);
  requireText(entry.test?.status, `${label}.test.status`);
  if (!Array.isArray(entry.test?.refs)) throw new Error(`${label}.test.refs must be an array`);
  requireText(entry.evidence?.status, `${label}.evidence.status`);
  if (!Array.isArray(entry.evidence?.gates)) throw new Error(`${label}.evidence.gates must be an array`);
  if (!Array.isArray(entry.evidence?.refs)) throw new Error(`${label}.evidence.refs must be an array`);
};

export const validateContract = (contract, inputs) => {
  if (contract.schema !== "effect-build/research-complete-contract@1") throw new Error("unexpected contract schema");
  if (inputs.policy.schema !== "effect-build/research-complete-policy@1") throw new Error("unexpected policy schema");
  if (inputs.adjudication.schema !== "effect-build/surface-adjudication@1") {
    throw new Error("unexpected historical adjudication schema");
  }
  if (inputs.r1Rows.length !== 67) throw new Error(`R1 operation count changed from 67 to ${inputs.r1Rows.length}`);
  if (contract.operationRegister.count !== 67 || contract.operationRegister.operations.length !== 67) {
    throw new Error("contract does not cover all 67 R1 operations");
  }

  const sourceIds = inputs.r1Rows.map((row) => row.operation_id);
  const contractIds = contract.operationRegister.operations.map((entry) => entry.operationId);
  unique(sourceIds, "R1 operation IDs");
  unique(contractIds, "contract operation IDs");
  if (!sameJson(sourceIds, contractIds)) throw new Error("contract operation order or membership differs from R1");

  for (let index = 0; index < inputs.r1Rows.length; index += 1) {
    const source = inputs.r1Rows[index];
    const operation = contract.operationRegister.operations[index];
    if (operation.semanticIdentity !== source.semantic_identity) {
      throw new Error(`semantic identity drift for ${source.operation_id}`);
    }
    const expectedDisposition = classifyOperation(source, inputs.policy);
    if (operation.disposition !== expectedDisposition) {
      throw new Error(`disposition drift for ${source.operation_id}`);
    }
    assertProgress(operation, `operation ${source.operation_id}`);
  }
  if (!sameJson(contract.operationRegister.dispositionCounts, expectedDispositionCounts)) {
    throw new Error("operation disposition counts changed");
  }
  if (!sameJson(inputs.policy.invariants.operationDispositionCounts, expectedDispositionCounts)) {
    throw new Error("policy operation disposition counts changed");
  }

  const mandatoryIds = contract.operationRegister.operations
    .filter((entry) => entry.disposition === "mandatory")
    .map((entry) => entry.operationId);
  if (!sameJson(mandatoryIds, inputs.policy.terminalOperationIds.mandatory)) {
    throw new Error("mandatory operation set changed");
  }
  const supersededIds = contract.operationRegister.operations
    .filter((entry) => entry.disposition === "superseded-direct-sea")
    .map((entry) => entry.operationId);
  if (!sameJson(supersededIds, inputs.policy.terminalOperationIds.supersededDirectSea)) {
    throw new Error("direct SEA supersession set changed");
  }
  const liveIds = contract.operationRegister.operations
    .filter((entry) => entry.disposition !== "rejected" && entry.disposition !== "superseded-direct-sea")
    .map((entry) => entry.operationId);
  if (!sameSet(Object.keys(inputs.policy.targetModuleOverrides), liveIds)) {
    throw new Error("target module policy must cover every live R1 operation exactly once");
  }
  if (!sameSet(Object.keys(inputs.policy.targetImplementationExportOverrides ?? {}), liveIds)) {
    throw new Error("target implementation export policy must cover every live R1 operation exactly once");
  }
  for (const operation of contract.operationRegister.operations) {
    if (!liveIds.includes(operation.operationId)) continue;
    const implementationExport = inputs.policy.targetImplementationExportOverrides[operation.operationId];
    requireText(implementationExport, `${operation.operationId}.targetImplementationExport`);
    if (operation.proposedSurface.export !== null && operation.proposedSurface.export !== implementationExport) {
      throw new Error(`${operation.operationId} public and implementation exports disagree`);
    }
  }
  const progressOperationIds = Object.keys(inputs.policy.operationProgressOverrides ?? {});
  for (const operationId of progressOperationIds) {
    if (!sourceIds.includes(operationId)) throw new Error(`unknown operation progress override ${operationId}`);
  }
  if (!sameSet(progressOperationIds, sourceIds)) {
    throw new Error("operation progress policy must explicitly account for every R1 operation");
  }
  for (const operation of contract.operationRegister.operations) {
    if (
      operation.implementation.status.includes("unassessed")
      || operation.test.status.includes("unassessed")
      || operation.evidence.status.includes("unassessed")
    ) {
      throw new Error(`operation ${operation.operationId} retains unassessed accounting`);
    }
  }

  const atomIds = inputs.nonOperationRows.map((row) => row.atom_id);
  const contractAtomIds = contract.nonOperationRegister.entries.map((entry) => entry.atomId);
  unique(atomIds, "non-operation atom IDs");
  unique(contractAtomIds, "contract non-operation atom IDs");
  if (contract.nonOperationRegister.count !== inputs.nonOperationRows.length || !sameJson(atomIds, contractAtomIds)) {
    throw new Error("contract does not exactly cover the non-operation register");
  }
  const overrideAtomIds = Object.keys(inputs.policy.nonOperationProgressOverrides ?? {});
  for (const atomId of overrideAtomIds) {
    if (!atomIds.includes(atomId)) throw new Error(`unknown non-operation progress override ${atomId}`);
  }
  if (!sameSet(overrideAtomIds, atomIds)) {
    throw new Error("non-operation progress policy must explicitly account for every registered atom");
  }
  for (const entry of contract.nonOperationRegister.entries) {
    assertProgress(entry, `non-operation ${entry.atomId}`);
    if (
      entry.implementation.status.includes("unassessed")
      || entry.test.status.includes("unassessed")
      || entry.evidence.status.includes("unassessed")
    ) {
      throw new Error(`non-operation ${entry.atomId} retains unassessed accounting`);
    }
  }

  if (!sameSet(Object.keys(contract.supplemental), exactSupplementalCategories)) {
    throw new Error("supplemental authority categories changed");
  }
  const supplementalIds = [];
  for (const category of exactSupplementalCategories) {
    const policyEntries = inputs.policy.supplementalEntries[category];
    const entries = contract.supplemental[category];
    if (entries.length !== policyEntries.length) throw new Error(`supplemental ${category} coverage changed`);
    if (!sameJson(entries.map((entry) => entry.id), exactSupplementalIds[category])) {
      throw new Error(`supplemental ${category} authority set changed`);
    }
    for (const entry of entries) {
      supplementalIds.push(entry.id);
      requireText(entry.semanticOwner, `${entry.id}.semanticOwner`);
      if (!Array.isArray(entry.authorityRefs) || entry.authorityRefs.length === 0) {
        throw new Error(`${entry.id} has no authority provenance`);
      }
      assertProgress(entry, `supplemental ${entry.id}`);
      if (
        entry.implementation.status.includes("unassessed")
        || entry.test.status.includes("unassessed")
        || entry.evidence.status.includes("unassessed")
      ) {
        throw new Error(`supplemental ${entry.id} retains unassessed accounting`);
      }
    }
  }
  unique(supplementalIds, "supplemental entry IDs");

  if (!sameJson(contract.invariants.certificationHosts, exactCertificationHosts)) {
    throw new Error("five-host certification invariant changed");
  }
  if (!sameJson(contract.invariants.firstPartyPackages, exactFirstPartyPackages)) {
    throw new Error("six-package admitted first-party train changed");
  }
  if (!sameJson(contract.invariants.conditionalPackageCandidates, exactConditionalPackageCandidates)) {
    throw new Error("conditional package candidate set changed");
  }
  if (contract.releaseControl.candidateSchema !== "effect-build/release-candidate@3") {
    throw new Error("release-candidate hard-cut schema changed");
  }
  if (!sameJson(contract.releaseControl.orderedPackages, exactFirstPartyPackages)) {
    throw new Error("release control does not use the exact admitted package train");
  }
  if (!sameJson(contract.releaseControl.conditionalPackageCandidates, exactConditionalPackageCandidates)) {
    throw new Error("release control conditional package set changed");
  }
  if (!sameSet(Object.keys(contract.releaseControl.orderedPackagePrerequisites), exactFirstPartyPackages)) {
    throw new Error("release prerequisite map does not cover the admitted package train");
  }
  if (!sameJson(contract.releaseControl.candidateIdentity, exactReleaseCandidateIdentity)) {
    throw new Error("release candidate identity is not the exact research-complete authority");
  }
  if (!sameJson(contract.releaseControl.candidatePackageRecordFields, exactReleaseCandidatePackageRecordFields)) {
    throw new Error("release candidate package record fields changed");
  }
  if (
    !sameJson(
      contract.releaseControl.candidatePublicNodeSeaEvidenceFields,
      exactReleaseCandidatePublicNodeSeaEvidenceFields,
    )
  ) throw new Error("release candidate public Node SEA evidence fields changed");
  const evidence = contract.evidenceControl;
  if (!sameJson(evidence.certificationHosts, exactCertificationHostDefinitions)) {
    throw new Error("research-complete evidence control does not define the exact D13 hosts");
  }
  if (!sameJson(evidence.targetExecutionHosts, exactTargetExecutionHosts)) {
    throw new Error("research-complete target execution hosts changed");
  }
  const generation = evidence.directoryGeneration;
  if (
    sha256(JSON.stringify(generation)) !== exactDirectoryGenerationSha256
    || sha256(generation.manifestBytes.sample) !== generation.manifestBytes.sampleSha256
    || sha256(generation.currentReferenceBytes.sample) !== generation.currentReferenceBytes.sampleSha256
  ) {
    throw new Error("research-complete directory-generation authority changed");
  }
  if (!sameJson(evidence.certificationHosts.map(({ id }) => id), contract.invariants.certificationHosts)) {
    throw new Error("evidence-control hosts differ from the D13 invariant");
  }
  const evidenceRules = evidence.coordinateRules;
  for (const ruleName of [
    "compilerTargets",
    "browserModulePayload",
    "nodeMainExecutable",
    "providerNativeLanes",
    "packedConsumers",
    "packedConditionalProviderCandidates",
  ]) {
    if (evidenceRules[ruleName] === undefined) throw new Error(`missing current evidence rule ${ruleName}`);
  }
  const compilerTargets = evidenceRules.compilerTargets;
  if (
    compilerTargets.rule !== "explicit-exact-coordinate-list"
    || compilerTargets.constructionHost !== "linux-x64"
    || !sameJson(compilerTargets.coordinates, exactCompilerTargetCoordinates)
    || compilerTargets.expectedCoordinateCount !== exactCompilerTargetCoordinates.length
    || compilerTargets.targetExecutionClaim
      !== "none-structural-inspection-only-separate-exact-target-execution-gates-remain-open"
  ) throw new Error("compiler target evidence coordinates changed");
  for (const rule of [
    evidenceRules.browserModulePayload,
    evidenceRules.packedConsumers,
    evidenceRules.packedConditionalProviderCandidates,
  ]) {
    if (rule.rule !== "full-cartesian-product-no-pruning" || cartesianCount(rule.axes) !== rule.expectedCoordinateCount) {
      throw new Error(`current evidence rule ${rule.operation} has inconsistent Cartesian accounting`);
    }
  }
  for (const rule of [
    evidenceRules.browserModulePayload,
    evidenceRules.providerNativeLanes,
    evidenceRules.packedConsumers,
    evidenceRules.packedConditionalProviderCandidates,
  ]) {
    if (!sameJson(rule.axes.certificationHost, exactCertificationHosts)) {
      throw new Error(`current evidence rule ${rule.operation} does not cover the exact D13 hosts`);
    }
  }
  if (!sameJson(evidenceRules.nodeMainExecutable.axes.constructionHost, exactCertificationHosts)) {
    throw new Error("Node construction evidence does not cover the exact D13 hosts");
  }
  if (!sameJson(evidenceRules.nodeMainExecutable.axes.target, exactTargetExecutionHosts.map(({ target }) => target))) {
    throw new Error("Node finalizer targets differ from current target execution hosts");
  }
  const nodeRule = evidenceRules.nodeMainExecutable;
  const unsupportedNodeCoordinateKeys = nodeRule.explicitUnsupportedCoordinates.map(
    ({ producerGroup, mainFormat, constructionHost, target }) =>
      `${producerGroup}\0${mainFormat}\0${constructionHost}\0${target}`,
  );
  unique(unsupportedNodeCoordinateKeys, "Node unsupported coordinates");
  if (
    nodeRule.rule !== "cartesian-product-minus-explicit-unsupported-targets"
    || cartesianCount(nodeRule.axes) !== nodeRule.expectedCartesianCoordinateCount
    || !sameJson(nodeRule.explicitUnsupportedTargets, exactNodeUnsupportedTargets)
    || nodeRule.explicitUnsupportedTargets.length !== nodeRule.expectedUnsupportedTargetCount
    || nodeRule.explicitUnsupportedCoordinates.length !== nodeRule.expectedUnsupportedCoordinateCount
    || nodeRule.expectedCoordinateCount
      !== nodeRule.expectedCartesianCoordinateCount - nodeRule.expectedUnsupportedCoordinateCount
    || nodeRule.expectedCartesianCoordinateCount !== 180
    || nodeRule.expectedUnsupportedCoordinateCount !== 30
    || nodeRule.expectedCoordinateCount !== 150
  ) throw new Error("Node executable evidence applicability accounting changed");
  for (const coordinate of nodeRule.explicitUnsupportedCoordinates) {
    if (
      !nodeRule.axes.producerGroup.includes(coordinate.producerGroup)
      || !nodeRule.axes.mainFormat.includes(coordinate.mainFormat)
      || !nodeRule.axes.constructionHost.includes(coordinate.constructionHost)
      || coordinate.target !== "macos-x64"
      || coordinate.disposition !== "rejected"
      || coordinate.reason !== exactNodeUnsupportedTargets[0].reason
    ) throw new Error("Node unsupported coordinate is outside current evidence authority");
  }
  if (!sameJson(evidenceRules.packedConsumers.axes.package, exactFirstPartyPackages)) {
    throw new Error("packed consumer evidence does not use the admitted package train");
  }
  if (!sameJson(evidenceRules.packedConditionalProviderCandidates.axes.package, exactConditionalPackageCandidates)) {
    throw new Error("conditional packed evidence does not use the exact candidate set");
  }
  const effectEndpoints = ["4.0.0-beta.104", "4.0.0-rc.108"];
  if (
    !sameJson(evidenceRules.packedConsumers.axes.effect, effectEndpoints)
    || !sameJson(evidenceRules.packedConditionalProviderCandidates.axes.effect, effectEndpoints)
  ) {
    throw new Error("packed evidence does not use both exact Effect endpoints");
  }
  const nativeRule = evidenceRules.providerNativeLanes;
  const unsupportedKeys = nativeRule.explicitUnsupportedCoordinates.map(
    ({ providerRuntimeCell, certificationHost }) => `${providerRuntimeCell}\0${certificationHost}`,
  );
  unique(unsupportedKeys, "provider-native unsupported coordinates");
  if (
    nativeRule.rule !== "cartesian-product-minus-explicit-unsupported-cells"
    || cartesianCount(nativeRule.axes) !== nativeRule.expectedCartesianCoordinateCount
    || nativeRule.explicitUnsupportedCoordinates.length !== nativeRule.expectedUnsupportedCoordinateCount
    || nativeRule.expectedCoordinateCount
      !== nativeRule.expectedCartesianCoordinateCount - nativeRule.expectedUnsupportedCoordinateCount
    || nativeRule.observationProtocol !== "effect-build/provider-native-operation-observation@1"
    || nativeRule.receiptProtocol !== "effect-build/provider-native-evidence-receipt@2"
    || nativeRule.observationRule
      !== "each successful test writes one canonical coordinate-bound marker per actually exercised operation or atom; receipt creation requires the exact marker set and rejects inferred, missing, or extra evidence"
  ) {
    throw new Error("provider-native evidence applicability accounting changed");
  }
  for (const coordinate of nativeRule.explicitUnsupportedCoordinates) {
    if (
      !nativeRule.axes.providerRuntimeCell.includes(coordinate.providerRuntimeCell)
      || !nativeRule.axes.certificationHost.includes(coordinate.certificationHost)
      || coordinate.reason !== "public-node-sea-host-target-is-linux-x64-gnu-only"
    ) throw new Error("provider-native unsupported coordinate is outside current evidence authority");
  }
  const nodeEvidence = evidence.nodeMainExecutable;
  if (nodeEvidence.assemblerCell !== "node@26.7.0") throw new Error("Node assembler cell changed");
  if (!sameJson(nodeEvidence.intendedEvidenceCells.map(({ target }) => target), exactTargetExecutionHosts.map(({ target }) => target))) {
    throw new Error("authenticated Node distributions do not cover every target execution host");
  }
  unique(nodeEvidence.intendedEvidenceCells.map(({ distribution }) => distribution), "authenticated Node distributions");
  for (const cell of nodeEvidence.intendedEvidenceCells) {
    requireText(cell.distribution, `${cell.target}.distribution`);
    if (!/^[0-9a-f]{64}$/u.test(cell.sha256)) throw new Error(`${cell.target}.sha256 is not exact lowercase SHA-256`);
  }
  const manifest = nodeEvidence.nodeDistributionManifest;
  if (
    manifest.url !== "https://nodejs.org/dist/v26.7.0/SHASUMS256.txt"
    || manifest.signatureUrl !== "https://nodejs.org/dist/v26.7.0/SHASUMS256.txt.sig"
    || !/^[0-9a-f]{64}$/u.test(manifest.sha256)
    || !/^[0-9a-f]{64}$/u.test(manifest.signatureSha256)
    || !/^[0-9a-f]{64}$/u.test(manifest.releaseKeySha256)
    || !/^[0-9a-f]{40}$/u.test(manifest.releaseKeyRepositoryCommit)
    || !/^[0-9A-F]{40}$/u.test(manifest.signerFingerprint)
  ) throw new Error("authenticated Node distribution manifest authority changed");
  const finalizer = nodeEvidence.targetFinalization.capability;
  if (
    finalizer.protocol !== "effect-build/node-target-finalizer@1"
    || finalizer.receiptProtocol !== "effect-build/node-target-finalizer-receipt@1"
    || finalizer.publicExport !== "none-package-private-research-complete"
    || finalizer.authority.repository !== "mannyc2/effect-build"
    || finalizer.authority.workflowPath !== ".github/workflows/ci.yml"
    || !sameJson(finalizer.authority.workflowEvents, ["push", "pull_request", "workflow_dispatch"])
  ) throw new Error("private Node finalizer capability changed");
  for (const [field, values] of Object.entries({
    constructionOfferFieldSet: finalizer.constructionOfferFieldSet,
    requestOfferEqualFields: finalizer.requestOfferEqualFields,
    requestFieldSet: finalizer.requestFieldSet,
    responseFieldSet: finalizer.responseFieldSet,
  })) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`Node finalizer ${field} is empty`);
    unique(values, `Node finalizer ${field}`);
  }
  const apple = evidence.appleCertification;
  if (sha256(JSON.stringify(apple)) !== exactAppleCertificationAuthoritySha256) {
    throw new Error("Apple certification authority digest changed");
  }
  if (
    apple.packageVersion !== "0.5.0"
    || !sameJson(apple.protocols, {
      request: "effect-build/apple-certification-request@2",
      receipt: "effect-build/apple-certification-receipt@2",
      evidence: "effect-build/apple-certification-evidence@2",
      bundle: "effect-build/apple-certification-bundle@2",
      priorEvidenceManifest: "effect-build/apple-certification-prior-evidence@1",
      index: "effect-build/apple-certification-index@1",
    })
    || apple.workflowRepository !== "mannyc2/effect-build"
    || apple.workflowPath !== ".github/workflows/apple-certification.yml"
    || apple.workflowRef !== "refs/heads/main"
    || apple.workflowEvent !== "workflow_dispatch"
  ) throw new Error("Apple certification authority or hard-cut protocols changed");
  if (!sameJson(apple.certificationCells, Array.from({ length: 10 }, (_, index) => `A${index}`))) {
    throw new Error("Apple A0-A9 certification cells changed");
  }
  const appleTargets = ["macos-x64", "macos-aarch64"];
  const distributionScenarios = Object.keys(apple.evidenceSchema.distribution.requiredOperations);
  const cleanHostProducts = Object.keys(apple.evidenceSchema.cleanHost.requiredOperations);
  const distributionCoordinates = distributionScenarios.flatMap((scenario) => appleTargets.map((target) => `${scenario}|${target}`));
  const cleanHostCoordinates = cleanHostProducts.flatMap((product) => appleTargets.map((target) => `${product}|${target}`));
  if (
    distributionScenarios.length !== 7
    || cleanHostProducts.length !== 4
    || !sameJson(apple.appleDistributionCoordinates, distributionCoordinates)
    || !sameJson(apple.appleCleanHostCoordinates, cleanHostCoordinates)
  ) throw new Error("Apple distribution or clean-host coordinate authority changed");
  for (const [subject, values] of Object.entries({
    releaseInputFields: apple.releaseInputFields,
    indexFields: apple.indexFields,
    requestFields: apple.requestFields,
    receiptFields: apple.receiptFields,
    evidenceFields: apple.evidenceSchema.fields,
    runnerFields: apple.evidenceSchema.runnerFields,
    artifactFields: apple.evidenceSchema.artifactFields,
    toolFields: apple.evidenceSchema.toolFields,
    stepFields: apple.evidenceSchema.stepFields,
    credentialFields: apple.evidenceSchema.credentialFields,
    notaryFields: apple.evidenceSchema.notaryFields,
    priorEvidenceFields: apple.evidenceSchema.priorEvidenceFields,
    priorEvidenceManifestFields: apple.evidenceSchema.priorEvidenceManifest.fields,
    priorEvidenceManifestEntryFields: apple.evidenceSchema.priorEvidenceManifest.entryFields,
    quarantineFields: apple.evidenceSchema.quarantineFields,
    claimFields: apple.evidenceSchema.claimFields,
  })) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`Apple ${subject} is empty`);
    unique(values, `Apple ${subject}`);
  }
  for (const [scenario, operations] of Object.entries(apple.evidenceSchema.distribution.requiredOperations)) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error(`Apple distribution ${scenario} has no operations`);
    unique(operations, `Apple distribution ${scenario} operations`);
  }
  for (const [product, operations] of Object.entries(apple.evidenceSchema.cleanHost.requiredOperations)) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error(`Apple clean-host ${product} has no operations`);
    unique(operations, `Apple clean-host ${product} operations`);
  }
  if (
    !sameSet(Object.keys(apple.evidenceSchema.cell.requiredClaims), apple.certificationCells)
    || apple.evidenceSchema.cell.requiredOperation !== "evaluate"
    || apple.certifierAuthority.environment !== "apple-certification"
    || apple.certifierAuthority.primaryPathVariable !== "EFFECT_BUILD_APPLE_CERTIFIER"
    || apple.certifierAuthority.primaryDigestVariable !== "EFFECT_BUILD_APPLE_CERTIFIER_SHA256"
    || apple.certifierAuthority.cleanHostPathVariable !== "EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER"
    || apple.certifierAuthority.cleanHostDigestVariable !== "EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER_SHA256"
  ) throw new Error("Apple certifier or category-evidence schema changed");
  if (!Array.isArray(apple.externalGates) || apple.externalGates.length === 0) {
    throw new Error("Apple external evidence gates disappeared");
  }
  if (!sameJson(contract.invariants.authorModules, exactAuthorModules)) {
    throw new Error("three-module Author SPI changed");
  }
  if (!sameJson(contract.invariants.separateAuthorities, exactSeparateAuthorities)) {
    throw new Error("release authority separation changed");
  }
  if (contract.invariants.apiCommandPolicy !== "operation-specific-native-lanes-no-universal-mirroring") {
    throw new Error("Api/Command lane policy changed");
  }
  if (contract.invariants.publicationStatus !== "unauthorized-until-every-external-gate-is-earned") {
    throw new Error("publication authority changed");
  }
  for (const [name, commit] of Object.entries(contract.authority.authorityCommits)) {
    if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`authority commit ${name} is not an exact commit`);
  }
  if (contract.certification.externalEvidenceEarnedByThisContract !== false) {
    throw new Error("the local implementation contract may not claim earned external evidence");
  }

  const publicPackages = Object.keys(inputs.publicApi.packages);
  const ownerPackages = Object.keys(inputs.policy.publicSurfaceOwners);
  if (!sameJson(publicPackages, ownerPackages)) throw new Error("public package semantic-owner coverage changed");
  for (const packageName of publicPackages) {
    const packageSurface = inputs.publicApi.packages[packageName];
    const packageOwners = inputs.policy.publicSurfaceOwners[packageName];
    if (!sameSet(Object.keys(packageOwners.rootNamespaces), packageSurface.namespaces)) {
      throw new Error(`${packageName} root semantic-owner policy is not the exact current surface`);
    }
    if (!sameSet(Object.keys(packageOwners.subpaths), Object.keys(packageSurface.subpaths))) {
      throw new Error(`${packageName} subpath semantic-owner policy is not the exact current surface`);
    }
  }
  const expectedProviderLanes = buildTargetProviderLanes(contract.operationRegister.operations, inputs.policy);
  const expectedPublicExports = buildPublicExports(
    inputs.publicApi,
    inputs.policy.publicSurfaceOwners,
    expectedProviderLanes,
  );
  if (contract.currentPublicSurfaceOwnership.exportCount !== expectedPublicExports.length) {
    throw new Error("public export count changed");
  }
  const publicKeys = contract.currentPublicSurfaceOwnership.exports.map((entry) =>
    `${entry.package}\0${entry.subpath}\0${entry.exportName}`
  );
  unique(publicKeys, "public export ownership keys");
  for (const entry of contract.currentPublicSurfaceOwnership.exports) {
    requireText(entry.semanticOwner, `${entry.package}${entry.subpath}:${entry.exportName}.semanticOwner`);
  }
  if (!sameJson(contract.currentPublicSurfaceOwnership.exports, expectedPublicExports)) {
    throw new Error("public export semantic-owner projection drifted");
  }

  if (!sameJson(contract.targetPublicSurface.providerLanes, expectedProviderLanes)) {
    throw new Error("target provider Api/Command lane projection drifted");
  }
  const targetOperationIds = contract.targetPublicSurface.providerLanes.flatMap((provider) =>
    provider.lanes.flatMap((lane) => lane.modules.flatMap((module) => module.operations.map((entry) => entry.operationId)))
  );
  const expectedTargetOperationIds = contract.operationRegister.operations
    .filter((entry) => entry.disposition !== "rejected" && entry.disposition !== "superseded-direct-sea")
    .map((entry) => entry.operationId);
  unique(targetOperationIds, "target provider operation IDs");
  if (!sameSet(targetOperationIds, expectedTargetOperationIds)) {
    throw new Error("target provider lanes do not cover every live R1 operation exactly once");
  }
  for (const provider of contract.targetPublicSurface.providerLanes) {
    const publicPackage = inputs.publicApi.packages[provider.package];
    if (provider.requirement === "required" && publicPackage === undefined) {
      throw new Error(`${provider.package} has admitted operations but no public package surface`);
    }
    if (provider.requirement === "gate-dependent" && publicPackage !== undefined) {
      throw new Error(`${provider.package} is an all-conditional package candidate but entered the public surface`);
    }
    for (const lane of provider.lanes) {
      if (!["./Api", "./Command"].includes(lane.packageExport)) {
        throw new Error(`${provider.package} inherited a non-canonical provider subpath`);
      }
      for (const module of lane.modules) requireText(module.semanticOwner, `${provider.package}/${lane.lane}/${module.module}`);
      const laneNamespaceIsPublic = publicPackage?.namespaces.includes(lane.rootNamespace) ?? false;
      const laneSubpathIsPublic = publicPackage !== undefined
        && Object.hasOwn(publicPackage.subpaths, lane.packageExport);
      const laneIsPublic = laneNamespaceIsPublic && laneSubpathIsPublic;
      if (lane.requirement === "required" && !laneIsPublic) {
        throw new Error(`${provider.package}/${lane.lane} has admitted operations but is not public`);
      }
      if (lane.requirement === "gate-dependent" && (laneNamespaceIsPublic || laneSubpathIsPublic)) {
        throw new Error(`${provider.package}/${lane.lane} is all-conditional but entered the public surface`);
      }
    }
  }
  const nodeTarget = contract.targetPublicSurface.providerLanes.find((entry) => entry.package === "effect-build-node-sea");
  if (nodeTarget.lanes.some((lane) => lane.lane === "Api")) {
    throw new Error("Node SEA may not synthesize an Api lane without a valid in-process operation");
  }
  if (contract.targetPublicSurface.inheritedProviderSubpathsAreAuthority !== false) {
    throw new Error("inherited provider subpaths may not constrain the target surface");
  }

  const expected = buildContract(inputs);
  if (!sameJson(contract, expected)) throw new Error("generated research-complete contract is stale");
};

export const renderJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

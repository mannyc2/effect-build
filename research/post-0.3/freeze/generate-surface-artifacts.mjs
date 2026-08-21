import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(root, "../../..");

const sourcePath = join(repositoryRoot, "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv");
const stopPath = join(repositoryRoot, "research/post-0.3/reconciliation/r1/STOP-CONDITION.json");
const policyPath = join(root, "SURFACE-ADJUDICATION-POLICY.json");
const candidateVerdictsPath = join(root, "CANDIDATE-VERDICTS.json");
const adjudicationJsonPath = join(root, "SURFACE-ADJUDICATION.json");
const adjudicationCsvPath = join(root, "SURFACE-ADJUDICATION.csv");
const surfacePath = join(root, "SURFACE.json");
const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--check")) {
  throw new Error("usage: node generate-surface-artifacts.mjs [--check]");
}
const checkOnly = arguments_[0] === "--check";

const parseCsv = (source) => {
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
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const [headers, ...rows] = records;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
};

const quoteCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const renderJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const sourceRows = parseCsv(await readFile(sourcePath, "utf8"));
const stopCondition = JSON.parse(await readFile(stopPath, "utf8"));
const policy = JSON.parse(await readFile(policyPath, "utf8"));
const candidateVerdicts = JSON.parse(await readFile(candidateVerdictsPath, "utf8"));

if (policy.schema !== "effect-build/surface-adjudication-policy@2") {
  throw new Error("unexpected surface adjudication policy schema");
}
const contractFreeze = policy.contractFreeze;
if (contractFreeze?.schema !== "effect-build/public-contract-freeze@1") {
  throw new Error("missing frozen public contract semantics");
}
const contractOperationIds = contractFreeze.operations.map((operation) => operation.operationId);
if (new Set(contractOperationIds).size !== contractOperationIds.length) {
  throw new Error("frozen public contract semantics contain duplicate operation IDs");
}
const contractByOperationId = new Map(
  contractFreeze.operations.map((operation) => [operation.operationId, operation]),
);

const blockerById = new Map(
  stopCondition.surface_freeze_blockers.map((blocker) => [blocker.operation_id, blocker.pre_freeze_gate]),
);
const targetedById = new Map(policy.targetedProofAudit.map((candidate) => [candidate.operationId, candidate.reason]));
const overrideById = new Map(policy.adjudicationOverrides.map((override) => [override.operationId, override]));

const candidates = sourceRows.map((source) => {
  const originalDisposition = source.freeze_recommendation;
  const override = overrideById.get(source.operation_id);
  const selected = source.surface_selection_status === "selected-candidate-not-frozen";
  const finalDisposition = override?.disposition
    ?? policy.defaultRules[
      selected
        ? "selectedCandidateNotFrozen"
        : source.surface_selection_status === "not-selected-deferred"
        ? "notSelectedDeferred"
        : "notSelectedRejected"
    ];
  const gate = blockerById.get(source.operation_id) ?? source.pre_freeze_gate;
  const targetedReason = targetedById.get(source.operation_id);
  const revision = originalDisposition === finalDisposition
    ? "unchanged"
    : `${originalDisposition}-to-${finalDisposition}`;

  return {
    operationId: source.operation_id,
    semanticIdentity: source.semantic_identity,
    originalDisposition,
    originalSelectionStatus: source.surface_selection_status,
    finalDisposition,
    revision,
    adjudicationStatus: override === undefined
      ? targetedReason === undefined
        ? "final-from-current-committed-evidence"
        : "provisional-targeted-proof-audit-pending"
      : finalDisposition === "ship"
      ? "final-closed-gate-override"
      : "final-explicit-disposition-override",
    preFreezeGate: gate,
    gateClosure: override?.gateClosure ?? (selected ? "not-closed" : "not-applicable"),
    evidence: override?.evidence ?? [
      "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv",
      ...(selected ? ["research/post-0.3/reconciliation/r1/STOP-CONDITION.json"] : []),
    ],
    blocker: override !== undefined && Object.hasOwn(override, "blocker")
      ? override.blocker
      : (selected
        ? `No committed receipt at the adjudicated source closes the complete gate: ${gate}.`
        : source.unresolved_evidence),
    targetedProofAuditReason: targetedReason ?? null,
    support: override?.support ?? null,
    proposedSurface: override?.surface ?? {
      kind: source.surface_kind,
      package: source.proposed_package,
      subpath: source.proposed_subpath === "none" ? null : source.proposed_subpath,
      export: source.proposed_export === "none" ? null : source.proposed_export,
      rootNamespace: source.proposed_root_export === "none" ? null : source.proposed_root_export,
    },
  };
});

const counts = Object.fromEntries(
  ["ship", "defer", "reject"].map((disposition) => [
    disposition,
    candidates.filter((candidate) => candidate.finalDisposition === disposition).length,
  ]),
);

const adjudication = {
  schema: "effect-build/surface-adjudication@1",
  date: policy.date,
  status: policy.status,
  source: {
    r1Candidates: "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv",
    r1StopCondition: "research/post-0.3/reconciliation/r1/STOP-CONDITION.json",
    policy: "research/post-0.3/freeze/SURFACE-ADJUDICATION-POLICY.json",
  },
  rule: policy.selectedCandidateRule,
  counts: {
    total: candidates.length,
    ...counts,
    targetedProofAuditPending: candidates.filter((candidate) =>
      candidate.adjudicationStatus === "provisional-targeted-proof-audit-pending"
    ).length,
  },
  candidates,
};

const csvHeaders = [
  "operation_id",
  "semantic_identity",
  "original_disposition",
  "original_selection_status",
  "final_disposition",
  "revision",
  "adjudication_status",
  "pre_freeze_gate",
  "gate_closure",
  "evidence",
  "blocker",
  "targeted_proof_audit_reason",
  "proposed_package",
  "proposed_subpath",
  "proposed_export",
  "proposed_root_namespace",
];
const csvRows = candidates.map((candidate) => [
  candidate.operationId,
  candidate.semanticIdentity,
  candidate.originalDisposition,
  candidate.originalSelectionStatus,
  candidate.finalDisposition,
  candidate.revision,
  candidate.adjudicationStatus,
  candidate.preFreezeGate,
  candidate.gateClosure,
  candidate.evidence.join(";"),
  candidate.blocker,
  candidate.targetedProofAuditReason ?? "",
  candidate.proposedSurface.package,
  candidate.proposedSurface.subpath ?? "none",
  candidate.proposedSurface.export ?? "none",
  candidate.proposedSurface.rootNamespace ?? "none",
]);
const csv = [csvHeaders, ...csvRows].map((row) => row.map(quoteCsv).join(",")).join("\n") + "\n";

const selectedCandidates = candidates.filter((candidate) => candidate.finalDisposition === "ship");
const selectedOperations = selectedCandidates.filter((candidate) =>
  candidate.proposedSurface.kind === "public-operation-export"
);
const selectedInternalStages = selectedCandidates.filter((candidate) =>
  candidate.proposedSurface.kind === "internal-stage-no-public-export"
);
const selectedOperationIds = selectedOperations.map((candidate) => candidate.operationId);
if (JSON.stringify(contractOperationIds) !== JSON.stringify(selectedOperationIds)) {
  throw new Error("frozen public contract semantics do not exactly cover the selected operations in order");
}

const coreSubpaths = [
  {
    subpath: "./Artifact",
    rootNamespace: "Artifact",
    exports: [
      "AbsolutePath",
      "DecimalBytes",
      "Digest",
      "Executable",
      "File",
      "HashedExecutable",
      "HashedFile",
      "ObservationMode",
      "Sha256Value",
      "UnhashedExecutable",
      "UnhashedFile",
    ],
    runtimeExports: ["AbsolutePath"],
    typeExports: [
      "AbsolutePath",
      "DecimalBytes",
      "Digest",
      "Executable",
      "File",
      "HashedExecutable",
      "HashedFile",
      "ObservationMode",
      "Sha256Value",
      "UnhashedExecutable",
      "UnhashedFile",
    ],
    operationIds: [],
  },
  {
    subpath: "./SystemTarget",
    rootNamespace: "SystemTarget",
    exports: ["Abi", "Architecture", "Descriptor", "OperatingSystem", "SystemTarget"],
    runtimeExports: ["Abi", "Architecture", "OperatingSystem", "SystemTarget"],
    typeExports: ["Abi", "Architecture", "Descriptor", "OperatingSystem", "SystemTarget"],
    operationIds: [],
  },
  {
    subpath: "./Matrix",
    rootNamespace: "Matrix",
    exports: ["CellIdentity", "CellResult", "Failure", "Input", "InvalidInput", "Report", "Success"],
    runtimeExports: ["InvalidInput"],
    typeExports: ["CellIdentity", "CellResult", "Failure", "Input", "InvalidInput", "Report", "Success"],
    operationIds: [],
  },
  {
    subpath: "./Author/Tool",
    rootNamespace: "Tool",
    exports: [
      "Admission",
      "CapabilityObservation",
      "ContentIdentity",
      "DecimalBytes",
      "Definition",
      "Digest",
      "Observation",
      "ParticipantIdentity",
      "Sha256Value",
      "decimalBytes",
      "define",
      "sha256Digest",
    ],
    runtimeExports: ["decimalBytes", "define", "sha256Digest"],
    typeExports: [
      "Admission",
      "CapabilityObservation",
      "ContentIdentity",
      "DecimalBytes",
      "Definition",
      "Digest",
      "Observation",
      "ParticipantIdentity",
      "Sha256Value",
    ],
    operationIds: [],
  },
  {
    subpath: "./Author/BorrowedOutput",
    rootNamespace: "BorrowedOutput",
    exports: [
      "Author",
      "DecimalBytes",
      "Digest",
      "Failure",
      "File",
      "FileObservation",
      "HashedFileObservation",
      "HashedTreeEntry",
      "HashedTreeFileEntry",
      "HashedTreeObservation",
      "ObservationMode",
      "Tree",
      "TreeDirectoryEntry",
      "TreeObservation",
      "UnhashedFileObservation",
      "UnhashedTreeEntry",
      "UnhashedTreeFileEntry",
      "UnhashedTreeObservation",
    ],
    runtimeExports: [],
    typeExports: [
      "Author",
      "DecimalBytes",
      "Digest",
      "Failure",
      "File",
      "FileObservation",
      "HashedFileObservation",
      "HashedTreeEntry",
      "HashedTreeFileEntry",
      "HashedTreeObservation",
      "ObservationMode",
      "Tree",
      "TreeDirectoryEntry",
      "TreeObservation",
      "UnhashedFileObservation",
      "UnhashedTreeEntry",
      "UnhashedTreeFileEntry",
      "UnhashedTreeObservation",
    ],
    operationIds: [],
  },
  {
    subpath: "./Author/Executable",
    rootNamespace: "Executable",
    exports: [
      "Artifact",
      "Author",
      "Failure",
      "HashedArtifact",
      "Request",
      "RuntimeObservation",
      "SystemTargetObservation",
      "UnhashedArtifact",
    ],
    runtimeExports: [],
    typeExports: [
      "Artifact",
      "Author",
      "Failure",
      "HashedArtifact",
      "Request",
      "RuntimeObservation",
      "SystemTargetObservation",
      "UnhashedArtifact",
    ],
    operationIds: [],
  },
];

const operationModuleExports = new Map([
  [
    "CAN-BUN-012",
    [
      "Artifact",
      "CompileExecutableError",
      "CompileExecutableInput",
      "CompileExecutableMatrixInput",
      "Compiler",
      "LayerOptions",
      "MatrixReport",
      "Options",
      "Target",
      "compileExecutable",
      "compileExecutableMatrix",
      "layer",
    ],
  ],
  [
    "CAN-DENO-010",
    [
      "Artifact",
      "CompileExecutableError",
      "CompileExecutableInput",
      "CompileExecutableMatrixInput",
      "Compiler",
      "LayerOptions",
      "MatrixReport",
      "Options",
      "PermissionValue",
      "Permissions",
      "Target",
      "compileExecutable",
      "compileExecutableMatrix",
      "layer",
    ],
  ],
  [
    "CAN-ESB-001",
    ["Artifact", "BuildError", "BuildInput", "Esbuild", "LayerOptions", "Options", "build", "layer"],
  ],
  [
    "CAN-ESB-011",
    ["Context", "ContextError", "Esbuild", "LayerOptions", "MakeInput", "Options", "layer", "make"],
  ],
  [
    "CAN-NODE-001",
    [
      "Artifact",
      "AssembleExecutableError",
      "AssembleExecutableInput",
      "Assembler",
      "LayerOptions",
      "assembleExecutable",
      "layer",
    ],
  ],
]);
const operationModuleRuntimeExports = new Map([
  ["CAN-BUN-012", ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]],
  ["CAN-DENO-010", ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]],
  ["CAN-ESB-001", ["Esbuild", "build", "layer"]],
  ["CAN-ESB-011", ["Esbuild", "layer", "make"]],
  ["CAN-NODE-001", ["Assembler", "assembleExecutable", "layer"]],
]);
const operationModuleTypeExports = new Map([
  [
    "CAN-BUN-012",
    [
      "Artifact",
      "CompileExecutableError",
      "CompileExecutableInput",
      "CompileExecutableMatrixInput",
      "Compiler",
      "LayerOptions",
      "MatrixReport",
      "Options",
      "Target",
    ],
  ],
  [
    "CAN-DENO-010",
    [
      "Artifact",
      "CompileExecutableError",
      "CompileExecutableInput",
      "CompileExecutableMatrixInput",
      "Compiler",
      "LayerOptions",
      "MatrixReport",
      "Options",
      "PermissionValue",
      "Permissions",
      "Target",
    ],
  ],
  ["CAN-ESB-001", ["Artifact", "BuildError", "BuildInput", "Esbuild", "LayerOptions", "Options"]],
  ["CAN-ESB-011", ["Context", "ContextError", "Esbuild", "LayerOptions", "MakeInput", "Options"]],
  [
    "CAN-NODE-001",
    ["Artifact", "AssembleExecutableError", "AssembleExecutableInput", "Assembler", "LayerOptions"],
  ],
]);

const packages = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
].map((name) => {
  const operations = selectedOperations.filter((candidate) => candidate.proposedSurface.package === name);
  const operationSubpaths = [...new Set(operations.map((candidate) => candidate.proposedSurface.subpath).filter(Boolean))]
    .sort()
    .map((subpath) => {
      const members = operations.filter((candidate) => candidate.proposedSurface.subpath === subpath);
      const exports = new Set(members.flatMap((candidate) =>
        operationModuleExports.get(candidate.operationId) ?? [candidate.proposedSurface.export]
      ));
      const runtimeExports = new Set(members.flatMap((candidate) =>
        operationModuleRuntimeExports.get(candidate.operationId) ?? [candidate.proposedSurface.export]
      ));
      const typeExports = new Set(members.flatMap((candidate) =>
        operationModuleTypeExports.get(candidate.operationId) ?? []
      ));
      return {
        subpath,
        rootNamespace: members[0].proposedSurface.rootNamespace,
        exports: [...exports].filter(Boolean).sort(),
        runtimeExports: [...runtimeExports].filter(Boolean).sort(),
        typeExports: [...typeExports].filter(Boolean).sort(),
        operationIds: members.map((candidate) => candidate.operationId).sort(),
      };
    });
  const subpaths = name === "effect-build" ? [...coreSubpaths] : operationSubpaths;
  const namespaces = subpaths.map((entry) => entry.rootNamespace).sort();
  return {
    name,
    release: "exact-lockstep-0.4.x",
    root: {
      form: "namespace-only",
      namespaces,
    },
    subpaths,
  };
});

const surfaceSemanticIdentity = (candidate, frozen) => {
  const historicalLane = frozen.compatibility.historicalR1Lane;
  const surfaceLane = frozen.compatibility.surfaceLane;
  if (historicalLane === surfaceLane) return candidate.semanticIdentity;
  const needle = ` / ${historicalLane} / `;
  if (candidate.semanticIdentity.split(needle).length !== 2) {
    throw new Error(`cannot project historical R1 lane for ${candidate.operationId}`);
  }
  return candidate.semanticIdentity.replace(needle, ` / ${surfaceLane} / `);
};

const surface = {
  schema: "effect-build/public-surface@2",
  version: "0.4.0",
  date: policy.date,
  status: policy.status,
  authority: {
    productDecisions: "research/post-0.3/freeze/PRODUCT-DECISIONS.md",
    adjudication: "research/post-0.3/freeze/SURFACE-ADJUDICATION.json",
  },
  packageTrain: {
    releasePolicy: "all admitted first-party packages publish in exact lockstep with exact same-version peers",
    packages,
    excludedPackages: [
      {
        name: "effect-build-rolldown",
        disposition: "defer",
        evidence: "research/post-0.3/freeze/R6-ROLLDOWN-VERDICTS.md",
      },
    ],
  },
  semanticContracts: {
    schema: contractFreeze.schema,
    evidence: contractFreeze.evidence,
    typeRules: contractFreeze.typeRules,
    r3Projection: contractFreeze.r3Projection,
    reviewedAdmission: contractFreeze.reviewedAdmission,
    errorContracts: contractFreeze.errorContracts,
    esbuildCandidateBoundary: contractFreeze.esbuildCandidateBoundary,
  },
  operations: selectedOperations.map((candidate) => {
    const frozen = contractByOperationId.get(candidate.operationId);
    if (frozen === undefined) throw new Error(`missing frozen contract for ${candidate.operationId}`);
    return {
      operationId: candidate.operationId,
      package: candidate.proposedSurface.package,
      subpath: candidate.proposedSurface.subpath,
      export: candidate.proposedSurface.export,
      rootNamespace: candidate.proposedSurface.rootNamespace,
      semanticIdentity: surfaceSemanticIdentity(candidate, frozen),
      r1SemanticIdentity: candidate.semanticIdentity,
      support: candidate.support,
      compatibility: frozen.compatibility,
      contract: frozen.contract,
    };
  }),
  derivedOperations: [
    {
      operationId: "BUN-COMPILE-EXECUTABLE-MATRIX",
      package: "effect-build-bun",
      subpath: "./CompileExecutable",
      export: "compileExecutableMatrix",
      rootNamespace: "CompileExecutable",
      scalarCandidate: "CAN-BUN-012",
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-BUN-012")
        ? "selected"
        : "deferred",
    },
    {
      operationId: "DENO-COMPILE-EXECUTABLE-MATRIX",
      package: "effect-build-deno",
      subpath: "./CompileExecutable",
      export: "compileExecutableMatrix",
      rootNamespace: "CompileExecutable",
      scalarCandidate: "CAN-DENO-010",
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-DENO-010")
        ? "selected"
        : "deferred",
    },
  ],
  internalStages: selectedInternalStages.map((candidate) => ({
    operationId: candidate.operationId,
    package: candidate.proposedSurface.package,
    semanticIdentity: candidate.semanticIdentity,
  })),
  productDecisionsPendingAdmission: {
    bunSelectedCommand: {
      scalarName: "compileExecutable",
      matrixName: "compileExecutableMatrix",
      scalarCandidate: "CAN-BUN-012",
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-BUN-012")
        ? "selected"
        : "deferred-pending-full-r1-gate-closure",
    },
    denoSelectedCommand: {
      scalarName: "compileExecutable",
      matrixName: "compileExecutableMatrix",
      scalarCandidate: "CAN-DENO-010",
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-DENO-010")
        ? "selected"
        : "deferred-pending-full-r1-gate-closure",
    },
    bunHostApiExecutable: {
      operationName: "build",
      candidate: "CAN-BUN-011",
      status: "deferred-pending-full-r1-gate-closure",
      note: "If admitted later, M3 requires this to be a mode of Bun Build rather than CompileExecutableApi.",
    },
    nodeSeaDirect: {
      operationName: "assembleExecutable",
      candidate: "CAN-NODE-001",
      legacyPreparationBlobCandidate: {
        operationId: "CAN-NODE-002",
        status: "deferred-legacy-only",
      },
      legacyInjectionCandidate: {
        operationId: "CAN-NODE-003",
        status: "deferred-legacy-only",
      },
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-NODE-001")
        ? "selected"
        : "deferred-pending-full-r1-gate-closure",
    },
  },
  supportSemantics: {
    selectedCommandAuthority: {
      explicit: "an explicit absolute executable path always wins",
      implicit: "otherwise perform one deterministic PATH search at Layer construction",
      identity: "bind the selected executable full-content identity for the Layer lifetime",
      reauthentication: "reauthenticate identity at each launch boundary",
      prohibited: ["installation", "candidate retry", "fallback", "operation-time substitution"],
    },
    executableMatrix: {
      status: selectedOperations.some((candidate) => candidate.operationId === "CAN-BUN-012")
          && selectedOperations.some((candidate) => candidate.operationId === "CAN-DENO-010")
        ? "selected"
        : "contract-proved-but-not-admitted-without-both-provider-scalars",
      evidence: "research/post-0.3/freeze/R7-MATRIX-LAWS.md",
      homogeneousProviderAndOperation: true,
      deterministicInputIndexIdentity: true,
      boundedConcurrency: true,
      scalarInvocations: "exactly once per started cell",
      completionOrder: "input ordered Success or typed Failure cells on normal completion",
      publication: "independent single-file commits with no rollback",
      defectAndInterruption: "Effect Cause; never translated to cell failure",
      interruption: "do not start queued cells; preserve already committed artifacts",
    },
    providerDirectDurability: "Provider-direct durable writes are not upgraded to atomic publication unless the exact operation says atomic-published-durable.",
    stability: "No experimental label weakens a missing executable proof or broadens an exact provider/version/host support cell.",
  },
  deferredCandidates: candidateVerdicts.candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    disposition: candidate.disposition,
    blockingFacts: candidate.blockingFacts,
  })),
  coreSurface: {
    status: "frozen-from-committed-r3-r4-author-contract",
    subpaths: coreSubpaths,
    contracts: contractFreeze.coreContracts,
    note: "The three Author module export lists come from committed R3/R4 research. Artifact and BorrowedOutput re-export Tool's one canonical scalar type identity; Artifact, SystemTarget, and Matrix are the exact shared vocabulary required by selected operations.",
  },
};

const generatedArtifacts = [
  [adjudicationJsonPath, renderJson(adjudication)],
  [adjudicationCsvPath, csv],
  [surfacePath, renderJson(surface)],
];
if (checkOnly) {
  const drifted = [];
  for (const [path, expected] of generatedArtifacts) {
    const actual = await readFile(path, "utf8").catch(() => undefined);
    if (actual !== expected) drifted.push(path.slice(repositoryRoot.length + 1));
  }
  if (drifted.length > 0) {
    throw new Error(`generated surface artifacts are stale: ${drifted.join(", ")}`);
  }
} else {
  await Promise.all(generatedArtifacts.map(([path, contents]) => writeFile(path, contents)));
}

console.log(JSON.stringify({
  mode: checkOnly ? "check" : "write",
  candidates: candidates.length,
  counts,
  selectedOperations: selectedOperations.map((candidate) => candidate.operationId),
  selectedInternalStages: selectedInternalStages.map((candidate) => candidate.operationId),
}));

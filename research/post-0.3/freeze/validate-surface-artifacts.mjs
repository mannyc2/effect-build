import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(root, "../../..");
const execFileAsync = promisify(execFile);
const fail = (message) => {
  throw new Error(message);
};
const unique = (values, label) => {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
};

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
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (quoted) fail("unterminated quoted CSV field");
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const [headers, ...rows] = records;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sourceRows = parseCsv(
  await readFile(join(repositoryRoot, "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv"), "utf8"),
);
const stop = await readJson(join(repositoryRoot, "research/post-0.3/reconciliation/r1/STOP-CONDITION.json"));
const policy = await readJson(join(root, "SURFACE-ADJUDICATION-POLICY.json"));
const adjudication = await readJson(join(root, "SURFACE-ADJUDICATION.json"));
const adjudicationCsv = parseCsv(await readFile(join(root, "SURFACE-ADJUDICATION.csv"), "utf8"));
const surface = await readJson(join(root, "SURFACE.json"));
const candidateVerdicts = await readJson(join(root, "CANDIDATE-VERDICTS.json"));

const git = async (...args) =>
  (await execFileAsync("git", args, { cwd: repositoryRoot, encoding: "utf8" })).stdout.trim();
const production = policy.unchangedProductionEvidence;
if (await git("rev-parse", `${production.baseline}^{commit}`) !== production.baselineSourceSha) {
  fail("v0.3 baseline source identity drift");
}
if (await git("rev-parse", `${production.baseline}:packages`) !== production.packagesTree) {
  fail("v0.3 packages tree identity drift");
}
if (await git("rev-parse", "HEAD:packages") !== production.packagesTree) {
  fail("adjudicated HEAD packages differ from admitted v0.3 bytes");
}
if (await git("rev-parse", `${production.baseline}:tooling/public-api.json`) !== production.publicApiBlob) {
  fail("v0.3 public API inventory identity drift");
}
if (await git("rev-parse", "HEAD:tooling/public-api.json") !== production.publicApiBlob) {
  fail("adjudicated HEAD public API inventory differs from admitted v0.3 bytes");
}
if ((await git("diff", "--name-only", `${production.baseline}..HEAD`, "--", ...production.requiredEmptyDiffPaths)).length > 0) {
  fail("adjudicated HEAD changes production/package-lock/public-API bytes used for admission");
}

if (adjudication.schema !== "effect-build/surface-adjudication@1") fail("unexpected adjudication schema");
if (surface.schema !== "effect-build/public-surface@1") fail("unexpected surface schema");
if (policy.status !== "frozen" || adjudication.status !== "frozen" || surface.status !== "frozen") {
  fail("surface artifacts are not frozen");
}
if (sourceRows.length !== 67) fail(`R1 candidate count changed from 67 to ${sourceRows.length}`);
if (stop.surface_freeze_blockers.length !== 29) fail("R1 selected blocker count changed");
if (adjudication.candidates.length !== sourceRows.length) fail("adjudication does not cover every R1 row");
if (adjudicationCsv.length !== sourceRows.length) fail("adjudication CSV does not cover every R1 row");

const sourceIds = sourceRows.map((row) => row.operation_id);
const adjudicationIds = adjudication.candidates.map((candidate) => candidate.operationId);
const csvIds = adjudicationCsv.map((row) => row.operation_id);
unique(sourceIds, "R1 source operation IDs");
unique(adjudicationIds, "adjudication operation IDs");
unique(csvIds, "adjudication CSV operation IDs");
if (JSON.stringify(adjudicationIds) !== JSON.stringify(sourceIds)) fail("adjudication order or membership differs from R1");
if (JSON.stringify(csvIds) !== JSON.stringify(sourceIds)) fail("adjudication CSV order or membership differs from R1");

const sourceById = new Map(sourceRows.map((row) => [row.operation_id, row]));
const blockerById = new Map(stop.surface_freeze_blockers.map((row) => [row.operation_id, row.pre_freeze_gate]));
const overrideById = new Map(policy.adjudicationOverrides.map((row) => [row.operationId, row]));
const targetedIds = policy.targetedProofAudit.map((row) => row.operationId);
unique(targetedIds, "targeted proof audit IDs");
for (const id of targetedIds) {
  if (!blockerById.has(id)) fail(`targeted proof audit ${id} is not an R1 selected blocker`);
}

for (let index = 0; index < adjudication.candidates.length; index += 1) {
  const candidate = adjudication.candidates[index];
  const csv = adjudicationCsv[index];
  const source = sourceById.get(candidate.operationId);
  if (source === undefined) fail(`unknown adjudication candidate ${candidate.operationId}`);
  if (!["ship", "defer", "reject"].includes(candidate.finalDisposition)) {
    fail(`invalid final disposition for ${candidate.operationId}`);
  }
  if (candidate.originalDisposition !== source.freeze_recommendation) {
    fail(`original disposition drift for ${candidate.operationId}`);
  }
  if (candidate.semanticIdentity !== source.semantic_identity) fail(`semantic identity drift for ${candidate.operationId}`);
  if (source.surface_selection_status === "not-selected-rejected" && candidate.finalDisposition !== "reject") {
    fail(`rejected R1 operation reopened without an explicit product decision: ${candidate.operationId}`);
  }
  if (source.surface_selection_status === "selected-candidate-not-frozen") {
    if (candidate.preFreezeGate !== blockerById.get(candidate.operationId)) {
      fail(`selected candidate gate drift for ${candidate.operationId}`);
    }
    if (!overrideById.has(candidate.operationId) && candidate.finalDisposition !== "defer") {
      fail(`unproved selected candidate ${candidate.operationId} must defer`);
    }
    if (candidate.gateClosure === "not-closed" && candidate.blocker.length === 0) {
      fail(`unproved selected candidate ${candidate.operationId} has no blocker`);
    }
  }
  if (candidate.finalDisposition === "ship") {
    const override = overrideById.get(candidate.operationId);
    if (override?.gateClosure !== "closed" || override.evidence.length === 0) {
      fail(`ship candidate ${candidate.operationId} lacks an explicit closed-gate evidence override`);
    }
    if (["CAN-BUN-012", "CAN-DENO-010", "CAN-NODE-001"].includes(candidate.operationId)) {
      for (const identity of [
        `git-tree:packages=${production.packagesTree}`,
        `git-blob:tooling/public-api.json=${production.publicApiBlob}`,
        `git-diff:v0.3.0..adjudicated-head:packages,package.json,bun.lock,tooling/public-api.json=empty`,
      ]) {
        if (!override.evidence.includes(identity)) {
          fail(`ship candidate ${candidate.operationId} lacks unchanged-production evidence ${identity}`);
        }
      }
    }
  }
  const csvPairs = {
    semantic_identity: candidate.semanticIdentity,
    original_disposition: candidate.originalDisposition,
    final_disposition: candidate.finalDisposition,
    revision: candidate.revision,
    adjudication_status: candidate.adjudicationStatus,
    pre_freeze_gate: candidate.preFreezeGate,
    gate_closure: candidate.gateClosure,
    blocker: candidate.blocker,
  };
  for (const [key, value] of Object.entries(csvPairs)) {
    if (csv[key] !== value) fail(`CSV/JSON mismatch for ${candidate.operationId}.${key}`);
  }
}

const computedCounts = Object.fromEntries(
  ["ship", "defer", "reject"].map((disposition) => [
    disposition,
    adjudication.candidates.filter((candidate) => candidate.finalDisposition === disposition).length,
  ]),
);
for (const [key, value] of Object.entries(computedCounts)) {
  if (adjudication.counts[key] !== value) fail(`adjudication count mismatch for ${key}`);
}
if (adjudication.counts.total !== sourceRows.length) fail("adjudication total count mismatch");
const exactShipIds = ["CAN-BUN-012", "CAN-DENO-010", "CAN-ESB-001", "CAN-ESB-011", "CAN-NODE-001"];
const actualShipIds = adjudication.candidates
  .filter((candidate) => candidate.finalDisposition === "ship")
  .map((candidate) => candidate.operationId);
if (JSON.stringify(actualShipIds) !== JSON.stringify(exactShipIds)) fail("frozen R1 ship set changed");
if (policy.targetedProofAudit.length !== 0 || adjudication.counts.targetedProofAuditPending !== 0) {
  fail("frozen adjudication retains a pending targeted proof audit");
}

const exactPackages = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];
const packageNames = surface.packageTrain.packages.map((entry) => entry.name);
if (JSON.stringify(packageNames) !== JSON.stringify(exactPackages)) fail("surface does not contain the exact five-package train");
unique(packageNames, "surface package names");
if (packageNames.includes("effect-build-rolldown")) fail("Rolldown entered the selected package train");
if (!surface.packageTrain.excludedPackages.some((entry) =>
  entry.name === "effect-build-rolldown" && entry.disposition === "defer"
)) fail("Rolldown defer is missing");
const exactSubpaths = new Map([
  [
    "effect-build",
    ["./Artifact", "./SystemTarget", "./Matrix", "./Author/Tool", "./Author/BorrowedOutput", "./Author/Executable"],
  ],
  ["effect-build-bun", ["./CompileExecutable"]],
  ["effect-build-deno", ["./CompileExecutable"]],
  ["effect-build-esbuild", ["./Build", "./Context"]],
  ["effect-build-node-sea", ["./AssembleExecutable"]],
]);
for (const packageEntry of surface.packageTrain.packages) {
  const expected = exactSubpaths.get(packageEntry.name);
  const actual = packageEntry.subpaths.map((entry) => entry.subpath);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${packageEntry.name} frozen subpath set changed`);
}

const shipped = adjudication.candidates.filter((candidate) => candidate.finalDisposition === "ship");
if (surface.operations.length !== shipped.filter((candidate) => candidate.proposedSurface.kind === "public-operation-export").length) {
  fail("surface operation count differs from shipped public R1 operations");
}
const surfaceOperationIds = surface.operations.map((operation) => operation.operationId);
unique(surfaceOperationIds, "surface operation IDs");
for (const operation of surface.operations) {
  const candidate = adjudication.candidates.find((entry) => entry.operationId === operation.operationId);
  if (candidate?.finalDisposition !== "ship") fail(`non-ship candidate entered surface: ${operation.operationId}`);
  if (operation.package !== candidate.proposedSurface.package
    || operation.subpath !== candidate.proposedSurface.subpath
    || operation.export !== candidate.proposedSurface.export
    || operation.rootNamespace !== candidate.proposedSurface.rootNamespace) {
    fail(`surface coordinates drift for ${operation.operationId}`);
  }
}

for (const packageEntry of surface.packageTrain.packages) {
  if (packageEntry.root.form !== "namespace-only") fail(`${packageEntry.name} root is not namespace-only`);
  unique(packageEntry.root.namespaces, `${packageEntry.name} root namespaces`);
  unique(packageEntry.subpaths.map((entry) => entry.subpath), `${packageEntry.name} subpaths`);
  const subpathNamespaces = packageEntry.subpaths.map((entry) => entry.rootNamespace).sort();
  if (JSON.stringify([...packageEntry.root.namespaces].sort()) !== JSON.stringify(subpathNamespaces)) {
    fail(`${packageEntry.name} root namespaces do not exactly match subpaths`);
  }
  for (const subpath of packageEntry.subpaths) {
    if (!subpath.subpath.startsWith("./")) fail(`invalid public subpath ${packageEntry.name}/${subpath.subpath}`);
    unique(subpath.exports, `${packageEntry.name}${subpath.subpath} exports`);
    unique(subpath.runtimeExports, `${packageEntry.name}${subpath.subpath} runtime exports`);
    unique(subpath.typeExports, `${packageEntry.name}${subpath.subpath} type exports`);
    const classified = [...new Set([...subpath.runtimeExports, ...subpath.typeExports])].sort();
    if (JSON.stringify(classified) !== JSON.stringify([...subpath.exports].sort())) {
      fail(`${packageEntry.name}${subpath.subpath} has unclassified or extraneous exports`);
    }
    unique(subpath.operationIds, `${packageEntry.name}${subpath.subpath} operation IDs`);
  }
}

const deferredVerdictIds = surface.deferredCandidates.map((entry) => entry.id);
const expectedDeferredVerdictIds = candidateVerdicts.candidates.map((entry) => entry.id);
if (JSON.stringify(deferredVerdictIds) !== JSON.stringify(expectedDeferredVerdictIds)) {
  fail("R5/R6 deferred candidate membership drift");
}
if (surface.deferredCandidates.some((entry) => entry.disposition !== "defer")) fail("a selected R5/R6 candidate is not deferred");
if (surface.coreSurface.status !== "frozen-from-committed-r3-r4-author-contract") {
  fail("core surface is not bound to the committed R3/R4 Author contract");
}
if (surface.supportSemantics.executableMatrix.status === "selected"
  && !(surfaceOperationIds.includes("CAN-BUN-012") && surfaceOperationIds.includes("CAN-DENO-010"))) {
  fail("matrix selected without both provider scalar operations");
}
const byOperationId = new Map(surface.operations.map((operation) => [operation.operationId, operation]));
if (byOperationId.get("CAN-BUN-012")?.support?.providerHost !== "ubuntu-24.04/linux-x64"
  || byOperationId.get("CAN-BUN-012")?.support?.exactVersion !== "1.3.9") {
  fail("Bun support broadened beyond the directly certified tool/host coordinate");
}
if (byOperationId.get("CAN-DENO-010")?.support?.providerHost !== "ubuntu-24.04/linux-x64"
  || byOperationId.get("CAN-DENO-010")?.support?.exactVersion !== "2.9.3") {
  fail("Deno support broadened beyond the directly certified tool/host coordinate");
}
if (byOperationId.get("CAN-NODE-001")?.support?.hostTarget !== "linux-x64-gnu"
  || byOperationId.get("CAN-NODE-001")?.support?.exactVersion !== "26.7.0") {
  fail("Node SEA support broadened beyond the directly certified tool/host coordinate");
}
for (const [operationId, claim] of [
  ["CAN-ESB-001", "receipt:r4-author-laws:esbuild-one-shot-interruption-law"],
  ["CAN-ESB-011", "receipt:r4-author-laws:esbuild-context-lifecycle-matrix"],
]) {
  const operation = byOperationId.get(operationId);
  const override = overrideById.get(operationId);
  if (operation?.support?.exactVersion !== "0.28.2"
    || operation?.support?.providerHost !== "ubuntu-24.04/linux-x64") {
    fail(`${operationId} support broadened beyond esbuild 0.28.2 on Linux x64`);
  }
  if (!override?.evidence.includes(claim)) fail(`${operationId} lacks exact R4 receipt claim ${claim}`);
}
for (const legacyId of ["CAN-NODE-002", "CAN-NODE-003"]) {
  const legacy = adjudication.candidates.find((candidate) => candidate.operationId === legacyId);
  if (legacy?.finalDisposition !== "defer"
    || legacy.gateClosure !== "not-applicable-deferred-legacy-only"
    || !legacy.blocker.startsWith("Deferred-legacy-only:")) {
    fail(`${legacyId} is not explicitly deferred-legacy-only`);
  }
}
const requiredCore = new Map([
  ["./Artifact", "Artifact"],
  ["./SystemTarget", "SystemTarget"],
  ["./Matrix", "Matrix"],
  ["./Author/Tool", "Tool"],
  ["./Author/BorrowedOutput", "BorrowedOutput"],
  ["./Author/Executable", "Executable"],
]);
const corePackage = surface.packageTrain.packages.find((entry) => entry.name === "effect-build");
for (const [subpath, namespace] of requiredCore) {
  const entry = corePackage?.subpaths.find((candidate) => candidate.subpath === subpath);
  if (entry?.rootNamespace !== namespace) fail(`missing or misnamed core subpath ${subpath}`);
}
if (surface.coreSurface.contracts.Artifact.DecimalBytes.includes("safe integer")) {
  fail("core DecimalBytes regressed to a bounded JavaScript number");
}
const exactAuthorExports = new Map([
  [
    "./Author/Tool",
    [
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
  ],
  [
    "./Author/BorrowedOutput",
    [
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
  ],
  [
    "./Author/Executable",
    [
      "Artifact",
      "Author",
      "Failure",
      "HashedArtifact",
      "Request",
      "RuntimeObservation",
      "SystemTargetObservation",
      "UnhashedArtifact",
    ],
  ],
]);
for (const [subpath, expected] of exactAuthorExports) {
  const actual = corePackage.subpaths.find((entry) => entry.subpath === subpath)?.exports;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${subpath} differs from the committed R3/R4 export list`);
}
const borrowedExports = corePackage.subpaths.find((entry) => entry.subpath === "./Author/BorrowedOutput")?.exports ?? [];
for (const name of ["DecimalBytes", "Digest"]) {
  if (!borrowedExports.includes(name)) fail(`BorrowedOutput is missing committed scalar type re-export ${name}`);
}

console.log(JSON.stringify({
  result: "PASS",
  candidates: sourceRows.length,
  dispositions: computedCounts,
  selectedPackages: packageNames,
  selectedOperations: surfaceOperationIds,
  targetedProofAuditPending: targetedIds,
}));

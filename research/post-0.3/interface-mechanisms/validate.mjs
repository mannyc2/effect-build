import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  architectureCandidates,
  currentTsTraceSha256,
  mechanismFamilies,
  operations,
  portfolioRelations,
  portfolioSelections,
} from "./research-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const failures = [];
const pass = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (name) => readFile(join(here, name), "utf8");
const json = async (name) => JSON.parse(await read(name));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitMaybe = (...args) => {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};
const lines = (value) => value.split("\n").filter(Boolean);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceSetSha256 = (sources) => sha256(sources
  .map(({ path, sha256: digest }) => `${path}\0${digest}\n`)
  .join(""));

const parseCsv = (source) => {
  const rows = [];
  let row = [];
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
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  pass(!quoted, "CSV ended inside a quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...values] = rows;
  pass(Boolean(header), "CSV has no header");
  return values.map((cells, rowIndex) => {
    pass(cells.length === header.length, `CSV row ${rowIndex + 2} has ${cells.length} cells; expected ${header.length}`);
    return Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""]));
  });
};

const ground = await json("GROUND-TRUTH.json");
const expected = await json("EXPECTED-CONCLUSIONS.json");
const summary = await json("receipts/summary.json");
const summaryProbes = Array.isArray(summary.probes) ? summary.probes : [];
const inventory = parseCsv(await read("OPERATION-INVENTORY.csv"));
const coverage = parseCsv(await read("MECHANISM-COVERAGE.csv"));
const decisions = parseCsv(await read("DECISION-MATRIX.csv"));
const traces = parseCsv(await read("CURRENT-TS-TRACE.csv"));
pass(ground.schema === "effect-build/interface-mechanism-ground-truth@2", "ground-truth schema differs");
pass(
  sha256(await read("CURRENT-TS-TRACE.csv")) === currentTsTraceSha256,
  "current TypeScript trace contents differ from the reviewed canonical digest",
);
const report = await read("REPORT.md");
try {
  execFileSync(process.execPath, [join(here, "generate-ledgers.mjs"), "--check"], {
    cwd: root,
    encoding: "utf8",
  });
} catch (error) {
  failures.push(`generated ledgers differ from research-data.mjs: ${error instanceof Error ? error.message : String(error)}`);
}

const operationIds = operations.map(({ id }) => id);
const mechanismIds = mechanismFamilies.map(([id]) => id);
const architectureIds = architectureCandidates.map(([id]) => id);

pass(inventory.length === operations.length, `operation inventory has ${inventory.length}; expected ${operations.length}`);
pass(
  JSON.stringify(inventory.map(({ operation_id: id }) => id)) === JSON.stringify(operationIds),
  "operation inventory ID set/order differs from the canonical research-data inventory",
);
pass(new Set(inventory.map(({ operation_id: id }) => id)).size === inventory.length, "operation inventory IDs are duplicated");
const requiredInventoryFields = [
  "operation_id", "provider", "operation", "status", "versions", "evidence", "recommended_boundary",
];
for (const operation of inventory) {
  for (const field of requiredInventoryFields) {
    pass(Boolean(operation[field]?.trim()), `operation inventory ${operation.operation_id || "<missing>"} has empty ${field}`);
  }
  const source = operations.find(({ id }) => id === operation.operation_id);
  pass(operation.provider === source?.provider, `operation inventory ${operation.operation_id} provider differs`);
  pass(operation.operation === source?.operation, `operation inventory ${operation.operation_id} operation label differs`);
  pass(operation.status === source?.status, `operation inventory ${operation.operation_id} status differs`);
  pass(operation.versions === source?.versions, `operation inventory ${operation.operation_id} versions differ`);
  pass(operation.evidence === source?.evidence, `operation inventory ${operation.operation_id} evidence differs`);
  pass(operation.recommended_boundary === source?.recommendation, `operation inventory ${operation.operation_id} recommendation differs`);
}
pass(coverage.length === operations.length * mechanismFamilies.length, `mechanism coverage has ${coverage.length}; expected ${operations.length * mechanismFamilies.length}`);
pass(decisions.length === operations.length * architectureCandidates.length, `decision matrix has ${decisions.length}; expected ${operations.length * architectureCandidates.length}`);
const expectedTraceSurfaces = [
  "effect-build.JavaScriptBundle.withFile",
  "effect-build/Integration.executeCommand",
  "effect-build/Integration.inspectLiveJavaScriptBundle",
  "effect-build/Integration.withOwnedJavaScriptBundle",
  "effect-build/Integration.produceExecutable",
  "effect-build/Provider.define",
  "effect-build-bun.layer",
  "effect-build-bun.compileExecutable / Compiler.compileExecutable",
  "effect-build-bun.compileExecutableMatrix / Compiler.compileExecutableMatrix",
  "effect-build-bun.withJavaScriptBundle / Compiler.withJavaScriptBundle",
  "effect-build-deno.layer",
  "effect-build-deno.compileExecutable / Compiler.compileExecutable",
  "effect-build-deno.compileExecutableMatrix / Compiler.compileExecutableMatrix",
  "effect-build-esbuild.layer",
  "effect-build-esbuild.withJavaScriptBundle / Esbuild.withJavaScriptBundle",
  "effect-build-node-sea.layer",
  "effect-build-node-sea.createExecutable / NodeSea.createExecutable",
];
pass(
  JSON.stringify(traces.map(({ surface }) => surface)) === JSON.stringify(expectedTraceSurfaces),
  "current TypeScript trace surface set/order differs from the exact exported operation/factory inventory",
);
pass(new Set(traces.map(({ surface }) => surface)).size === traces.length, "current TypeScript trace surfaces are duplicated");
const requiredTraceFields = [
  "surface", "kind", "caller_surface", "execution_location", "transport", "selection_authority",
  "state_lifetime", "trace", "actual_work_owner", "outputs", "interruption_and_cleanup", "evidence",
];
for (const trace of traces) {
  for (const field of requiredTraceFields) {
    pass(Boolean(trace[field]?.trim()), `current TypeScript trace ${trace.surface || "<missing>"} has empty ${field}`);
  }
}

const coverageKeys = new Set(coverage.map(({ operation_id: op, mechanism_family: mechanism }) => `${op}\0${mechanism}`));
for (const operation of operationIds) {
  for (const mechanism of mechanismIds) {
    pass(coverageKeys.has(`${operation}\0${mechanism}`), `missing mechanism record ${operation} x ${mechanism}`);
  }
}
pass(coverageKeys.size === coverage.length, "mechanism coverage contains duplicate operation/family rows");

const requiredCoverageFields = [
  "provider", "operation_id", "operation", "mechanism_family", "mechanism", "availability", "authority", "inputs_results", "lifetime", "outputs",
  "host_distribution", "compatibility", "operations_fit", "complexity_ledger", "effect_mapping",
  "verdict", "confidence", "evidence",
];
for (const row of coverage) {
  for (const field of requiredCoverageFields) {
    pass(Boolean(row[field]?.trim()), `mechanism record ${row.operation_id}/${row.mechanism_family} has empty ${field}`);
  }
  const operation = operations.find(({ id }) => id === row.operation_id);
  pass(row.provider === operation?.provider, `mechanism record ${row.operation_id}/${row.mechanism_family} provider differs`);
  pass(row.operation === operation?.operation, `mechanism record ${row.operation_id}/${row.mechanism_family} operation label differs`);
}

const decisionKeys = new Set(decisions.map(({ operation_id: op, candidate_id: architecture }) => `${op}\0${architecture}`));
for (const operation of operationIds) {
  for (const architecture of architectureIds) {
    pass(decisionKeys.has(`${operation}\0${architecture}`), `missing decision record ${operation} x ${architecture}`);
  }
}
pass(decisionKeys.size === decisions.length, "decision matrix contains duplicate operation/architecture rows");
const requiredDecisionFields = [
  "provider", "operation_id", "candidate_id", "candidate", "representative_mechanism", "portfolio_relation", "semantic_fidelity",
  "selected_identity", "host_independence", "callbacks_handles", "project_authority", "lifecycle_isolation",
  "incremental_backpressure", "output_ownership", "stability_coupling", "performance_copies",
  "distribution_security", "testability_observability", "effect_reuse", "complexity", "decision", "falsifier",
];
for (const row of decisions) {
  for (const field of requiredDecisionFields) {
    pass(Boolean(row[field]?.trim()), `decision record ${row.operation_id}/${row.candidate_id} has empty ${field}`);
  }
  const operation = operations.find(({ id }) => id === row.operation_id);
  const architecture = architectureCandidates.find(([id]) => id === row.candidate_id);
  pass(row.provider === operation?.provider, `decision record ${row.operation_id}/${row.candidate_id} provider differs`);
  pass(row.candidate === architecture?.[1], `decision record ${row.operation_id}/${row.candidate_id} candidate label differs`);
  if (row.candidate_id !== "F") {
    const representativeFamilies = row.representative_mechanism.split("+");
    pass(
      representativeFamilies.every((family) => architecture?.[2].includes(family)),
      `decision record ${row.operation_id}/${row.candidate_id} representative mechanism is outside its architecture family set`,
    );
  } else {
    pass(
      row.portfolio_relation === (portfolioRelations[row.operation_id] ?? "single selected route"),
      `decision record ${row.operation_id}/F portfolio relation differs`,
    );
  }
}
for (const operation of operations.filter(({ id }) => portfolioSelections[id].length > 1)) {
  pass(Boolean(portfolioRelations[operation.id]), `composite portfolio ${operation.id} has no explicit route/adjunct relation`);
}
for (const operation of operations) {
  const portfolio = decisions.find((row) => row.operation_id === operation.id && row.candidate_id === "F");
  pass(portfolio?.representative_mechanism === portfolioSelections[operation.id].join("+"), `portfolio mechanism differs for ${operation.id}`);
  pass(portfolio?.decision === operation.recommendation, `portfolio decision differs from operation recommendation for ${operation.id}`);
  const selectedRows = portfolioSelections[operation.id].map((family) => coverage.find(
    (row) => row.operation_id === operation.id && row.mechanism_family === family,
  ));
  pass(selectedRows.every(Boolean), `portfolio references a missing mechanism for ${operation.id}`);
  const deliberateNegative = /^reject\b/i.test(operation.recommendation);
  if (deliberateNegative) {
    pass(portfolio?.semantic_fidelity.startsWith("GATE-FAIL"), `negative portfolio must gate-fail for ${operation.id}`);
  } else {
    pass(
      selectedRows.every((row) => row && !row.verdict.startsWith("bounded negative")),
      `portfolio selects a mechanism that does not help ${operation.id}`,
    );
  }
}

pass(expected.taxonomy.cliVersusHostApiIsValidTopLevelBinary === false, "expected taxonomy must reject CLI/API as a top-level binary");
pass(expected.portfolio.universalMechanismSelected === false, "expected conclusions must reject a universal mechanism");
pass(expected.portfolio.preferredArchitecture === "F", "architecture F must be the expected portfolio");
pass(expected.freeze.disposition === "unchanged-confirmed", "final-baseline freeze disposition must be unchanged and confirmed");
pass(expected.freeze.admittedOperationSetChanged === false, "research must not change admitted operations");
pass(expected.freeze.thisStudyAuthorizesPlan039 === false, "this study must not authorize Plan 039");
pass(expected.freeze.repositoryPlan039StatusAtFinalBaseline === "READY", "repository Plan 039 status must record the independently integrated READY state");
pass(expected.freeze.plan039ProductionBegun === false, "this study must not begin Plan 039 production work");
pass(
  expected.freeze.productionChangedByThisStudy === false && expected.freeze.releaseStateChangedByThisStudy === false,
  "this study must not change production or release state",
);
pass(expected.providerBoundaries.esbuildBuildAndContextExecution === "package-owned-native-service-child", "esbuild topology conclusion is not pinned");
pass(expected.providerBoundaries.rolldown === "freeze-deferred", "Rolldown must remain deferred");

const expectedProbeIds = Object.keys(expected.requiredProbeAssertions);
const observedProbeIds = summaryProbes.map(({ id }) => id);
pass(JSON.stringify(observedProbeIds) === JSON.stringify(expectedProbeIds), `probe set/order ${JSON.stringify(observedProbeIds)} differs from expected ${JSON.stringify(expectedProbeIds)}`);
pass(summary.schema === "effect-build/interface-mechanism-probe-summary@2", `probe summary schema is ${summary.schema}; expected @2`);
pass(summary.cohort?.schema === "effect-build/interface-mechanism-probe-cohort@1", "probe summary has no @1 cohort record");
pass(summary.cohort?.id === "effect-build/interface-mechanism-probes@1", "probe cohort identity differs");
pass(typeof summary.cohort?.runId === "string" && summary.cohort.runId.length > 0, "probe cohort has no runId");
pass(
  summary.cohort !== undefined && summary.cohortSha256 === sha256(JSON.stringify(summary.cohort)),
  "probe cohort digest differs from canonical cohort record",
);

const expectedProbeSources = {
  "bun-sidecar": [
    "research/post-0.3/interface-mechanisms/probes/bun-direct-plugin.ts",
    "research/post-0.3/interface-mechanisms/probes/bun-sidecar-probe.mjs",
    "research/post-0.3/interface-mechanisms/probes/bun-sidecar-server.ts",
  ],
  "esbuild-js-service": ["research/post-0.3/interface-mechanisms/probes/esbuild-js-service-probe.mjs"],
  "esbuild-wasm-browser": ["research/post-0.3/interface-mechanisms/probes/esbuild-wasm-browser-probe.mjs"],
  "node-postject": ["research/post-0.3/interface-mechanisms/probes/node-postject-probe.mjs"],
};
const expectedProbeMetadata = {
  "bun-sidecar": {
    probe: "bun-transpiler-sidecar",
    classification: "research-prototype-not-product-code",
  },
  "esbuild-js-service": {
    probe: "esbuild-js-native-service",
    classification: "current-provider-mechanism-trace",
  },
  "esbuild-wasm-browser": {
    probe: "esbuild-wasm-browser-worker",
    classification: "research-prototype-not-product-code",
  },
  "node-postject": {
    probe: "node-direct-sea-and-programmatic-postject",
    classification: "official-direct-baseline-plus-third-party-programmatic-alternative",
  },
};
const expectedRunnerPath = "research/post-0.3/interface-mechanisms/run-probes.mjs";
pass(summary.cohort?.runner?.path === expectedRunnerPath, "cohort runner path differs");
const cohortSources = summary.cohort?.sources ?? [];
pass(new Set(cohortSources.map(({ path }) => path)).size === cohortSources.length, "cohort source paths are duplicated");
const expectedCohortSourcePaths = [
  expectedRunnerPath,
  "research/post-0.3/interface-mechanisms/EXPECTED-CONCLUSIONS.json",
  ...Object.values(expectedProbeSources).flat(),
].sort();
pass(
  JSON.stringify(cohortSources.map(({ path }) => path)) === JSON.stringify(expectedCohortSourcePaths),
  "cohort source set differs from the fail-closed expectation",
);
pass(summary.cohort?.sourceSha256 === sourceSetSha256(cohortSources), "cohort source-set digest differs");
for (const source of cohortSources) {
  const absolute = resolve(root, source.path);
  pass(absolute.startsWith(`${root}${sep}`), `cohort source escapes repository: ${source.path}`);
  try {
    pass(sha256(await readFile(absolute)) === source.sha256, `current source digest differs for ${source.path}`);
  } catch (error) {
    failures.push(`cannot verify cohort source ${source.path}: ${error}`);
  }
}

const receiptById = new Map();
for (const probe of summaryProbes) {
  pass(probe.assertions && typeof probe.assertions === "object", `probe ${probe.id} has no assertion map`);
  const expectedAssertionNames = expected.requiredProbeAssertions[probe.id] ?? [];
  const observedAssertionNames = Object.keys(probe.assertions ?? {});
  pass(
    JSON.stringify(observedAssertionNames) === JSON.stringify(expectedAssertionNames),
    `probe ${probe.id} assertion set/order ${JSON.stringify(observedAssertionNames)} differs from expected ${JSON.stringify(expectedAssertionNames)}`,
  );
  for (const [name, value] of Object.entries(probe.assertions ?? {})) {
    pass(value === true, `probe ${probe.id} assertion ${name} is not true`);
  }
  const expectedSources = expectedProbeSources[probe.id] ?? [];
  pass(
    JSON.stringify(probe.sources?.map(({ path }) => path)) === JSON.stringify(expectedSources),
    `probe ${probe.id} source set differs from the fail-closed expectation`,
  );
  pass(probe.sourceSha256 === sourceSetSha256(probe.sources ?? []), `probe ${probe.id} source-set digest differs`);
  const cohortProbe = summary.cohort?.probes?.find(({ id }) => id === probe.id);
  pass(Boolean(cohortProbe), `cohort is missing probe ${probe.id}`);
  for (const field of ["file", "timeoutMs", "sourceSha256", "sources", "environment"]) {
    pass(
      JSON.stringify(probe[field]) === JSON.stringify(cohortProbe?.[field]),
      `probe ${probe.id} summary/cohort ${field} differs`,
    );
  }
  const receiptText = await read(`receipts/${probe.id}.json`);
  const receipt = JSON.parse(receiptText);
  receiptById.set(probe.id, receipt);
  pass(receipt.schema === "effect-build/interface-mechanism-probe@1", `probe ${probe.id} receipt schema differs`);
  pass(receipt.probe === expectedProbeMetadata[probe.id]?.probe, `probe ${probe.id} receipt identity differs`);
  pass(
    receipt.classification === expectedProbeMetadata[probe.id]?.classification,
    `probe ${probe.id} receipt classification differs`,
  );
  pass(probe.receipt?.file === `${probe.id}.json`, `probe ${probe.id} receipt filename differs`);
  pass(probe.receipt?.sha256 === sha256(receiptText), `probe ${probe.id} receipt digest differs`);
  pass(JSON.stringify(receipt.assertions) === JSON.stringify(probe.assertions), `probe ${probe.id} receipt and summary assertions differ`);
  pass(receipt.run?.schema === "effect-build/interface-mechanism-probe-run@1", `probe ${probe.id} has no @1 run record`);
  pass(receipt.run?.cohort === summary.cohort?.id, `probe ${probe.id} cohort identity differs`);
  pass(receipt.run?.runId === summary.cohort?.runId, `probe ${probe.id} runId differs`);
  pass(receipt.run?.cohortSha256 === summary.cohortSha256, `probe ${probe.id} cohort digest differs`);
  pass(JSON.stringify(receipt.run?.runner) === JSON.stringify(summary.cohort?.runner), `probe ${probe.id} runner digest differs`);
  pass(receipt.run?.sourceSha256 === probe.sourceSha256, `probe ${probe.id} source digest differs from summary`);
  pass(JSON.stringify(receipt.run?.sources) === JSON.stringify(probe.sources), `probe ${probe.id} source list differs from summary`);
  pass(JSON.stringify(receipt.run?.environment) === JSON.stringify(probe.environment), `probe ${probe.id} environment record differs`);
  pass(receipt.run?.timeoutMs === probe.timeoutMs, `probe ${probe.id} timeout differs`);
  pass(receipt.run?.startedAt === probe.startedAt && receipt.run?.completedAt === probe.completedAt, `probe ${probe.id} timestamps differ`);
  pass(receipt.run?.durationMs === probe.durationMs, `probe ${probe.id} duration differs`);
}
pass(summary.cohort?.probes?.length === expectedProbeIds.length, "cohort contains an unexpected number of probes");
pass(new Date(summary.completedAt).getTime() >= new Date(summary.cohort?.startedAt).getTime(), "probe cohort completion precedes its start");

const exact = (subject, version) => ground.exactVersions.find((entry) => entry.subject === subject && entry.version === version);
const expectedExactVersions = [
  ["Effect", "4.0.0-rc.108", "bef7bf38ae4b73d5511043f707aed083de5da7cc"],
  ["Bun", "1.3.9", "cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a"],
  ["Bun", "1.3.14", "0d9b296af33f2b851fcbf4df3e9ec89751734ba4"],
  ["Deno and denort", "2.9.3", "f39575ecd50602a5b42b1ba8e93849460de9fcf4"],
  ["Deno", "2.9.5", "17fadf33a8df3af9488b9f42efd1f2290d6dc7a3"],
  ["esbuild", "0.28.2", "609683d892977362a0f99026cb74b96263d728a9"],
  ["esbuild-wasm", "0.28.2", "609683d892977362a0f99026cb74b96263d728a9"],
  ["Node", "26.7.0", "b4f23d3619c98bed09af93a21192f6080197a8c6"],
  ["postject", "1.0.0-alpha.6", "3c4f2080ee56025716c3add0f6c03b16e2af54ff"],
  ["Rolldown", "1.2.4", "483c64833c0fb0d1b75f1339accf781c0a09b335"],
];
pass(
  JSON.stringify(ground.exactVersions.map(({ subject, version, commit }) => [subject, version, commit]))
    === JSON.stringify(expectedExactVersions),
  "exact provider/effect version inventory differs from the required pinned set",
);
pass(
  ground.exactVersions.every(({ role, evidenceClass }) => Boolean(role?.trim()) && Boolean(evidenceClass?.trim())),
  "exact version inventory has an empty role or evidence class",
);
const bunReceipt = receiptById.get("bun-sidecar");
const esbuildReceipt = receiptById.get("esbuild-js-service");
const wasmReceipt = receiptById.get("esbuild-wasm-browser");
const nodeReceipt = receiptById.get("node-postject");
pass(bunReceipt?.bunVersion === "1.3.9" && bunReceipt?.bunSha256 === exact("Bun", "1.3.9")?.localDarwinProbeBinarySha256, "Bun receipt is not content-bound to ground truth");
pass(
  esbuildReceipt?.esbuildVersion === "0.28.2"
    && esbuildReceipt?.packageJsonSha256 === exact("esbuild", "0.28.2")?.packageJsonSha256
    && esbuildReceipt?.jsEntrypointSha256 === exact("esbuild", "0.28.2")?.localJsEntrypointSha256
    && esbuildReceipt?.nativeBinarySha256 === exact("esbuild", "0.28.2")?.localDarwinArm64BinarySha256,
  "esbuild JS receipt is not content-bound to its package manifest, executed JS entrypoint, and spawned native binary",
);
pass(wasmReceipt?.esbuildVersion === "0.28.2", "esbuild Wasm receipt version differs");
pass(wasmReceipt?.package?.integrity === exact("esbuild-wasm", "0.28.2")?.npmIntegrity, "esbuild Wasm integrity differs from ground truth");
pass(wasmReceipt?.package?.shasum === exact("esbuild-wasm", "0.28.2")?.npmShasum, "esbuild Wasm shasum differs from ground truth");
pass(wasmReceipt?.package?.sha256 === exact("esbuild-wasm", "0.28.2")?.tarballSha256, "esbuild Wasm tarball digest differs from ground truth");
pass(
  wasmReceipt?.chromeVersion === ground.localProbeEnvironment.chrome
    && wasmReceipt?.chromeExecutable === ground.localProbeEnvironment.chromeExecutable
    && wasmReceipt?.chromeSha256 === ground.localProbeEnvironment.chromeExecutableSha256,
  "browser Wasm receipt host identity differs from the exact ground-truth Chrome host",
);
pass(
  nodeReceipt?.selectedSeaNodeVersion === "26.7.0"
    && nodeReceipt?.selectedSeaNodeSha256 === exact("Node", "26.7.0")?.darwinArm64BinarySha256,
  "selected SEA Node receipt is not content-bound to ground truth",
);
pass(
  nodeReceipt?.hostNodeVersion === ground.localProbeEnvironment.node
    && nodeReceipt?.hostNodeExecutable === ground.localProbeEnvironment.nodeExecutable
    && nodeReceipt?.hostNodeSha256 === ground.localProbeEnvironment.nodeExecutableSha256,
  "Node/postject receipt host identity differs from the independent ground-truth host Node",
);
pass(nodeReceipt?.postjectVersion === "1.0.0-alpha.6" && nodeReceipt?.postjectApiSha256 === exact("postject", "1.0.0-alpha.6")?.apiJsSha256, "postject receipt is not content-bound to its embedded-Wasm API entrypoint");

const currentHead = git("rev-parse", "HEAD");
const currentBranch = git("branch", "--show-current");
const studyBaseline = ground.repository;
const publicationPolicy = studyBaseline.publicationPolicy;
const publicationBase = publicationPolicy?.reviewBaseSha;
const expectedResearchRoots = [
  "research/post-0.3/INTERFACE-MECHANISM-RESEARCH-PROMPT.md",
  "research/post-0.3/interface-mechanisms",
];

pass(studyBaseline.identityKind === "immutable-study-baseline-snapshot", "repository identity is not an immutable study-baseline snapshot");
pass(JSON.stringify(studyBaseline.studyBaselineProductionDiffFromV030) === "[]", "study-baseline production diff observation is not empty");
pass(JSON.stringify(studyBaseline.studyBaselineProductionWorktreeDiff) === "[]", "study-baseline production worktree observation is not empty");
pass(studyBaseline.trackedWorktreeCleanAtStudyObservation === true, "study-baseline tracked worktree observation is not clean");
pass(git("rev-parse", `${studyBaseline.head}^{commit}`) === studyBaseline.head, "study-baseline commit differs from ground truth");
pass(git("merge-base", "v0.3.0", studyBaseline.head) === studyBaseline.v030MergeBase, "study-baseline v0.3.0 merge-base differs from ground truth");
pass(git("rev-parse", `${studyBaseline.head}^`) === studyBaseline.headParent, "study-baseline parent differs from ground truth");
pass(
  Number(git("rev-list", "--count", `v0.3.0..${studyBaseline.head}`)) === studyBaseline.commitsAfterV030,
  "study-baseline commit count after v0.3.0 differs from ground truth",
);
pass(/^[0-9a-f]{40}$/.test(studyBaseline.originMain), "recorded origin/main observation is not an exact commit");
pass(/^[0-9a-f]{40}$/.test(studyBaseline.originResearchHead), "recorded origin research observation is not an exact commit");
pass(publicationPolicy?.relation === "strict-linear-descendant-from-study-baseline", "publication relation differs");
pass(publicationPolicy?.requiresCleanCheckoutAfterPublication === true, "publication policy must require a clean checkout");
pass(publicationPolicy?.allowsBaselinePrepublicationValidation === true, "publication policy must permit the explicit prepublication state");
pass(
  JSON.stringify(publicationPolicy?.allowedPathRoots) === JSON.stringify(expectedResearchRoots),
  "publication allowlist differs from the exact two research roots",
);
pass(publicationPolicy?.branch === "research/interface-mechanisms-beyond-cli-host-api", "publication branch policy differs");
pass(publicationPolicy?.reviewBaseBranch === "research/interface-mechanisms-study-baseline", "publication review-base branch policy differs");
pass(publicationBase === studyBaseline.head, "publication review-base commit differs from the immutable study baseline");
pass(currentBranch === publicationPolicy?.branch, `publication checkout branch differs: ${currentBranch || "detached"}`);
const localReviewBase = gitMaybe("rev-parse", `refs/heads/${publicationPolicy?.reviewBaseBranch}^{commit}`);
const remoteReviewBase = gitMaybe("rev-parse", `refs/remotes/origin/${publicationPolicy?.reviewBaseBranch}^{commit}`);
pass(
  localReviewBase === publicationBase || remoteReviewBase === publicationBase,
  "publication review-base branch does not resolve to the immutable study baseline",
);
pass(git("merge-base", publicationBase, currentHead) === publicationBase, "publication checkout does not descend from the exact study/review base");

const publicationRange = `${publicationBase}..${currentHead}`;
const publicationCommits = lines(git("rev-list", "--reverse", publicationRange));
const publicationMerges = lines(git("rev-list", "--merges", publicationRange));
pass(publicationMerges.length === 0, `publication history contains merge commits: ${JSON.stringify(publicationMerges)}`);
const publicationChangedPaths = publicationCommits.flatMap((commit) => lines(git(
  "diff-tree",
  "--no-commit-id",
  "--name-only",
  "--no-renames",
  "-r",
  commit,
)));
const publicationForbiddenPaths = publicationChangedPaths.filter((path) => !expectedResearchRoots.some(
  (allowedRoot) => path === allowedRoot || path.startsWith(`${allowedRoot}/`),
));
pass(
  publicationForbiddenPaths.length === 0,
  `publication commits touch forbidden paths: ${JSON.stringify(publicationForbiddenPaths)}`,
);

pass(studyBaseline.worktreeCount === studyBaseline.worktrees.length, "recorded worktree snapshot count differs from its entries");
pass(Number.isFinite(new Date(studyBaseline.worktreeObservedAt).getTime()), "recorded worktree snapshot timestamp is invalid");
pass(new Set(studyBaseline.worktrees.map(({ path }) => path)).size === studyBaseline.worktrees.length, "recorded worktree snapshot paths are duplicated");
const recordedPublicationWorktree = studyBaseline.worktrees.find(({ path }) => path === studyBaseline.path);
pass(recordedPublicationWorktree?.head === publicationBase, "recorded publication worktree snapshot head differs from the study/review base");
pass(recordedPublicationWorktree?.branch === `refs/heads/${publicationPolicy.branch}`, "recorded publication worktree snapshot branch differs");
pass(ground.publishedV030.tag === "v0.3.0", "published baseline tag differs");
pass(git("rev-parse", "v0.3.0^{commit}") === ground.publishedV030.sourceSha, "published v0.3.0 source SHA differs");

const statusLines = lines(git("status", "--porcelain=v1", "--untracked-files=normal"));
const statusRecords = statusLines.map((line) => ({ code: line.slice(0, 2), path: line.slice(3).replace(/\/$/, "") }));
const atPrepublicationBase = currentHead === publicationBase;
if (atPrepublicationBase) {
  pass(statusRecords.every(({ code }) => code === "??"), `prepublication checkout has tracked changes: ${JSON.stringify(statusRecords)}`);
  pass(
    JSON.stringify(statusRecords.map(({ path }) => path).sort()) === JSON.stringify([...studyBaseline.untrackedPathsAtStudyObservation].sort()),
    "prepublication checkout differs from the exact two untracked research roots",
  );
} else {
  pass(statusRecords.length === 0, `published research checkout is not clean: ${JSON.stringify(statusRecords)}`);
}

const productionPaths = ["packages", "package.json", "bun.lock"];
pass(
  git("diff", "--name-only", `v0.3.0..${studyBaseline.head}`, "--", ...productionPaths) === "",
  "study-baseline production/package state differs from v0.3.0",
);
pass(
  git("diff", "--name-only", `${publicationBase}..HEAD`, "--", ...productionPaths) === "",
  "research publication changes production/package state relative to its study/review base",
);
pass(git("diff", "--name-only", "--", ...productionPaths) === "", "worktree contains production/package modifications");
pass(git("tag", "--list", "v0.4*") === "", "a v0.4 release tag exists despite the research-only boundary");
pass(JSON.stringify(ground.releaseState.localV04Tags) === "[]", "ground truth records an unexpected v0.4 tag");
const expectedPackageNames = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];
pass(
  JSON.stringify(Object.keys(ground.releaseState.npmDistTags).sort()) === JSON.stringify([...expectedPackageNames].sort()),
  "npm dist-tag evidence package set differs from the exact five-package release set",
);
pass(
  Object.values(ground.releaseState.npmDistTags).every(({ latest }) => latest === "0.3.0"),
  "ground truth records a published latest version other than 0.3.0",
);
pass(ground.releaseState.versionsCommand === "npm view <package> versions --json", "published-version evidence command differs");
pass(
  Object.keys(ground.releaseState.npmPublishedVersions).sort().join("\0")
    === [...expectedPackageNames].sort().join("\0"),
  "published-version evidence package set differs from dist-tag evidence",
);
pass(
  Object.values(ground.releaseState.npmPublishedVersions).every(
    (versions) => Array.isArray(versions)
      && versions.length > 0
      && new Set(versions).size === versions.length
      && !versions.some((version) => /^0\.4(?:\.|-|$)/.test(version)),
  ),
  "ground truth published-version arrays are empty, duplicated, or contain a v0.4 package version",
);
const expectedPublishedVersions = {
  "effect-build": ["0.1.0", "0.2.0", "0.3.0"],
  "effect-build-bun": ["0.0.0-reserved.0", "0.3.0"],
  "effect-build-deno": ["0.0.0-reserved.0", "0.3.0"],
  "effect-build-esbuild": ["0.0.0-reserved.0", "0.3.0"],
  "effect-build-node-sea": ["0.0.0-reserved.0", "0.3.0"],
};
pass(
  JSON.stringify(ground.releaseState.npmPublishedVersions) === JSON.stringify(expectedPublishedVersions),
  "published-version evidence differs from the exact observed registry snapshot",
);
for (const packageName of expectedPackageNames) {
  pass(
    ground.releaseState.npmPublishedVersions[packageName]?.includes(
      ground.releaseState.npmDistTags[packageName]?.latest,
    ),
    `published versions for ${packageName} omit its latest dist-tag`,
  );
}

pass(ground.publishedV030.acquisitionCommandTemplate.includes("npm pack"), "published package acquisition command is not recorded");
pass(
  JSON.stringify(ground.publishedV030.packages.map(({ name }) => name)) === JSON.stringify(expectedPackageNames),
  "published v0.3 package evidence set/order differs from the exact five-package release set",
);
for (const publishedPackage of ground.publishedV030.packages) {
  pass(publishedPackage.version === "0.3.0", `published evidence version differs for ${publishedPackage.name}`);
  pass(/^https:\/\/registry\.npmjs\.org\//.test(publishedPackage.tarballUrl), `published tarball URL missing for ${publishedPackage.name}`);
  pass(/^[0-9a-f]{64}$/.test(publishedPackage.tarballSha256), `published tarball digest missing for ${publishedPackage.name}`);
  pass(/^[0-9a-f]{64}$/.test(publishedPackage.declarationManifestSha256), `declaration manifest digest missing for ${publishedPackage.name}`);
  pass(publishedPackage.declarationCount >= Object.keys(publishedPackage.exportDeclarations).length, `declaration count is invalid for ${publishedPackage.name}`);
  pass(
    JSON.stringify(Object.keys(publishedPackage.exportDeclarations)) === JSON.stringify(publishedPackage.exports),
    `export declaration keys differ for ${publishedPackage.name}`,
  );
  for (const [exportName, declaration] of Object.entries(publishedPackage.exportDeclarations)) {
    pass(declaration.path.endsWith(".d.ts") && /^[0-9a-f]{64}$/.test(declaration.sha256), `invalid declaration evidence for ${publishedPackage.name} ${exportName}`);
  }
}

const surface = JSON.parse(await readFile(join(root, ground.freeze.surfaceArtifact), "utf8"));
const admittedSurfaceOperations = surface.operations.map(({ operationId }) => operationId);
const derivedSurfaceOperations = surface.derivedOperations.map(({ operationId }) => operationId);
pass(
  JSON.stringify(admittedSurfaceOperations) === JSON.stringify(ground.freeze.admittedCanonicalOperations),
  `frozen operations ${JSON.stringify(admittedSurfaceOperations)} differ from ground truth ${JSON.stringify(ground.freeze.admittedCanonicalOperations)}`,
);
pass(
  JSON.stringify(derivedSurfaceOperations) === JSON.stringify(ground.freeze.derivedOperations),
  `derived operations ${JSON.stringify(derivedSurfaceOperations)} differ from ground truth ${JSON.stringify(ground.freeze.derivedOperations)}`,
);
pass(surface.status === "frozen", `SURFACE.json status is ${surface.status}; expected frozen`);
pass(ground.freeze.rolldown === "deferred", "ground truth must retain Rolldown deferral");
pass(ground.freeze.finalBaselineCommit === ground.repository.head, "freeze final baseline differs from repository head");
pass(ground.freeze.plan039.repositoryStatus === expected.freeze.repositoryPlan039StatusAtFinalBaseline, "ground truth Plan 039 status differs from expected conclusion");
pass(ground.freeze.plan039.studyDisposition === "not begun by this study", "ground truth must distinguish repository authority from this study");
pass(ground.freeze.plan039.publicationAuthority === "NONE", "freeze must retain no publication authority");
const studyBaselinePlan039 = git("show", `${studyBaseline.head}:plans/039-establish-core-capability-boundaries.md`);
const publicationCheckoutPlan039 = await readFile(join(root, "plans/039-establish-core-capability-boundaries.md"), "utf8");
pass(/^- Status: READY$/m.test(studyBaselinePlan039), "study-baseline Plan 039 document does not record READY");
pass(/^- Publication authority: NONE$/m.test(studyBaselinePlan039), "study-baseline Plan 039 document changed publication authority");
pass(/^- Status: READY$/m.test(publicationCheckoutPlan039), "research publication checkout does not preserve the study-baseline Plan 039 status");
pass(/^- Publication authority: NONE$/m.test(publicationCheckoutPlan039), "research publication checkout changed Plan 039 publication authority");
pass(ground.livePr.head.plan039Status === "DONE", "later live PR Plan 039 status observation differs");

pass(ground.livePr.repository === "mannyc2/effect-build" && ground.livePr.number === 4, "live PR identity differs");
pass(ground.livePr.url === "https://github.com/mannyc2/effect-build/pull/4", "live PR URL differs");
pass(ground.livePr.state === "OPEN" && ground.livePr.draft === true, "live PR state/draft differs");
pass(ground.livePr.base?.branch === "codex/granular-integration-program", "live PR base branch differs");
pass(ground.livePr.base?.sha === "15c811bb9904142a33d119766b62082f3c689f13", "live PR base SHA differs");
pass(ground.livePr.head?.branch === "codex/post-0.3-native-capability-architecture", "live PR head branch differs");
pass(ground.livePr.head?.sha === ground.repository.originResearchHead, "live PR head SHA differs from recorded origin research head");
pass(["CLEAN", "BLOCKED", "BEHIND", "DIRTY", "DRAFT", "HAS_HOOKS", "UNKNOWN", "UNSTABLE"].includes(ground.livePr.mergeState), "live PR merge state is invalid");
pass(Number.isFinite(new Date(ground.livePr.checks?.observedAt).getTime()), "live PR check observation timestamp is invalid");
pass(ground.livePr.checks?.quality === "success-twice", "live PR quality-check observation differs");
pass(ground.livePr.checks?.plan039Implementation === "success-twice", "live PR Plan 039 implementation-check observation differs");
pass(ground.livePr.checks?.sourceExport === "success", "live PR source-export observation differs");
pass(Array.isArray(ground.livePr.checks?.runs?.effectBuild) && ground.livePr.checks.runs.effectBuild.length === 2, "live PR effect-build run URLs differ");
pass(Array.isArray(ground.livePr.checks?.runs?.architectureResearch) && ground.livePr.checks.runs.architectureResearch.length === 2, "live PR research run URLs differ");
pass(
  [...ground.livePr.checks.runs.effectBuild, ...ground.livePr.checks.runs.architectureResearch, ground.livePr.checks.runs.sourceExport]
    .every((url) => /^https:\/\/github\.com\/mannyc2\/effect-build\/actions\/runs\/\d+$/.test(url)),
  "live PR action run coordinate is invalid",
);
for (const operationId of ["CAN-ESB-001", "CAN-ESB-011"]) {
  const operation = surface.operations.find((candidate) => candidate.operationId === operationId);
  pass(operation?.compatibility?.historicalR1Lane === "in-process-api", `${operationId} must retain the historical R1 label`);
  pass(operation?.compatibility?.surfaceLane === expected.providerBoundaries.esbuildFreezeLane, `${operationId} final lane differs from expected`);
  const topology = operationId === "CAN-ESB-001"
    ? operation?.contract?.nativeSemantics?.mechanismTopology
    : operation?.contract?.Context?.mechanismTopology;
  pass(topology === expected.providerBoundaries.esbuildBuildAndContextExecution, `${operationId} mechanism topology differs from expected`);
}

const finalBaselineShort = ground.repository.head.slice(0, 7);
for (const phrase of [
  "CLI versus an existing TypeScript API` is an unjustified top-level binary",
  `Baseline: \`codex/v0.4-surface-freeze\` at \`${ground.repository.head}\``,
  `Disposition on the final \`${finalBaselineShort}\` baseline: unchanged and independently confirmed`,
  "package-module-global native child",
  "Verdict: preferred",
  "It does not change the admitted 0.4 operations",
  "This study neither authorizes nor begins Plan 039",
  `The inventory has ${operations.length} semantic operations`,
  `The mechanism ledger has ${coverage.length} provider × operation × mechanism-family records`,
  `${decisions.length} operation × architecture records`,
]) {
  pass(report.includes(phrase), `report is missing required conclusion phrase: ${phrase}`);
}
pass(report.includes(`head \`${ground.livePr.head.sha}\``), "report live PR head differs from ground truth");
pass(report.includes("marks Plan 039 `READY`"), "report must record the repository's independently integrated Plan 039 status");
pass(report.includes("marked Plan 039 `DONE`"), "report must record the later live PR Plan 039 status");
const sourcesDocument = await read("SOURCES.md");
pass(sourcesDocument.includes(ground.repository.head), "source index does not name the final inspected baseline");

const linkSources = ["README.md", "REPORT.md", "PROBES.md", "SOURCES.md"];
for (const sourceName of linkSources) {
  const source = await read(sourceName);
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    const withoutFragment = target.split("#", 1)[0];
    if (!withoutFragment) continue;
    try {
      await access(resolve(here, withoutFragment));
    } catch {
      failures.push(`${sourceName} has missing local link ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ schema: "effect-build/interface-mechanism-validation@2", ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schema: "effect-build/interface-mechanism-validation@2",
    ok: true,
    repository: {
      studyBaseline: studyBaseline.head,
      reviewBase: publicationBase,
      publicationBranch: currentBranch || null,
      publicationHead: currentHead,
      publicationMode: atPrepublicationBase ? "prepublication" : "committed-research-only-descendant",
      publicationCommits: publicationCommits.length,
    },
    counts: {
      operations: inventory.length,
      mechanismFamilies: mechanismFamilies.length,
      mechanismRecords: coverage.length,
      architectures: architectureCandidates.length,
      decisionRecords: decisions.length,
      currentTypeScriptTraceRows: traces.length,
      probeReceipts: summary.probes.length,
    },
    boundaries: {
      studyBaselineProductionDiffFromV030: "empty",
      publicationProductionDiffFromStudyBase: "empty",
      productionWorktreeDiff: "empty",
      trackedWorktree: atPrepublicationBase ? "clean-with-two-untracked-research-roots" : "clean",
      untrackedResearchPaths: atPrepublicationBase ? ground.repository.untrackedPathsAtStudyObservation : [],
      thisStudyAuthorizesPlan039: false,
      localStudyBaselinePlan039Status: ground.freeze.plan039.repositoryStatus,
      livePrPlan039Status: ground.livePr.head.plan039Status,
      plan039ProductionBegunByThisStudy: false,
      v04ReleaseTagPresent: false,
      recordedNpmLatest: "0.3.0",
      recordedNpmObservedAt: ground.releaseState.observedAt,
    },
  }, null, 2));
}

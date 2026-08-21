import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repository = join(here, "../../..");
const readText = (path) => readFileSync(join(repository, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));
const runValidator = (script) =>
  execFileSync(process.execPath, [join(here, script), "--json"], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--json"), "usage: validate-freeze.mjs [--json]");

if (process.env.SOURCE_SHA !== undefined) {
  assert.match(process.env.SOURCE_SHA, /^[0-9a-f]{40}$/, "SOURCE_SHA is not a commit SHA");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  assert.equal(head, process.env.SOURCE_SHA, "freeze validator checkout does not equal SOURCE_SHA");
  const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  assert.equal(status, "", `freeze validator refuses a dirty repository:\n${status}`);
}

assert.equal(
  existsSync(join(repository, ".github/workflows/research-toolchain-export.yml")),
  false,
  "one-shot write-capable closure workflow was not retired",
);
assert.equal(
  existsSync(join(repository, ".github/research/closure-patch/part-00")),
  false,
  "one-shot closure transport payload was not retired",
);

runValidator("validate-surface-artifacts.mjs");
runValidator("validate-migration.mjs");

const surface = readJson("research/post-0.3/freeze/SURFACE.json");
const migration = readJson("research/post-0.3/freeze/MIGRATION.json");
assert.equal(surface.status, "frozen", "public surface is not frozen");
assert.equal(surface.version, "0.4.0", "public surface version changed");
assert.equal(surface.schema, "effect-build/public-surface@2", "public surface semantic schema changed");
assert.equal(
  surface.semanticContracts?.schema,
  "effect-build/public-contract-freeze@1",
  "frozen public contract semantics are missing",
);
assert.equal(
  surface.semanticContracts.reviewedAdmission.concreteReviewedAdmissionKeys.length,
  0,
  "unauthenticated reviewed admission keys entered the freeze",
);
assert.ok(
  surface.semanticContracts.reviewedAdmission.implementationRequirement.includes("authenticated receipt"),
  "reviewed admission lacks receipt-authenticated implementation gating",
);
equal(
  surface.semanticContracts.r3Projection.lane.historicalR1Mapping,
  { "in-process-api": "installed-library-api" },
  "historical Esbuild lane reclassification changed",
);
assert.equal(
  surface.semanticContracts.r3Projection.lane.interfaceAndMechanismAreIndependent,
  true,
  "surface collapsed interface lane and mechanism topology",
);
assert.ok(Object.keys(surface.semanticContracts.errorContracts).length > 1, "frozen error contracts are empty");
assert.ok(surface.operations.every((operation) => operation.contract !== undefined), "operation contract missing");
assert.ok(
  surface.operations.every((operation) => operation.compatibility.reviewedAdmissionKeys.length === 0),
  "operation contains an unauthenticated reviewed admission key",
);
for (const operationId of ["CAN-ESB-001", "CAN-ESB-011"]) {
  const operation = surface.operations.find((candidate) => candidate.operationId === operationId);
  assert.ok(operation, `missing frozen Esbuild operation ${operationId}`);
  assert.ok(operation.semanticIdentity.includes(" / installed-library-api / "), `${operationId} surface lane changed`);
  assert.ok(operation.r1SemanticIdentity.includes(" / in-process-api / "), `${operationId} historical lane changed`);
  assert.equal(operation.compatibility.surfaceLane, "installed-library-api", `${operationId} compatibility lane changed`);
  assert.equal(
    operation.contract.Options.requiredLiteralFields.write,
    false,
    `${operationId} no longer requires native write:false`,
  );
}
const esbuildBuild = surface.operations.find((operation) => operation.operationId === "CAN-ESB-001");
assert.equal(
  esbuildBuild.contract.nativeSemantics.mechanismTopology,
  "package-owned-native-service-child",
  "Esbuild build mechanism topology changed",
);
const esbuildContext = surface.operations.find((operation) => operation.operationId === "CAN-ESB-011");
assert.equal(
  esbuildContext.contract.Context.mechanismTopology,
  "package-owned-native-service-child",
  "Esbuild context mechanism topology changed",
);
equal(
  Object.keys(esbuildContext.contract.Context.publicMethods),
  ["rebuild", "watch", "serve", "cancel"],
  "Esbuild scoped context public methods changed",
);
equal(
  esbuildContext.contract.Context.forbiddenPublicMethods,
  ["dispose"],
  "Esbuild scoped disposal ownership changed",
);
assert.equal(migration.status, "complete-v0.3-inventory-frozen-v0.4-targets", "migration is not final");
assert.equal(migration.target.surfaceStatus, "frozen", "migration target is not frozen");
assert.equal(migration.target.release, surface.version, "migration and surface versions differ");
equal(migration.blockingReconciliations, [], "migration still has blocking reconciliations");
assert.ok(migration.rules.every((rule) => rule.status === "resolved"), "migration contains an unresolved rule");
assert.ok(!JSON.stringify(migration).includes("priorCandidateTarget"), "migration contains a prior candidate target");
assert.ok(!JSON.stringify(migration).includes('"conditional"'), "migration contains a conditional target");

for (const path of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
  const baseline = execFileSync("git", ["show", `${migration.baseline.commit}:${path}`], {
    cwd: repository,
    encoding: "utf8",
  });
  const current = readText(path);
  const historyMarker = "          fetch-depth: 0\n";
  assert.equal(current.split(historyMarker).length - 1, 1, `${path} must contain exactly one complete-history checkout`);
  assert.equal(
    current.replace(historyMarker, ""),
    baseline,
    `${path} differs from v0.3.0 by more than the required complete-history checkout`,
  );
}

const surfacePackages = surface.packageTrain.packages.map((entry) => ({
  name: entry.name,
  rootNamespaces: entry.root.namespaces,
  subpaths: entry.subpaths.map((subpath) => ({
    subpath: subpath.subpath,
    rootNamespace: subpath.rootNamespace,
    exports: subpath.exports,
  })),
}));
equal(migration.target.packages, surfacePackages, "migration target and frozen package/export map differ");
equal(
  migration.target.admittedOperationIds,
  surface.operations.map((operation) => operation.operationId),
  "migration and surface admitted operation IDs differ",
);
equal(
  migration.target.derivedOperationIds,
  surface.derivedOperations.map((operation) => operation.operationId),
  "migration and surface derived operation IDs differ",
);

const agents = readText("AGENTS.md");
for (const marker of [
  "Architecture generation: `post-0.3-surface-freeze-v1`",
  "research/post-0.3/freeze/SURFACE.json",
  "research/post-0.3/freeze/MIGRATION.json",
  "Package roots are namespace-only discovery facades",
  "exactly three integration-author modules",
  "Plans 039-043 stage the exact new implementation behind the released 0.3 export map",
  "Plan 044 alone performs the atomic export-map and migration hard cut",
  "Plan 039 is ready to begin",
  "does not itself authorize a merge",
  "Before the first production edit in Plan 039",
  "reviewed-admission key sets are intentionally empty",
  "default result is `SupportUnknown`",
  "selected-command and other operation-owned child processes",
  "Esbuild `Build.build` interruption only stops the Effect waiter",
  "cancel-then-hidden-dispose contract",
  "For selected-command participants, tool selection",
  "Esbuild instead authenticates the installed package/declarations/platform/native/host participant set",
]) assert.ok(agents.includes(marker), `AGENTS.md lacks frozen-authority marker: ${marker}`);
for (const packageName of surface.packageTrain.packages.map((entry) => entry.name)) {
  assert.ok(agents.includes(packageName), `AGENTS.md omits frozen package ${packageName}`);
}
assert.ok(!agents.includes("completion-release-program-v1"), "AGENTS.md retains the superseded architecture generation");
assert.ok(
  readText("research/post-0.3/README.md").includes("one-shot write-capable canonical-closure workflow"),
  "research README does not record retirement of the write-capable closure transport",
);
for (const marker of [
  "byte-pinned as the pre-cutover",
  "M1 is therefore activated at this freeze",
  "not a current Plan 039 blocker",
]) {
  assert.ok(readText("research/post-0.3/README.md").includes(marker), `research README lacks M1 activation marker: ${marker}`);
}

const planContracts = [
  {
    path: "plans/039-establish-core-capability-boundaries.md",
    status: "READY",
    markers: [
      "effect-build/Author/Tool",
      "effect-build/Author/BorrowedOutput",
      "effect-build/Author/Executable",
      "Plan 044 owns the one",
      "phase handoff on a research-clean head",
      "trust anchor containing",
      "aggregate run ID and",
      "certification artifact ID and SHA-256 digest",
      "constituent-receipt digests",
      "must never invoke",
      "no expected-claim auto-discovery",
      "are disjoint",
    ],
  },
  {
    path: "plans/040-expose-esbuild-api-lane.md",
    status: "TODO",
    markers: [
      "effect-build-esbuild/Build",
      "effect-build-esbuild/Context",
      "export-inert until Plan 044",
      "package-owned, long-lived native service child",
      "reviewed-key set is empty",
    ],
  },
  {
    path: "plans/041-add-bun-api-command-lanes.md",
    status: "TODO",
    markers: ["effect-build-bun/CompileExecutable", "compileExecutableMatrix", "until Plan 044", "reviewed-key set is empty"],
  },
  {
    path: "plans/042-add-deno-bundle-command-lanes.md",
    status: "TODO",
    markers: ["effect-build-deno/CompileExecutable", "compileExecutableMatrix", "until Plan 044", "reviewed-key set is empty"],
  },
  {
    path: "plans/043-publish-single-node-program-profile.md",
    status: "TODO",
    markers: ["effect-build-node-sea/AssembleExecutable", "assembleExecutable", "until Plan 044", "reviewed-key set is empty"],
  },
  {
    path: "plans/044-hard-cut-certify-v0.4.md",
    status: "TODO",
    markers: [
      "one coordinated hard cut",
      "once-packed core tarball",
      "Windows open-image destination-lock",
      "research-only freeze certificate is authenticated at its",
      "workflow-only phase handoff required by Plan 039",
      "must not contain `surface-freeze`",
      "Only `candidate-conformance` is reproduced",
    ],
  },
];
for (const contract of planContracts) {
  const source = readText(contract.path);
  assert.ok(source.includes(`- Status: ${contract.status}`), `${contract.path} status changed`);
  assert.ok(source.includes("- Publication authority: NONE"), `${contract.path} gained publication authority`);
  assert.ok(source.includes("research/post-0.3/freeze/SURFACE.json"), `${contract.path} lacks surface authority`);
  assert.ok(source.includes("research/post-0.3/freeze/MIGRATION.json"), `${contract.path} lacks migration authority`);
  for (const marker of contract.markers) {
    assert.ok(source.includes(marker), `${contract.path} lacks frozen-plan marker: ${marker}`);
  }
}

const plansReadme = readText("plans/README.md");
assert.ok(plansReadme.includes("Plans 039-044 have been rewritten from that frozen"), "plan index lacks cutover statement");
for (const [number, status] of [["039", "READY"], ["040", "TODO"], ["041", "TODO"], ["042", "TODO"], ["043", "TODO"], ["044", "TODO"]]) {
  assert.match(plansReadme, new RegExp(`\\| ${number} \\|[^\\n]+\\| ${status.replace(" ", "\\s+")} \\|`), `plan index status changed for ${number}`);
}

for (const path of [
  "research/post-0.3/README.md",
  "research/post-0.3/corpus/GOVERNANCE.md",
  "research/post-0.3/corpus/RECONCILIATION.md",
  "research/post-0.3/corpus/RESEARCH-PROGRAM.md",
]) {
  const source = readText(path);
  assert.ok(source.includes("freeze/SURFACE.json") || source.includes("../freeze/SURFACE.json"), `${path} lacks frozen surface authority`);
}

const report = {
  result: "FREEZE_OK",
  version: surface.version,
  packages: surfacePackages.map((entry) => entry.name),
  rootNamespaces: surfacePackages.reduce((count, entry) => count + entry.rootNamespaces.length, 0),
  subpaths: surfacePackages.reduce((count, entry) => count + entry.subpaths.length, 0),
  exports: surfacePackages.reduce(
    (count, entry) => count + entry.subpaths.reduce((subtotal, subpath) => subtotal + subpath.exports.length, 0),
    0,
  ),
  admittedOperations: migration.target.admittedOperationIds,
  derivedOperations: migration.target.derivedOperationIds,
  migrationObservations: migration.mappingGroups.reduce((count, group) => count + group.identities.length, 0),
  migrationRules: migration.rules.length,
  migrationBlockers: migration.blockingReconciliations.length,
  plan039: "READY",
  productionImplementation: "not-started",
  publicationAuthority: "NONE",
};

if (args[0] === "--json") console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.result);
  console.log(`surface=${report.version} packages=${report.packages.length} roots=${report.rootNamespaces} subpaths=${report.subpaths} exports=${report.exports}`);
  console.log(`operations=${report.admittedOperations.length}+${report.derivedOperations.length}`);
  console.log(`migration-observations=${report.migrationObservations} rules=${report.migrationRules} blockers=${report.migrationBlockers}`);
  console.log(`plan-039=${report.plan039} production=${report.productionImplementation} publication=${report.publicationAuthority}`);
}

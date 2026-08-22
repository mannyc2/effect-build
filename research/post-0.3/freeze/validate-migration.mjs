#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const migrationPath = resolve(here, "MIGRATION.json");

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitShow = (commit, path) => git("show", `${commit}:${path}`);

const extractBalanced = (source, marker, opening) => {
  const markerIndex = source.indexOf(marker);
  invariant(markerIndex >= 0, `baseline parser did not find ${marker}`);
  const start = source.indexOf(opening, markerIndex + marker.length);
  invariant(start >= 0, `baseline parser did not find ${opening} after ${marker}`);
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : opening === "(" ? ")" : undefined;
  invariant(closing !== undefined, `unsupported opening delimiter ${opening}`);

  let depth = 0;
  let quote;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`baseline parser found no closing ${closing} for ${marker}`);
};

const parseJsonLikeLiteral = (source, marker, opening) => {
  const literal = extractBalanced(source, marker, opening).replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(literal);
};

const compareExact = (actual, expected, label) => {
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} changed\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`,
  );
};

const sortedUnique = (values, label) => {
  const sorted = [...values].sort();
  compareExact(values, sorted, `${label} must be sorted`);
  invariant(new Set(values).size === values.length, `${label} contains a duplicate`);
};

const moduleSpecifier = (packageName, subpath) =>
  subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const deriveBaseline = (migration) => {
  const { baseline } = migration;
  const resolvedTag = git("rev-parse", `${baseline.tag}^{commit}`);
  invariant(resolvedTag === baseline.commit, `${baseline.tag} resolved to ${resolvedTag}, expected ${baseline.commit}`);
  invariant(
    git("rev-parse", `${baseline.commit}:packages`) === baseline.packageTree,
    "v0.3 packages tree no longer matches the recorded immutable baseline",
  );
  invariant(
    git("rev-parse", `${baseline.commit}:tooling/public-api.json`) === baseline.publicApiBlob,
    "v0.3 tooling/public-api.json blob no longer matches the recorded immutable baseline",
  );

  const expected = new Set();
  const add = (identity) => {
    invariant(!expected.has(identity), `baseline derivation produced duplicate ${identity}`);
    expected.add(identity);
  };

  const publicApi = JSON.parse(gitShow(baseline.commit, "tooling/public-api.json"));
  invariant(publicApi.version === 2, `v0.3 public API manifest version changed to ${publicApi.version}`);
  const publicApiTest = gitShow(baseline.commit, "test/architecture/public-api.test.ts");
  const exactDeclarations = parseJsonLikeLiteral(publicApiTest, "const exactDeclarations =", "{");
  const exactProviderDeclarations = parseJsonLikeLiteral(
    publicApiTest,
    "const exactProviderDeclarations =",
    "[",
  );
  const exactIntegrationDeclarations = parseJsonLikeLiteral(
    publicApiTest,
    "const exactIntegrationDeclarations =",
    "[",
  );
  const exactJavaScriptBundleDeclarations = parseJsonLikeLiteral(
    publicApiTest,
    "const exactJavaScriptBundleDeclarations =",
    "[",
  );

  const entryPoints = new Map();
  for (const [packageName, contract] of Object.entries(publicApi.packages)) {
    add(`package-root:${packageName}`);
    const packageJson = JSON.parse(gitShow(baseline.commit, `packages/${packageName}/package.json`));
    compareExact(Object.keys(packageJson.exports), contract.subpaths, `${packageName} export keys`);
    compareExact(Object.keys(contract.runtimeKeys), contract.subpaths, `${packageName} runtime subpaths`);

    for (const subpath of contract.subpaths) {
      if (subpath !== ".") add(`subpath:${packageName}:${subpath}`);
      const runtimeNames = contract.runtimeKeys[subpath];
      sortedUnique(runtimeNames, `${packageName}${subpath} runtime exports`);
      const specifier = moduleSpecifier(packageName, subpath);
      entryPoints.set(specifier, { packageName, subpath, runtimeNames });

      const declarationNames = subpath === "."
        ? exactDeclarations[packageName]
        : subpath === "./Provider"
        ? exactProviderDeclarations
        : subpath === "./Integration"
        ? exactIntegrationDeclarations
        : undefined;
      invariant(Array.isArray(declarationNames), `no v0.3 declaration authority for ${specifier}`);
      sortedUnique([...declarationNames].sort(), `${specifier} declaration authority normalization`);
      const declarationSet = new Set(declarationNames);
      for (const name of runtimeNames) {
        invariant(declarationSet.has(name), `${specifier} runtime export ${name} is absent from declarations`);
        add(`runtime-export:${packageName}:${subpath}:${name}`);
      }
      const runtimeSet = new Set(runtimeNames);
      for (const name of [...declarationNames].sort()) {
        if (!runtimeSet.has(name)) add(`declaration-only-export:${packageName}:${subpath}:${name}`);
      }
    }
  }

  const coreIndexPath = "packages/effect-build/src/index.ts";
  const coreIndex = gitShow(baseline.commit, coreIndexPath);
  const namespaceProjection = /^export \* as ([A-Za-z_$][\w$]*) from "([^"]+)";/gm;
  for (const match of coreIndex.matchAll(namespaceProjection)) {
    const namespace = match[1];
    const sourcePath = posix.normalize(
      posix.join(posix.dirname(coreIndexPath), match[2].replace(/\.js$/, ".ts")),
    );
    const source = gitShow(baseline.commit, sourcePath);
    const runtimeNames = [...source.matchAll(
      /^export\s+(?:const|class|function|enum)\s+([A-Za-z_$][\w$]*)/gm,
    )].map((entry) => entry[1]);
    const declarationNames = [...source.matchAll(
      /^export\s+(?:const|class|function|enum|type|interface|namespace)\s+([A-Za-z_$][\w$]*)/gm,
    )].map((entry) => entry[1]);
    const uniqueRuntime = [...new Set(runtimeNames)].sort();
    const uniqueDeclarations = [...new Set(declarationNames)].sort();
    const declarationSet = new Set(uniqueDeclarations);
    for (const name of uniqueRuntime) {
      invariant(declarationSet.has(name), `${namespace}.${name} runtime member is absent from declarations`);
      add(`namespace-runtime-export:effect-build:.:${namespace}.${name}`);
    }
    const runtimeSet = new Set(uniqueRuntime);
    for (const name of uniqueDeclarations) {
      if (!runtimeSet.has(name)) add(`namespace-declaration-only-export:effect-build:.:${namespace}.${name}`);
    }
  }

  const bundleObject = extractBalanced(coreIndex, "export const JavaScriptBundle = Object.freeze(", "{");
  const bundleRuntimeNames = bundleObject
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(":", 1)[0].trim())
    .sort();
  sortedUnique(bundleRuntimeNames, "JavaScriptBundle runtime namespace");
  for (const name of bundleRuntimeNames) {
    add(`namespace-runtime-export:effect-build:.:JavaScriptBundle.${name}`);
  }
  const bundleRuntimeSet = new Set(bundleRuntimeNames);
  for (const name of [...exactJavaScriptBundleDeclarations].sort()) {
    if (!bundleRuntimeSet.has(name)) {
      add(`namespace-declaration-only-export:effect-build:.:JavaScriptBundle.${name}`);
    }
  }

  const docsContract = gitShow(baseline.commit, baseline.authorities.documentedOperations.contract);
  const operationLoop = extractBalanced(docsContract, "for (const text of [api, index])", "{");
  const documentedWorkNames = [...operationLoop.matchAll(/expect\(text\)\.toContain\("([^"]+)"\)/g)]
    .map((entry) => entry[1])
    .sort();
  compareExact(
    documentedWorkNames,
    ["compileExecutable", "compileExecutableMatrix", "createExecutable", "withJavaScriptBundle"],
    "v0.3 documented work-operation names",
  );
  for (const { packageName, subpath, runtimeNames } of entryPoints.values()) {
    for (const name of documentedWorkNames) {
      if (runtimeNames.includes(name)) add(`documented-operation:${packageName}:${subpath}:${name}`);
    }
  }

  const docsText = baseline.authorities.documentedOperations.sources
    .map((path) => gitShow(baseline.commit, path))
    .join("\n");
  const aliases = new Map();
  for (const match of docsText.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g)) {
    aliases.set(match[1], match[2]);
  }
  for (const [alias, specifier] of aliases) {
    const entryPoint = entryPoints.get(specifier);
    if (entryPoint === undefined || !entryPoint.runtimeNames.includes("layer")) continue;
    if (new RegExp(`\\b${escapeRegExp(alias)}\\.layer\\b`).test(docsText)) {
      add(`documented-operation:${entryPoint.packageName}:${entryPoint.subpath}:layer`);
    }
  }
  invariant(
    /import\s+\{\s*define\s*\}\s+from\s+["']effect-build\/Provider["']/.test(docsText),
    "v0.3 docs no longer explicitly inventory effect-build/Provider#define",
  );
  add("documented-operation:effect-build:./Provider:define");

  const countByKind = Object.fromEntries(
    [
      "package-root",
      "subpath",
      "runtime-export",
      "declaration-only-export",
      "namespace-runtime-export",
      "namespace-declaration-only-export",
      "documented-operation",
    ].map((kind) => [kind, [...expected].filter((identity) => identity.startsWith(`${kind}:`)).length]),
  );
  compareExact(
    countByKind,
    {
      "package-root": 5,
      subpath: 2,
      "runtime-export": 49,
      "declaration-only-export": 51,
      "namespace-runtime-export": 33,
      "namespace-declaration-only-export": 3,
      "documented-operation": 12,
    },
    "v0.3 exhaustive inventory counts",
  );
  return { expected, countByKind };
};

const validateResearchBasis = (migration) => {
  const { researchBasis } = migration;
  invariant(
    git("rev-parse", `${researchBasis.commit}^{commit}`) === researchBasis.commit,
    `research basis commit ${researchBasis.commit} is unavailable`,
  );
  for (const [path, expectedBlob] of Object.entries(researchBasis.blobs)) {
    invariant(
      git("rev-parse", `${researchBasis.commit}:${path}`) === expectedBlob,
      `research basis blob changed at ${path}`,
    );
    invariant(git("hash-object", path) === expectedBlob, `working-tree research authority drifted: ${path}`);
  }
};

const validateLedger = (migration, expected) => {
  invariant(migration.version === 1, "MIGRATION.json version must be 1");
  invariant(
    migration.status === "complete-v0.3-inventory-frozen-v0.4-targets",
    "migration status must expose complete frozen 0.4 targets",
  );
  invariant(migration.target.surfaceStatus === "frozen", "target surface must be frozen");
  invariant(migration.blockingReconciliations.length === 0, "frozen migration must have zero blockers");
  const serialized = JSON.stringify(migration);
  for (const stale of [
    "priorCandidateTarget",
    "reconciliationRefs",
    "required-unmapped",
    "candidate-not-frozen",
    "not-frozen",
    "conditional",
  ]) invariant(!serialized.includes(stale), `frozen migration contains stale ${stale} state`);
  compareExact(
    migration.target.hardCut,
    {
      deprecatedAliases: false,
      compatibilityDelegates: false,
      fallbacks: false,
      automaticSubstitution: false,
    },
    "hard-cut policy",
  );
  const operationIds = new Set(
    [...gitShow(
      migration.researchBasis.commit,
      "research/post-0.3/reconciliation/r1/CANONICAL-OPERATIONS.csv",
    ).matchAll(/^"(CAN-[^"]+)"/gm)].map((entry) => entry[1]),
  );
  invariant(operationIds.size === 67, `R1 operation ID authority has ${operationIds.size} rows instead of 67`);
  compareExact(
    migration.target.admittedOperationIds,
    ["CAN-BUN-012", "CAN-DENO-010", "CAN-ESB-001", "CAN-ESB-011", "CAN-NODE-001"],
    "frozen admitted R1 operations",
  );
  compareExact(
    migration.target.derivedOperationIds,
    ["BUN-COMPILE-EXECUTABLE-MATRIX", "DENO-COMPILE-EXECUTABLE-MATRIX"],
    "frozen derived operations",
  );
  invariant(
    migration.target.admittedOperationIds.every((id) => operationIds.has(id)),
    "frozen surface admits an unknown R1 operation",
  );
  invariant(operationIds.size - migration.target.admittedOperationIds.length === 62, "non-admitted R1 count is not 62");
  invariant(migration.target.allOtherR1Operations === "defer-or-reject", "all other R1 rows must be defer or reject");

  const packageNames = migration.target.packages.map((entry) => entry.name);
  compareExact(
    packageNames,
    ["effect-build", "effect-build-bun", "effect-build-deno", "effect-build-esbuild", "effect-build-node-sea"],
    "frozen package train",
  );
  const allowedCoordinates = new Set(packageNames);
  let rootNamespaceCount = 0;
  let subpathCount = 0;
  let exportCount = 0;
  for (const packageEntry of migration.target.packages) {
    sortedUnique(packageEntry.rootNamespaces, `${packageEntry.name} root namespaces`);
    const subpathNames = packageEntry.subpaths.map((entry) => entry.subpath);
    invariant(new Set(subpathNames).size === subpathNames.length, `${packageEntry.name} has duplicate subpaths`);
    const projectedNamespaces = packageEntry.subpaths.map((entry) => entry.rootNamespace).sort();
    compareExact(projectedNamespaces, packageEntry.rootNamespaces, `${packageEntry.name} namespace projection`);
    rootNamespaceCount += packageEntry.rootNamespaces.length;
    subpathCount += packageEntry.subpaths.length;
    for (const namespace of packageEntry.rootNamespaces) allowedCoordinates.add(`${packageEntry.name}#${namespace}`);
    for (const subpath of packageEntry.subpaths) {
      invariant(/^\.\/[A-Za-z][A-Za-z/]*$/.test(subpath.subpath), `invalid frozen subpath ${subpath.subpath}`);
      sortedUnique(subpath.exports, `${packageEntry.name}${subpath.subpath} exports`);
      exportCount += subpath.exports.length;
      const specifier = `${packageEntry.name}${subpath.subpath.slice(1)}`;
      for (const name of subpath.exports) allowedCoordinates.add(`${specifier}#${name}`);
    }
  }
  compareExact(
    { packages: packageNames.length, rootNamespaces: rootNamespaceCount, subpaths: subpathCount, exports: exportCount },
    { packages: 5, rootNamespaces: 11, subpaths: 11, exports: 110 },
    "frozen surface topology counts",
  );
  invariant(allowedCoordinates.size === 126, `frozen coordinate universe has ${allowedCoordinates.size} instead of 126`);

  const ruleIds = migration.rules.map((rule) => rule.id);
  invariant(new Set(ruleIds).size === ruleIds.length, "migration rules contain duplicate IDs");
  const ruleById = new Map(migration.rules.map((rule) => [rule.id, rule]));
  const dispositions = new Set(["retain", "rename", "replace", "remove"]);
  for (const rule of migration.rules) {
    invariant(dispositions.has(rule.disposition), `${rule.id} has invalid disposition ${rule.disposition}`);
    invariant(rule.status === "resolved", `${rule.id} is not resolved`);
    invariant(typeof rule.rationale === "string" && rule.rationale.length > 0, `${rule.id} lacks rationale`);
    invariant(Array.isArray(rule.decisionRefs) && rule.decisionRefs.length > 0, `${rule.id} lacks decision refs`);
    for (const reference of rule.decisionRefs) {
      invariant(migration.references[reference] !== undefined, `${rule.id} has unknown decision ref ${reference}`);
    }
    if (rule.disposition === "remove") {
      invariant(rule.target === null, `${rule.id} removal must have a null target`);
      invariant(
        typeof rule.noReplacementReason === "string" && rule.noReplacementReason.length > 0,
        `${rule.id} removal lacks an exact no-replacement reason`,
      );
    } else {
      invariant(
        rule.target?.status === "exact" && typeof rule.target.coordinatesByIdentity === "object",
        `${rule.id} lacks an exact identity target map`,
      );
    }
    for (const reference of rule.operationRefs ?? []) {
      invariant(
        migration.target.admittedOperationIds.includes(reference) || migration.target.derivedOperationIds.includes(reference),
        `${rule.id} references non-admitted operation ${reference}`,
      );
    }
  }

  const mapped = new Set();
  const usedRules = new Set();
  for (const [groupIndex, group] of migration.mappingGroups.entries()) {
    invariant(ruleById.has(group.rule), `mapping group ${groupIndex} uses unknown rule ${group.rule}`);
    invariant(Array.isArray(group.identities) && group.identities.length > 0, `${group.rule} has no identities`);
    sortedUnique(group.identities, `${group.rule} identities`);
    usedRules.add(group.rule);
    for (const identity of group.identities) {
      invariant(!mapped.has(identity), `migration maps ${identity} more than once`);
      mapped.add(identity);
    }
  }
  for (const ruleId of ruleIds) invariant(usedRules.has(ruleId), `migration rule ${ruleId} is unused`);
  invariant(usedRules.size === migration.mappingGroups.length, "each rule must own exactly one mapping group");

  for (const group of migration.mappingGroups) {
    const rule = ruleById.get(group.rule);
    if (rule.disposition === "remove") continue;
    const coordinates = rule.target.coordinatesByIdentity;
    compareExact(Object.keys(coordinates), group.identities, `${rule.id} exact target identity keys`);
    for (const [identity, target] of Object.entries(coordinates)) {
      const targets = Array.isArray(target) ? target : [target];
      invariant(targets.length > 0, `${rule.id} gives ${identity} an empty target set`);
      if (Array.isArray(target)) sortedUnique(target, `${rule.id} ${identity} target set`);
      for (const coordinate of targets) {
        invariant(allowedCoordinates.has(coordinate), `${rule.id} gives ${identity} unknown target ${coordinate}`);
      }
    }
  }

  const missing = [...expected].filter((identity) => !mapped.has(identity)).sort();
  const extra = [...mapped].filter((identity) => !expected.has(identity)).sort();
  invariant(missing.length === 0, `migration omits ${missing.length} v0.3 identities:\n${missing.join("\n")}`);
  invariant(extra.length === 0, `migration invents ${extra.length} v0.3 identities:\n${extra.join("\n")}`);

  const byDisposition = { retain: 0, rename: 0, replace: 0, remove: 0 };
  const byStatus = { resolved: 0 };
  for (const group of migration.mappingGroups) {
    const rule = ruleById.get(group.rule);
    byDisposition[rule.disposition] += group.identities.length;
    byStatus[rule.status] += group.identities.length;
  }
  return {
    mapped: mapped.size,
    rules: migration.rules.length,
    groups: migration.mappingGroups.length,
    frozenSurface: { packages: 5, rootNamespaces: 11, subpaths: 11, exports: 110, coordinates: 126 },
    byDisposition,
    byStatus,
  };
};

const expectRejected = (label, migration, expected, mutate) => {
  const candidate = structuredClone(migration);
  mutate(candidate);
  let rejected = false;
  try {
    validateLedger(candidate, expected);
  } catch {
    rejected = true;
  }
  invariant(rejected, `negative self-test did not reject ${label}`);
};

const runSelfTests = (migration, expected) => {
  expectRejected("missing identity", migration, expected, (candidate) => {
    candidate.mappingGroups[0].identities.pop();
  });
  expectRejected("duplicate identity", migration, expected, (candidate) => {
    candidate.mappingGroups[1].identities.push(candidate.mappingGroups[0].identities[0]);
  });
  expectRejected("invented identity", migration, expected, (candidate) => {
    candidate.mappingGroups[0].identities[0] = "package-root:effect-build-invented";
  });
  expectRejected("compatibility alias", migration, expected, (candidate) => {
    candidate.target.hardCut.deprecatedAliases = true;
  });
  expectRejected("removal without reason", migration, expected, (candidate) => {
    delete candidate.rules.find((rule) => rule.disposition === "remove").noReplacementReason;
  });
  expectRejected("conditional rule", migration, expected, (candidate) => {
    candidate.rules.find((rule) => rule.disposition === "replace").status = "conditional";
  });
  expectRejected("prior candidate target", migration, expected, (candidate) => {
    candidate.rules.find((rule) => rule.disposition === "replace").priorCandidateTarget = { status: "unknown" };
  });
  expectRejected("unknown exact target", migration, expected, (candidate) => {
    const rule = candidate.rules.find((entry) => entry.disposition === "replace");
    rule.target.coordinatesByIdentity[Object.keys(rule.target.coordinatesByIdentity)[0]] = "effect-build/Unknown#Unknown";
  });
  expectRejected("missing exact identity target", migration, expected, (candidate) => {
    const rule = candidate.rules.find((entry) => entry.disposition === "replace");
    delete rule.target.coordinatesByIdentity[Object.keys(rule.target.coordinatesByIdentity)[0]];
  });
  expectRejected("unfrozen surface", migration, expected, (candidate) => {
    candidate.target.surfaceStatus = "not-frozen";
  });
  expectRejected("blocking reconciliation", migration, expected, (candidate) => {
    candidate.blockingReconciliations.push({ id: "REC-INVENTED", required: true, issue: "invented" });
  });
  return 11;
};

const args = process.argv.slice(2);
invariant(args.length === 0 || (args.length === 1 && args[0] === "--json"), "usage: validate-migration.mjs [--json]");

const migration = JSON.parse(readFileSync(migrationPath, "utf8"));
validateResearchBasis(migration);
const { expected, countByKind } = deriveBaseline(migration);
const ledger = validateLedger(migration, expected);
const selfTests = runSelfTests(migration, expected);
const report = {
  result: "MIGRATION_OK",
  baseline: {
    tag: migration.baseline.tag,
    commit: migration.baseline.commit,
    packageTree: migration.baseline.packageTree,
    publicApiBlob: migration.baseline.publicApiBlob,
  },
  researchBasis: migration.researchBasis.commit,
  inventory: countByKind,
  totalInventoryObservations: expected.size,
  ledger,
  blockingReconciliations: migration.blockingReconciliations.map((entry) => entry.id),
  negativeSelfTests: selfTests,
};

if (args[0] === "--json") console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.result);
  console.log(`baseline ${report.baseline.tag} ${report.baseline.commit}`);
  console.log(`package tree ${report.baseline.packageTree}`);
  console.log(`public API blob ${report.baseline.publicApiBlob}`);
  console.log(`inventory ${Object.entries(report.inventory).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log(`mapped=${report.ledger.mapped} rules=${report.ledger.rules} groups=${report.ledger.groups}`);
  console.log(`dispositions ${Object.entries(report.ledger.byDisposition).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log(`status ${Object.entries(report.ledger.byStatus).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log(`frozen-surface ${Object.entries(report.ledger.frozenSurface).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  console.log(`negative-self-tests=${report.negativeSelfTests}`);
  console.log(`blocking-reconciliations=${report.blockingReconciliations.length}`);
}

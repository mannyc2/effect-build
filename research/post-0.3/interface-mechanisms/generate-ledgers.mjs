import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  architectureCandidates,
  mechanismFamilies,
  operations,
  portfolioRejectedOperations,
  portfolioRelations,
  portfolioSelections,
  providerMechanisms,
} from "./research-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  throw new Error("usage: generate-ledgers.mjs [--check]");
}
const checkOnly = args[0] === "--check";
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""').replaceAll("\n", " ")}"`;
const csv = (headers, rows) => `${headers.map(quote).join(",")}\n${rows.map((row) => headers.map((key) => quote(row[key])).join(",")).join("\n")}\n`;
const publish = async (name, contents) => {
  const path = join(here, name);
  if (checkOnly) {
    if (await readFile(path, "utf8") !== contents) throw new Error(`${name} differs from research-data.mjs`);
  } else {
    await writeFile(path, contents);
  }
};
const providerAvailability = Object.freeze({
  bun: "provider pin/license: Bun 1.3.9 @ cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a; MIT",
  deno: "provider pin/license: Deno 2.9.3 @ f39575ecd50602a5b42b1ba8e93849460de9fcf4; MIT",
  esbuild: "provider pin/license: esbuild 0.28.2 @ 609683d892977362a0f99026cb74b96263d728a9; MIT",
  "node-sea": "provider pin/license: Node 26.7.0 @ b4f23d3619c98bed09af93a21192f6080197a8c6; MIT",
  rolldown: "provider pin/license: Rolldown 1.2.4 @ 483c64833c0fb0d1b75f1339accf781c0a09b335; MIT",
});
const assess = (operation, family) => {
  const base = providerMechanisms[operation.provider][family];
  if (!base) throw new Error(`missing mechanism assessment: ${operation.provider}/${family}`);
  const override = operation.mechanismOverrides?.[family] ?? {};
  const helped = override.helped ?? base.helped.includes(operation.id);
  const adjunct = override.adjunct ?? base.adjunct.includes(operation.id);
  const implementation = override.implementation ?? base.implementation.includes(operation.id);
  return { assessment: { ...base, ...override }, helped, adjunct, implementation };
};

await publish("OPERATION-INVENTORY.csv", csv(
  ["operation_id", "provider", "operation", "status", "versions", "evidence", "recommended_boundary"],
  operations.map((value) => ({
    operation_id: value.id,
    provider: value.provider,
    operation: value.operation,
    status: value.status,
    versions: value.versions,
    evidence: value.evidence,
    recommended_boundary: value.recommendation,
  })),
));

const coverage = [];
for (const operation of operations) {
  const mechanisms = providerMechanisms[operation.provider];
  if (!mechanisms) throw new Error(`missing provider mechanisms: ${operation.provider}`);
  for (const [family, familyDescription] of mechanismFamilies) {
    const { assessment, helped, adjunct, implementation } = assess(operation, family);
    coverage.push({
      provider: operation.provider,
      operation_id: operation.id,
      operation: operation.operation,
      mechanism_family: family,
      mechanism: `${assessment.caller}; ${assessment.execution}; ${assessment.transport}; ${assessment.direction}. Family: ${familyDescription}`,
      availability: `${providerAvailability[operation.provider]}; evidence class/support promise: ${assessment.availability}; effect-build-owned adapter/prototype license: MIT where applicable, otherwise not applicable`,
      authority: [assessment.authority, operation.authorityDetail].filter(Boolean).join("; operation invariant: "),
      inputs_results: assessment.inputs,
      lifetime: [assessment.lifetime, operation.lifetimeDetail].filter(Boolean).join("; operation invariant: "),
      outputs: [assessment.outputs, operation.outputDetail].filter(Boolean).join("; operation invariant: "),
      host_distribution: assessment.distribution,
      compatibility: assessment.compatibility,
      operations_fit: helped || adjunct || implementation ? assessment.fit : assessment.nonFit,
      complexity_ledger: assessment.complexity,
      effect_mapping: assessment.effect,
      verdict: helped
        ? assessment.verdict
        : adjunct
          ? `${assessment.verdict}; adjunct only, not a standalone route`
          : implementation
            ? `${assessment.verdict}; implementation relation only, not a selectable route`
            : "bounded negative / reject for this operation",
      confidence: assessment.confidence,
      evidence: operation.evidence,
    });
  }
}
const coverageHeaders = [
  "provider", "operation_id", "operation", "mechanism_family", "mechanism", "availability", "authority",
  "inputs_results", "lifetime", "outputs", "host_distribution", "compatibility", "operations_fit",
  "complexity_ledger", "effect_mapping", "verdict", "confidence", "evidence",
];
await publish("MECHANISM-COVERAGE.csv", csv(coverageHeaders, coverage));

const score = (operation, family, helped, assessment, adjunct = false) => {
  const operationLifetime = [assessment.lifetime, operation.lifetimeDetail]
    .filter(Boolean).join("; required operation law: ");
  const operationOutputs = [assessment.outputs, operation.outputDetail]
    .filter(Boolean).join("; required operation ownership: ");
  const selectionAuthority = [assessment.selectedIdentity, assessment.authority, operation.authorityDetail]
    .filter(Boolean).join("; ");
  if (adjunct) return {
    semantic_fidelity: `adjunct-only-not-standalone: ${assessment.fit}`,
    selected_identity: selectionAuthority || "does not select executor",
    host_independence: `not an executor; distribution: ${assessment.distribution}`,
    callbacks_handles: `not an executor; retained inputs: ${assessment.inputs}`,
    project_authority: assessment.authority,
    lifecycle_isolation: `consumed by primary route; ${operationLifetime}`,
    incremental_backpressure: `not a standalone session; ${assessment.lifetime}`,
    output_ownership: operationOutputs,
    stability_coupling: `${assessment.availability}; compatibility: ${assessment.compatibility}`,
    performance_copies: `${assessment.transport}; ${assessment.complexity}`,
    distribution_security: assessment.distribution,
    testability_observability: `observe artifact and selected primary route; ${assessment.compatibility}`,
    effect_reuse: assessment.effect,
    complexity: assessment.complexity,
    decision: `${assessment.verdict}; adjunct only`,
  };
  if (!helped) return {
    semantic_fidelity: `GATE-FAIL: ${assessment.nonFit}`,
    selected_identity: "not-applicable-after-semantic-gate",
    host_independence: `not-applicable-after-semantic-gate; ${assessment.execution}`,
    callbacks_handles: `not-applicable-after-semantic-gate; ${assessment.inputs}`,
    project_authority: `not-applicable-after-semantic-gate; ${assessment.authority}`,
    lifecycle_isolation: `unproven/non-fit; ${operationLifetime}`,
    incremental_backpressure: `unproven/non-fit; ${assessment.lifetime}`,
    output_ownership: `unproven/non-fit; ${operationOutputs}`,
    stability_coupling: `${assessment.availability}; compatibility: ${assessment.compatibility}`,
    performance_copies: `not evaluated after semantic gate; ${assessment.transport}`,
    distribution_security: `not evaluated after semantic gate; ${assessment.distribution}`,
    testability_observability: `bounded negative backed by ${operation.evidence}`,
    effect_reuse: "none until semantic gate passes",
    complexity: `invalid/non-fit; ${assessment.complexity}`,
    decision: "reject for operation",
  };
  return {
    semantic_fidelity: `faithful in declared domain: ${assessment.fit}; operation status: ${operation.status}`,
    selected_identity: selectionAuthority || "ambient/package-selected identity",
    host_independence: `${assessment.execution}; distribution: ${assessment.distribution}`,
    callbacks_handles: `${assessment.inputs}; ${assessment.lifetime}`,
    project_authority: assessment.authority,
    lifecycle_isolation: operationLifetime,
    incremental_backpressure: `${assessment.lifetime}; state cost: ${assessment.complexity}`,
    output_ownership: operationOutputs,
    stability_coupling: `${assessment.availability}; compatibility: ${assessment.compatibility}; support verdict: ${assessment.verdict}`,
    performance_copies: `${assessment.transport}; ${assessment.complexity}`,
    distribution_security: assessment.distribution,
    testability_observability: `${assessment.compatibility}; evidence: ${operation.evidence}`,
    effect_reuse: assessment.effect,
    complexity: assessment.complexity,
    decision: assessment.verdict,
  };
};

const combineRatings = (operation, components) => {
  const scored = components.map(({ family, helped, adjunct, assessment }) => ({
    family,
    ratings: score(operation, family, helped, assessment, adjunct),
  }));
  return Object.fromEntries(Object.keys(scored[0].ratings).map((field) => {
    const values = scored.map(({ ratings }) => ratings[field]);
    return [field, new Set(values).size === 1
      ? values[0]
      : scored.map(({ family, ratings }) => `${family}:${ratings[field]}`).join(" | ")];
  }));
};

const decisionRows = [];
for (const operation of operations) {
  for (const [candidateId, candidate, families] of architectureCandidates) {
    const assessments = families.map((family) => [family, assess(operation, family)]);
    const portfolioFamilies = portfolioSelections[operation.id];
    if (!portfolioFamilies) throw new Error(`missing portfolio selection: ${operation.id}`);
    const portfolioFamiliesForCandidate = portfolioFamilies.filter((family) => families.includes(family));
    const selected = candidateId === "F"
      ? [portfolioFamilies[0], assess(operation, portfolioFamilies[0])]
      : portfolioFamiliesForCandidate.length > 0
        ? [portfolioFamiliesForCandidate[0], assess(operation, portfolioFamiliesForCandidate[0])]
        : assessments.find(([, value]) => value.helped);
    const [family, selectedAssessment] = selected ?? assessments[0];
    const { assessment, helped, adjunct } = selectedAssessment;
    const portfolioAssessments = portfolioFamilies.map((portfolioFamily) => {
      const value = assess(operation, portfolioFamily);
      return { family: portfolioFamily, ...value };
    });
    if (!portfolioRejectedOperations.includes(operation.id)
      && portfolioAssessments.some(({ helped: helps, adjunct: isAdjunct }) => !helps && !isAdjunct)) {
      throw new Error(`portfolio ${operation.id} selects a family that is neither faithful nor an explicit adjunct`);
    }
    const candidatePortfolioAssessments = portfolioFamiliesForCandidate.map((portfolioFamily) => {
      const value = assess(operation, portfolioFamily);
      return { family: portfolioFamily, ...value };
    });
    const ratings = candidateId === "F"
      ? combineRatings(operation, portfolioAssessments)
      : candidatePortfolioAssessments.length > 1
        ? combineRatings(operation, candidatePortfolioAssessments)
        : score(operation, family, helped, assessment, adjunct);
    if (candidateId === "F") ratings.decision = operation.recommendation;
    decisionRows.push({
      provider: operation.provider,
      operation_id: operation.id,
      candidate_id: candidateId,
      candidate,
      representative_mechanism: candidateId === "F"
        ? portfolioFamilies.join("+")
        : candidatePortfolioAssessments.length > 1
          ? candidatePortfolioAssessments.map(({ family: component }) => component).join("+")
          : family,
      portfolio_relation: candidateId === "F"
        ? portfolioRelations[operation.id] ?? "single selected route"
        : candidatePortfolioAssessments.length > 1
          ? portfolioRelations[operation.id] ?? "multiple selected families within this candidate"
          : adjunct
            ? "adjunct only; requires a selected primary route"
            : "single representative family for this candidate",
      ...ratings,
      falsifier: candidateId === "F"
        ? `Reject this portfolio if any selected route cannot preserve ${operation.operation} under its authority/lifetime record, or if one supported route preserves all required semantics with fewer total states.`
        : helped
          ? `Reject if the mechanism cannot preserve ${operation.operation} under the authority/lifetime stated in MECHANISM-COVERAGE.csv.`
          : adjunct
            ? `Reject as a standalone candidate; retain only as an adjunct to the explicitly selected primary route for ${operation.operation}.`
          : `Reopen only if upstream or a bounded probe supplies a supported faithful ${family} surface for ${operation.operation}.`,
    });
  }
}
const decisionHeaders = [
  "provider", "operation_id", "candidate_id", "candidate", "representative_mechanism", "portfolio_relation", "semantic_fidelity",
  "selected_identity", "host_independence", "callbacks_handles", "project_authority", "lifecycle_isolation",
  "incremental_backpressure", "output_ownership", "stability_coupling", "performance_copies",
  "distribution_security", "testability_observability", "effect_reuse", "complexity", "decision", "falsifier",
];
await publish("DECISION-MATRIX.csv", csv(decisionHeaders, decisionRows));

console.log(JSON.stringify({
  operations: operations.length,
  mechanismFamilies: mechanismFamilies.length,
  mechanismRecords: coverage.length,
  architectureCandidates: architectureCandidates.length,
  decisionRows: decisionRows.length,
}, null, 2));

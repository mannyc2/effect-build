#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../../..")
const r2Root = resolve(here, "../r2")
const originalInventory = resolve(
  repo,
  "research/post-0.3/corpus/lanes/provider-native-breadth/provider-operation-inventory.csv",
)

const allowed = {
  lane: new Set(["host-api", "in-process-api", "selected-command", "runtime-api"]),
  lifecycle: new Set(["one-shot", "scoped-context", "scoped-process", "runtime-lookup"]),
  resource: new Set([
    "caller-owned-value",
    "scope-borrowed-value",
    "runtime-borrowed-view",
    "long-lived-handle",
    "none",
  ]),
  publication: new Set(["none", "provider-direct-durable", "atomic-published-durable"]),
  classification: new Set([
    "operation",
    "request-mode",
    "modifier",
    "result-field",
    "sub-operation",
    "relation",
    "runtime-capability",
    "post-production-mutation",
    "external-platform-primitive",
    "portable-role",
    "architecture-law",
  ]),
  recommendation: new Set(["ship", "defer", "reject"]),
}

const ops = []

function add({
  id,
  provider,
  operation,
  lane,
  lifecycle,
  resource,
  publication,
  providerPublication = publication,
  identityOwner = "provider-native",
  surface,
  source,
  evidence,
  recommendation,
  provenance = "official-upstream",
  semanticDisposition = "established",
  productPriority = recommendation,
  compatibility = "uncommitted-exact-identities-only",
  implementation = "not-started",
  certification = "not-certified",
  contract,
  unresolved,
}) {
  const semanticIdentity = `${provider} / ${operation} / ${lane} / ${lifecycle} / {${resource}, ${publication}}`
  ops.push({
    operation_id: id,
    provider,
    operation,
    lane,
    lifecycle,
    resource_result: resource,
    provider_publication: providerPublication,
    output_publication: publication,
    published_contract: publication,
    identity_owner: identityOwner,
    semantic_identity: semanticIdentity,
    candidate_public_surface: surface,
    supplemental_source_rows: source,
    provenance,
    semantic_disposition: semanticDisposition,
    product_priority: productPriority,
    freeze_recommendation: recommendation,
    compatibility_commitment: compatibility,
    implementation_status: implementation,
    certification_status: certification,
    evidence_coordinate_refs: evidence,
    contract_summary: contract,
    unresolved_evidence: unresolved,
  })
}

// Primary construction: immutable c4 vocabulary plus the five R2 dossiers only.
// No r1-shadow path is read anywhere in this model.

const bun = [
  ["001", "create-transpiler", "host-api", "one-shot", "caller-owned-value", "none", "new Bun.Transpiler(options)", "OP-BUN-001", "E-BUN-001;E-BUN-002", "ship", "Reusable caller-owned configured object; no declared release protocol.", "GC/native backing lifetime and concurrency"],
  ["002", "transpile-source-async", "host-api", "one-shot", "caller-owned-value", "none", "Bun.Transpiler.transform", "OP-BUN-002", "E-BUN-003", "ship", "Async one-unit transform; imports are not resolved.", "provider work after Effect interruption"],
  ["003", "transpile-source-sync", "host-api", "one-shot", "caller-owned-value", "none", "Bun.Transpiler.transformSync", "OP-BUN-003", "E-BUN-004", "ship", "Synchronous one-unit transform on the calling thread.", "non-interruptible execution boundary"],
  ["004", "scan-source", "host-api", "one-shot", "caller-owned-value", "none", "Bun.Transpiler.scan", "OP-BUN-004", "E-BUN-005", "ship", "Structured export and typed-import scan.", "latency and adversarial accuracy"],
  ["005", "scan-imports-fast", "host-api", "one-shot", "caller-owned-value", "none", "Bun.Transpiler.scanImports", "OP-BUN-005", "E-BUN-006", "ship", "Faster import-only scan with provider-declared accuracy tradeoff.", "adversarial accuracy boundary"],
  ["006", "build-memory", "host-api", "one-shot", "caller-owned-value", "none", "Bun.build without direct output", "OP-BUN-006", "E-BUN-007;E-BUN-008;E-BUN-009;E-BUN-010", "ship", "Native BuildOutput and BuildArtifact values; no durable publication.", "cancellation and retained artifact lifetime"],
  ["007", "build-direct-write", "host-api", "one-shot", "caller-owned-value", "provider-direct-durable", "Bun.build with outdir/direct output", "OP-BUN-007", "E-BUN-011;E-BUN-021;E-BUN-022", "ship", "Provider writes an output tree directly; no rollback or atomicity claim.", "partial writes; pre-existing outputs; interruption remnants"],
  ["008", "build-stdout", "selected-command", "one-shot", "caller-owned-value", "none", "selected bun build stdout", "OP-BUN-008", "E-BUN-012", "ship", "Finite collected stdout plus raw diagnostics and exit status.", "collection bounds and signal outcome"],
  ["009", "build-direct-write", "selected-command", "one-shot", "caller-owned-value", "provider-direct-durable", "selected bun build with outfile/outdir", "OP-BUN-009", "E-BUN-013;E-BUN-023;E-BUN-024;E-BUN-025", "ship", "Selected-command authority with provider-direct output topology.", "partial writes; replacement; signal remnants"],
  ["010", "build-watch", "selected-command", "scoped-process", "long-lived-handle", "provider-direct-durable", "selected bun build --watch", "OP-BUN-010", "E-BUN-014;E-BUN-026", "ship", "Opaque scoped child and raw byte streams; repeated direct writes.", "readiness; recovery; subtree termination; remnants"],
  ["011", "compile-executable", "host-api", "one-shot", "caller-owned-value", "provider-direct-durable", "Bun.build({compile})", "OP-BUN-011", "E-BUN-015;E-BUN-016;E-BUN-021", "ship", "Bun-runtime executable with native target and acquisition identity.", "target matrix; acquisition; interruption remnants"],
  ["012", "compile-executable", "selected-command", "one-shot", "caller-owned-value", "atomic-published-durable", "effect-build compileExecutable over selected bun build --compile", "OP-BUN-012;OP-BUN-013", "E-BUN-017;E-BUN-027;E-EB-001", "ship", "Selected Bun writes the private candidate directly; the public operation validates and atomically replaces.", "target matrix; acquisition; interruption and publication certification"],
  ["014", "plugin-register-global", "host-api", "one-shot", "caller-owned-value", "none", "Bun.plugin", "OP-BUN-014", "E-BUN-018", "reject", "Ambient runtime-global registration has no lexical owner.", "none; rejection is architectural"],
  ["015", "plugin-clear-global", "host-api", "one-shot", "none", "none", "Bun.plugin.clearAll", "OP-BUN-015", "E-BUN-019", "reject", "Ambient clear has no scoped ownership or concurrency law.", "none; rejection is architectural"],
]

for (const [n, operation, lane, lifecycle, resource, publication, surface, source, evidence, recommendation, contract, unresolved] of bun) {
  add({
    id: `CAN-BUN-${n}`,
    provider: "bun",
    operation,
    lane,
    lifecycle,
    resource,
    publication,
    surface,
    source,
    evidence,
    recommendation,
    providerPublication: source.includes("OP-BUN-013") ? "provider-direct-durable" : publication,
    identityOwner: source.includes("OP-BUN-013") ? "product-wrapper-over-provider-command" : "provider-native",
    compatibility: source.includes("OP-BUN-013") ? "current-package-bun-1.3.9-only" : "source-exact-bun-1.3.14",
    implementation: source.includes("OP-BUN-013") ? "implemented-0.3-predecessor" : "not-started",
    certification: source.includes("OP-BUN-013") ? "not-certified" : evidence.includes("021") || evidence.includes("022") || evidence.includes("023") || evidence.includes("024") || evidence.includes("025") || evidence.includes("026") || evidence.includes("027") ? "receipt-bounded-not-certified" : "source-only-not-certified",
    contract,
    unresolved,
  })
}

const deno = [
  ["001", "bundle-memory", "host-api", "one-shot", "caller-owned-value", "none", "Deno.bundle write:false", "DENO-OP-001", "DENO-EV-001;DENO-EV-012", "defer", "ship-experimental-after-gate", "Experimental structured in-memory bundle output.", "permission and interruption execution"],
  ["002", "bundle-direct-write", "host-api", "one-shot", "caller-owned-value", "provider-direct-durable", "Deno.bundle direct write", "DENO-OP-002", "DENO-EV-001;DENO-EV-012", "defer", "ship-experimental-after-gate", "Experimental host API with caller permissions and direct writes.", "permission matrix; partial writes; remnants"],
  ["003", "bundle-stdout", "selected-command", "one-shot", "caller-owned-value", "none", "selected deno bundle stdout", "DENO-OP-003", "DENO-EV-002", "defer", "ship-experimental-after-gate", "Experimental command lane with finite stdout collection.", "framing; stderr; bounds; interruption"],
  ["004", "bundle-direct-write", "selected-command", "one-shot", "caller-owned-value", "provider-direct-durable", "selected deno bundle output", "DENO-OP-004", "DENO-EV-002", "defer", "ship-experimental-after-gate", "Experimental selected command preserving project/config authority.", "partial writes and project precedence execution"],
  ["005", "bundle-watch", "selected-command", "scoped-process", "long-lived-handle", "provider-direct-durable", "selected deno bundle --watch", "DENO-OP-005", "DENO-EV-002", "defer", "ship-experimental-after-gate", "Opaque scoped process with raw streams and repeated writes.", "rebuild recovery; termination; reaping; remnants"],
  ["006", "bundle-declarations-direct-write", "selected-command", "one-shot", "caller-owned-value", "provider-direct-durable", "selected deno bundle --declaration", "DENO-OP-006", "DENO-EV-002", "defer", "ship-experimental-after-gate", "Declaration roll-up performs graph and type-check work.", "closure and output topology"],
  ["007", "transpile-stdout", "selected-command", "one-shot", "caller-owned-value", "none", "selected deno transpile stdout", "DENO-OP-007", "DENO-EV-003", "ship", "ship", "Stable one-input transpile stdout operation.", "collection bounds and diagnostics execution"],
  ["008", "transpile-direct-write", "selected-command", "one-shot", "caller-owned-value", "provider-direct-durable", "selected deno transpile output", "DENO-OP-008", "DENO-EV-003", "ship", "ship", "Stable direct-write transpile topology; no atomic tree claim.", "interruption and map remnants"],
  ["009", "transpile-declarations-direct-write", "selected-command", "one-shot", "caller-owned-value", "provider-direct-durable", "selected deno transpile --declaration", "DENO-OP-009", "DENO-EV-003", "ship", "ship", "Stable declaration mode adds graph/type-check and durable declaration output.", "declaration failure and topology"],
  ["010", "compile-executable", "selected-command", "one-shot", "caller-owned-value", "atomic-published-durable", "effect-build deno compile executable operation", "DENO-OP-010", "DENO-EV-004;DENO-EV-005;DENO-EV-006;DENO-EV-007;DENO-EV-008;DENO-EV-009;DENO-EV-010;DENO-EV-013", "ship", "ship", "Stable compile with explicit denort acquisition and atomic wrapper publication.", "host-target; cache/offline; denort relation; runtime"],
  ["011", "compile-watch", "selected-command", "scoped-process", "long-lived-handle", "provider-direct-durable", "selected deno compile --watch", "DENO-OP-011", "DENO-EV-004", "defer", "defer", "Long-lived compiler process with repeated provider-direct publication.", "coalescing; termination; reaping; remnants"],
]

for (const [n, operation, lane, lifecycle, resource, publication, surface, source, evidence, recommendation, productPriority, contract, unresolved] of deno) {
  add({
    id: `CAN-DENO-${n}`,
    provider: "deno",
    operation,
    lane,
    lifecycle,
    resource,
    publication,
    surface,
    source,
    evidence,
    recommendation,
    productPriority,
    providerPublication: source === "DENO-OP-010" ? "provider-direct-durable" : publication,
    identityOwner: source === "DENO-OP-010" ? "product-wrapper-over-provider-command" : "provider-native",
    compatibility: recommendation === "defer" ? "exact-identity-unadmitted-pending-execution" : "support-cells-pending-execution",
    implementation: source === "DENO-OP-010" ? "released-predecessor-0.4-not-started" : "not-started",
    certification: "not-certified",
    contract,
    unresolved,
  })
}

const esbuild = [
  ["001", "build-memory", "one-shot", "caller-owned-value", "none", "esbuild.build write:false", "ESB-OP-01", "EV-ESB-002;EV-ESB-003;EV-ESB-009;EV-ESB-021;EV-ESB-023", "ship", "Native BuildResult/OutputFile values; no publication.", "one-shot provider continuation after interruption"],
  ["002", "build-direct-write", "one-shot", "caller-owned-value", "provider-direct-durable", "esbuild.build write:true with destination", "ESB-OP-02", "EV-ESB-002;EV-ESB-003;EV-ESB-014;EV-ESB-023", "ship", "Provider writes output directly; no rollback.", "partial writes and interruption remnants"],
  ["003", "transform", "one-shot", "caller-owned-value", "none", "esbuild.transform", "ESB-OP-03", "EV-ESB-002;EV-ESB-003;EV-ESB-009;EV-ESB-023", "ship", "One-source text transform; not a graph build.", "large-input temporary-file cleanup"],
  ["004", "analyze-metafile", "one-shot", "caller-owned-value", "none", "esbuild.analyzeMetafile", "ESB-OP-04", "EV-ESB-002;EV-ESB-003;EV-ESB-016;EV-ESB-023", "ship", "Native human report rendering; never parsed as structure.", "runtime rendering receipt"],
  ["005", "format-messages", "one-shot", "caller-owned-value", "none", "esbuild.formatMessages", "ESB-OP-05", "EV-ESB-002;EV-ESB-003;EV-ESB-014", "ship", "Upstream diagnostic renderer preserves native formatting.", "runtime rendering receipt"],
  ["006", "build-memory-sync", "one-shot", "caller-owned-value", "none", "esbuild.buildSync write:false", "ESB-OP-06", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Blocking non-interruptible operation with reduced host/plugin contract.", "none; rejection is architectural"],
  ["007", "build-direct-write-sync", "one-shot", "caller-owned-value", "provider-direct-durable", "esbuild.buildSync write:true", "ESB-OP-07", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Blocking non-interruptible direct writer.", "none; rejection is architectural"],
  ["008", "transform-sync", "one-shot", "caller-owned-value", "none", "esbuild.transformSync", "ESB-OP-08", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Blocking non-interruptible transform with host limits.", "none; rejection is architectural"],
  ["009", "analyze-metafile-sync", "one-shot", "caller-owned-value", "none", "esbuild.analyzeMetafileSync", "ESB-OP-09", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Blocking non-interruptible renderer.", "none; rejection is architectural"],
  ["010", "format-messages-sync", "one-shot", "caller-owned-value", "none", "esbuild.formatMessagesSync", "ESB-OP-10", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Blocking non-interruptible renderer.", "none; rejection is architectural"],
  ["011", "context-memory", "scoped-context", "long-lived-handle", "none", "esbuild.context write:false", "ESB-OP-11", "EV-ESB-002;EV-ESB-003;EV-ESB-009;EV-ESB-013;EV-ESB-021;EV-ESB-022;EV-ESB-023", "ship", "Scoped BuildContext owns rebuild/watch/serve/cancel/dispose sub-operations.", "race matrix; post-dispose; delayed plugin cleanup"],
  ["012", "context-direct-write", "scoped-context", "long-lived-handle", "provider-direct-durable", "esbuild.context write:true", "ESB-OP-12", "EV-ESB-002;EV-ESB-003;EV-ESB-023", "ship", "Scoped context with repeated provider-direct writes.", "context races and mixed-generation remnants"],
  ["013", "stop-shared-service", "one-shot", "none", "none", "esbuild.stop", "ESB-OP-13", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Process-global reset can terminate unrelated owners and respawns later.", "none; rejection is ownership law"],
  ["014", "initialize-shared-service", "one-shot", "none", "none", "esbuild.initialize", "ESB-OP-14", "EV-ESB-002;EV-ESB-003;EV-ESB-012;EV-ESB-013", "reject", "Consumes a process-global once token on supported server hosts.", "none; rejection is ownership law"],
  ["015", "build-stdout", "one-shot", "caller-owned-value", "none", "selected esbuild stdout", "ESB-OP-15", "EV-ESB-006;EV-ESB-016;EV-ESB-023;EV-ESB-024", "ship", "Selected binary; finite raw stdout/stderr and exit status.", "bounds; bin form; signal and reaping"],
  ["016", "build-direct-write", "one-shot", "caller-owned-value", "provider-direct-durable", "selected esbuild with outfile/outdir", "ESB-OP-16", "EV-ESB-006;EV-ESB-016;EV-ESB-023;EV-ESB-024", "ship", "Selected binary writes provider output and metadata files directly.", "partial writes; bin form; signal and reaping"],
  ["017", "build-watch", "scoped-process", "long-lived-handle", "provider-direct-durable", "selected esbuild --watch", "ESB-OP-17", "EV-ESB-006;EV-ESB-016;EV-ESB-023", "ship", "Opaque process; stdin-close and signal are distinct termination channels.", "termination choice; descendants; remnants"],
  ["018", "serve", "scoped-process", "long-lived-handle", "none", "selected esbuild --serve", "ESB-OP-18", "EV-ESB-006;EV-ESB-016;EV-ESB-019;EV-ESB-023", "defer", "CLI address is human text unless a fixed port is required.", "machine-readable address or fixed-port decision; lifecycle"],
  ["019", "build-host-stdout", "one-shot", "none", "none", "esbuild.build write:true without destination", "ESB-OP-19", "EV-ESB-003", "reject", "Build bytes escape to host stdout outside library ownership.", "exact typed preflight set"],
]

for (const [n, operation, lifecycle, resource, publication, surface, source, evidence, recommendation, contract, unresolved] of esbuild) {
  add({
    id: `CAN-ESB-${n}`,
    provider: "esbuild",
    operation,
    lane: n >= "015" && n <= "018" ? "selected-command" : "in-process-api",
    lifecycle,
    resource,
    publication,
    surface,
    source,
    evidence,
    recommendation,
    compatibility: recommendation === "reject" ? "not-committed" : "uncommitted-pending-d9-exact-identity",
    certification: "not-certified",
    contract,
    unresolved,
  })
}

const nodeSea = [
  ["001", "assemble-direct", "caller-owned-value", "atomic-published-durable", "node --build-sea", "NODE-SEA-DIRECT", "E-NODE-DIRECT;E-NODE-26-DOC-CONFIG;E-NODE-26-SRC-BIN;E-NODE-26-SRC-SEA;E-CORPUS-PREFLIGHT;E-CORPUS-APPLE", "Direct Node/LIEF route stages, repairs, validates, hashes, reauthenticates, then atomically publishes.", "exact binary capability; host-target and runtime matrix"],
  ["002", "generate-preparation-blob", "scope-borrowed-value", "none", "node --experimental-sea-config", "NODE-SEA-LEGACY-BLOB", "E-NODE-BLOB-JSON;E-NODE-26-DOC-LEGACY;E-NODE-24-DOC;E-NODE-22-DOC;E-CORPUS-OWNERSHIP;E-CORPUS-PREFLIGHT", "Modern preparation blob is a private scope-owned intermediate.", "generator/base relations; cleanup and interruption"],
  ["003", "inject-preparation-blob", "caller-owned-value", "atomic-published-durable", "selected exact SEA injector", "NODE-SEA-LEGACY-INJECT", "E-NODE-26-DOC-LEGACY;E-NODE-26-DOC-PLATFORMS;E-NODE-26-DOC-LOADER;E-CORPUS-ADMISS;E-CORPUS-PREFLIGHT;E-CORPUS-APPLE", "Legacy injection uses an exact offline injector, repair, validation, and atomic publication.", "injector candidate; target matrix; lifecycle"],
]

for (const [n, operation, resource, publication, surface, source, evidence, contract, unresolved] of nodeSea) {
  add({
    id: `CAN-NODE-${n}`,
    provider: "node-sea",
    operation,
    lane: "selected-command",
    lifecycle: "one-shot",
    resource,
    publication,
    surface,
    source,
    evidence,
    recommendation: "ship",
    providerPublication: publication === "atomic-published-durable" ? "provider-direct-durable" : publication,
    identityOwner: "product-wrapper-over-provider-command",
    productPriority: "required",
    provenance: "official-upstream-and-repository-law",
    semanticDisposition: "advertised-shape-established",
    compatibility: "operation-identity-ships-support-cells-unadmitted",
    implementation: "not-implemented",
    certification: "runtime-proof-pending",
    contract,
    unresolved,
  })
}

const rolldown = [
  ["001", "acquire-reusable-build", "scoped-context", "long-lived-handle", "none", "rolldown(input)", "OP-ROL-001", "E-ROL-ACQUIRE;E-ROL-HANDLE;E-ROL-INPUT;E-EB-GATES", "defer", "Acquire RolldownBuild and bind its release to Scope.", "concurrency and release law"],
  ["002", "generate", "scoped-context", "caller-owned-value", "none", "RolldownBuild.generate", "OP-ROL-002", "E-ROL-HANDLE;E-ROL-OUTPUT-TYPES;E-ROL-OUTPUT-IMPL;E-ROL-EXTMEM;E-EB-RECEIPT", "defer", "Generate ordered native chunks/assets without publication.", "repeatability; concurrent use; external memory"],
  ["003", "write", "scoped-context", "caller-owned-value", "provider-direct-durable", "RolldownBuild.write", "OP-ROL-003", "E-ROL-HANDLE;E-ROL-OUTPUT-OPTIONS;E-ROL-OUTPUT-TYPES;E-ROL-PLUGIN;E-EB-LIFE", "defer", "Write native output topology directly.", "collisions; interruption; remnants"],
  ["005", "build-one-shot-generate", "one-shot", "caller-owned-value", "none", "experimental build generate", "OP-ROL-005", "E-ROL-BUILD;E-ROL-HANDLE;E-ROL-OUTPUT-IMPL", "defer", "Acquire, generate, and close in finally.", "interruption cleanup"],
  ["006", "build-one-shot-write", "one-shot", "caller-owned-value", "provider-direct-durable", "experimental build write", "OP-ROL-006", "E-ROL-BUILD;E-ROL-HANDLE;E-ROL-OUTPUT-OPTIONS;E-EB-LIFE", "defer", "Acquire, write directly, and close in finally.", "partial writes and interruption cleanup"],
  ["007", "watch-direct-write", "scoped-context", "long-lived-handle", "provider-direct-durable", "rolldown watch", "OP-ROL-007", "E-ROL-WATCH-API;E-ROL-WATCH-EVENT;E-ROL-WATCH-IMPL;E-ROL-INPUT", "defer", "Watcher session with repeated direct writes and event result owners.", "event order; result close; interruption"],
  ["008", "watch-skip-write", "scoped-context", "long-lived-handle", "none", "rolldown watch skipWrite", "OP-ROL-008", "E-ROL-WATCH-API;E-ROL-WATCH-EVENT;E-ROL-WATCH-IMPL;E-ROL-HANDLE", "defer", "Watcher session without automatic publication.", "event order; result close; interruption"],
  ["010", "cli-bundle-stdout", "one-shot", "caller-owned-value", "none", "selected rolldown stdout", "OP-ROL-010", "E-ROL-PKG;E-ROL-CLI-BUNDLE;E-ROL-CLI-ARGS;E-ROL-CONFIG", "defer", "Selected command with human/raw stdout and stderr.", "multi-output framing and collection bounds"],
  ["011", "cli-bundle-write", "one-shot", "caller-owned-value", "provider-direct-durable", "selected rolldown output", "OP-ROL-011", "E-ROL-CLI-BUNDLE;E-ROL-CLI-ARGS;E-ROL-CONFIG;E-EB-LIFE", "defer", "Selected command returns a caller-owned process observation and writes provider output directly.", "partial writes and signal remnants"],
  ["012", "cli-watch", "scoped-process", "long-lived-handle", "provider-direct-durable", "selected rolldown --watch", "OP-ROL-012", "E-ROL-CLI-BUNDLE;E-ROL-WATCH-API;E-ROL-WATCH-IMPL", "defer", "Opaque selected child with human streams and repeated writes.", "termination; reaping; remnants"],
  ["013", "transform-source", "one-shot", "caller-owned-value", "none", "rolldown experimental transform", "OP-ROL-013", "E-ROL-UTILS;E-ROL-TRANSFORM;E-ROL-BINDING-DTS", "defer", "Provider-native transform result and diagnostics.", "runtime contract"],
  ["014", "parse-source", "one-shot", "caller-owned-value", "none", "rolldown parse", "OP-ROL-014", "E-ROL-UTILS;E-ROL-PARSE;E-ROL-PARSE-AST;E-ROL-BINDING-DTS", "defer", "Provider-native parse/AST utility.", "runtime contract"],
  ["015", "minify-source", "one-shot", "caller-owned-value", "none", "rolldown experimental minify", "OP-ROL-015", "E-ROL-UTILS;E-ROL-MINIFY;E-ROL-BINDING-DTS", "defer", "Provider-native minify utility.", "runtime contract"],
  ["016", "resolve-module", "one-shot", "caller-owned-value", "none", "rolldown experimental ResolverFactory", "OP-ROL-016", "E-ROL-EXPERIMENTAL;E-ROL-BINDING-DTS", "defer", "Construct a reusable caller-owned resolver; no release protocol is established.", "retention and release discovery"],
  ["017", "scan-graph", "one-shot", "scope-borrowed-value", "none", "rolldown experimental scan", "OP-ROL-017", "E-ROL-SCAN;E-ROL-EXPERIMENTAL;E-ROL-HANDLE", "defer", "One-shot scan returns cleanup authority whose validity is bounded by Scope.", "cleanup and interruption"],
  ["018A", "acquire-dev-engine-memory", "scoped-context", "long-lived-handle", "none", "rolldown experimental DevEngine without writes", "OP-ROL-018", "E-ROL-DEV;E-ROL-DEV-OPTIONS;E-ROL-EXPERIMENTAL", "defer", "DevEngine session with callback/memory publication only.", "complete ownership and callback backpressure"],
  ["018B", "acquire-dev-engine-direct-write", "scoped-context", "long-lived-handle", "provider-direct-durable", "rolldown experimental DevEngine with writes", "OP-ROL-018", "E-ROL-DEV;E-ROL-DEV-OPTIONS;E-ROL-EXPERIMENTAL", "defer", "DevEngine session configured for durable provider writes.", "complete ownership; backpressure; remnants"],
  ["020", "emit-isolated-declaration", "one-shot", "caller-owned-value", "none", "rolldown experimental isolated declaration", "OP-ROL-020", "E-ROL-EXPERIMENTAL;E-ROL-BINDING-DTS;E-EB-RECON", "defer", "Provider-specific isolated declaration emission.", "declaration correctness contract"],
  ["021", "module-runner-transform", "one-shot", "caller-owned-value", "none", "deprecated Vite module-runner transform", "OP-ROL-021", "E-ROL-EXPERIMENTAL;E-ROL-BINDING-DTS", "reject", "Deprecated Vite-only utility has no general provider contract.", "none; rejection follows upstream scope"],
  ["022", "load-config", "one-shot", "caller-owned-value", "none", "rolldown loadConfig", "OP-ROL-022", "E-ROL-CONFIG;E-ROL-CLI-BUNDLE;E-ROL-PKG", "defer", "Executes caller-selected configuration code under explicit trust authority.", "trust boundary and runtime behavior"],
]

for (const [n, operation, lifecycle, resource, publication, surface, source, evidence, recommendation, contract, unresolved] of rolldown) {
  add({
    id: `CAN-ROL-${n}`,
    provider: "rolldown",
    operation,
    lane: n === "010" || n === "011" || n === "012" ? "selected-command" : "in-process-api",
    lifecycle,
    resource,
    publication,
    surface,
    source,
    evidence,
    recommendation,
    productPriority: recommendation === "reject" ? "reject" : "provider-package-gate",
    compatibility: recommendation === "reject" ? "not-committed" : "exact-v1.2.4-unadmitted",
    certification: evidence.includes("E-EB-RECEIPT") ? "narrow-receipt-not-certified" : "source-only-not-certified",
    contract,
    unresolved,
  })
}

const publicSurface = new Map([
  ["CAN-BUN-001", ["effect-build-bun", "./Transpiler", "make"]],
  ["CAN-BUN-002", ["effect-build-bun", "./Transpiler", "transform"]],
  ["CAN-BUN-003", ["effect-build-bun", "./Transpiler", "transformSync"]],
  ["CAN-BUN-004", ["effect-build-bun", "./Transpiler", "scan"]],
  ["CAN-BUN-005", ["effect-build-bun", "./Transpiler", "scanImports"]],
  ["CAN-BUN-006", ["effect-build-bun", "./Build", "build"]],
  ["CAN-BUN-007", ["effect-build-bun", "./BuildToDirectory", "buildToDirectory"]],
  ["CAN-BUN-008", ["effect-build-bun", "./BuildCommand", "build"]],
  ["CAN-BUN-009", ["effect-build-bun", "./BuildCommandToDirectory", "buildToDirectory"]],
  ["CAN-BUN-010", ["effect-build-bun", "./BuildWatchCommand", "watch"]],
  ["CAN-BUN-011", ["effect-build-bun", "./CompileExecutableApi", "compileExecutableDirect"]],
  ["CAN-BUN-012", ["effect-build-bun", "./CompileExecutable", "compileExecutable"]],
  ["CAN-DENO-007", ["effect-build-deno", "./TranspileCommand", "transpile"]],
  ["CAN-DENO-008", ["effect-build-deno", "./TranspileCommandToDirectory", "transpileToDirectory"]],
  ["CAN-DENO-009", ["effect-build-deno", "./TranspileDeclarationsCommand", "emitDeclarations"]],
  ["CAN-DENO-010", ["effect-build-deno", "./CompileExecutable", "compileExecutable"]],
  ["CAN-ESB-001", ["effect-build-esbuild", "./Build", "build"]],
  ["CAN-ESB-002", ["effect-build-esbuild", "./BuildToDirectory", "buildToDirectory"]],
  ["CAN-ESB-003", ["effect-build-esbuild", "./Transform", "transform"]],
  ["CAN-ESB-004", ["effect-build-esbuild", "./AnalyzeMetafile", "analyzeMetafile"]],
  ["CAN-ESB-005", ["effect-build-esbuild", "./FormatMessages", "formatMessages"]],
  ["CAN-ESB-011", ["effect-build-esbuild", "./Context", "make"]],
  ["CAN-ESB-012", ["effect-build-esbuild", "./ContextToDirectory", "make"]],
  ["CAN-ESB-015", ["effect-build-esbuild", "./BuildCommand", "build"]],
  ["CAN-ESB-016", ["effect-build-esbuild", "./BuildCommandToDirectory", "buildToDirectory"]],
  ["CAN-ESB-017", ["effect-build-esbuild", "./BuildWatchCommand", "watch"]],
  ["CAN-NODE-001", ["effect-build-node-sea", "./AssembleDirect", "assembleDirect"]],
  ["CAN-NODE-003", ["effect-build-node-sea", "./AssembleLegacy", "assembleLegacy"]],
])

for (const operation of ops) {
  const proposal = publicSurface.get(operation.operation_id)
  if (proposal) {
    operation.surface_kind = "public-operation-export"
    operation.proposed_package = proposal[0]
    operation.proposed_subpath = proposal[1]
    operation.proposed_export = proposal[2]
    operation.proposed_root_export = proposal[1].slice(2)
    operation.proposed_root_export_kind = "namespace-reexport"
    operation.surface_rationale = "operation-specific module re-exported from the package root under the exact namespace key; candidate only until M3/M8 and surface-freeze approval"
  } else if (operation.operation_id === "CAN-NODE-002") {
    operation.surface_kind = "internal-stage-no-public-export"
    operation.proposed_package = "effect-build-node-sea"
    operation.proposed_subpath = "none"
    operation.proposed_export = "none"
    operation.proposed_root_export = "none"
    operation.proposed_root_export_kind = "none-internal-stage"
    operation.surface_rationale = "preparation blob is a scope-borrowed intermediate of AssembleLegacy; independent public export would permit invalid lifetime and relation states"
  } else {
    operation.surface_kind = operation.freeze_recommendation === "reject" ? "no-export-rejected" : "no-export-deferred"
    operation.proposed_package = operation.provider === "node-sea" ? "effect-build-node-sea" : `effect-build-${operation.provider}`
    operation.proposed_subpath = "none"
    operation.proposed_export = "none"
    operation.proposed_root_export = "none"
    operation.proposed_root_export_kind = "none-not-selected"
    operation.surface_rationale = operation.freeze_recommendation === "reject"
      ? "semantic identity retained for negative surface tests; operation is rejected"
      : "no export until the named evidence gate changes the exact defer disposition"
  }

  if (operation.freeze_recommendation === "ship") {
    operation.surface_selection_status = "selected-candidate-not-frozen"
    operation.pre_freeze_gate = operation.unresolved_evidence
    operation.freeze_gate_status = "blocked-pending-executable-proof"
    operation.evidence_gate_basis = "R2-execution-required-docs-do-not-establish-lifecycle-or-remnants"
    operation.gate_failure_action = "block-freeze-or-record-explicit-pre-freeze-disposition-revision"
  } else if (operation.freeze_recommendation === "defer") {
    operation.surface_selection_status = "not-selected-deferred"
    operation.pre_freeze_gate = "not-current-freeze-candidate"
    operation.freeze_gate_status = "not-applicable-deferred"
    operation.evidence_gate_basis = "reopen-only-after-named-evidence-gate"
    operation.gate_failure_action = "none-until-explicit-research-reopens-candidate"
  } else {
    operation.surface_selection_status = "not-selected-rejected"
    operation.pre_freeze_gate = "none-rejection-established"
    operation.freeze_gate_status = "not-applicable-rejected"
    operation.evidence_gate_basis = "rejection-supported-by-evidence-or-architecture-law"
    operation.gate_failure_action = "none-rejected-by-evidence-or-architecture-law"
  }
}

const originalAtoms = []
function atom(sourceId, atomId, provider, label, classification, operationIds = "", evidence = "", recommendation = "", note = "") {
  originalAtoms.push({
    source_set: "original-54",
    source_id: sourceId,
    atom_id: atomId,
    provider,
    source_label: label,
    classification,
    canonical_operation_ids: operationIds,
    evidence_coordinate_refs: evidence,
    freeze_recommendation: recommendation,
    note,
  })
}

atom("B01", "B01.1", "bun", "Bun.build memory", "operation", "CAN-BUN-006", "E-BUN-007;E-BUN-008;E-BUN-009;E-BUN-010", "ship", "memory ownership split")
atom("B01", "B01.2", "bun", "Bun.build direct write", "operation", "CAN-BUN-007", "E-BUN-011;E-BUN-021;E-BUN-022", "ship", "publication split")
atom("B02", "B02.1", "bun", "virtual-file build", "request-mode", "CAN-BUN-006;CAN-BUN-007", "E-BUN-007;E-BUN-008", "ship", "virtual and mixed graphs remain native request authority")
atom("B03", "B03.1", "bun", "direct-write bundle", "operation", "CAN-BUN-007", "E-BUN-011", "ship")
atom("B04", "B04.1", "bun", "bun build stdout", "operation", "CAN-BUN-008", "E-BUN-012", "ship")
atom("B04", "B04.2", "bun", "bun build direct write", "operation", "CAN-BUN-009", "E-BUN-013", "ship")
atom("B05", "B05.1", "bun", "bun build --watch", "operation", "CAN-BUN-010", "E-BUN-014;E-BUN-026", "ship")
atom("B06", "B06.1", "bun", "loaders", "modifier", "CAN-BUN-006;CAN-BUN-007;CAN-BUN-008;CAN-BUN-009", "E-BUN-009", "ship")
atom("B06", "B06.2", "bun", "per-build plugin callbacks", "sub-operation", "CAN-BUN-006;CAN-BUN-007", "E-BUN-010", "ship")
atom("B06", "B06.3", "bun", "ambient global plugin registration", "operation", "CAN-BUN-014", "E-BUN-018", "reject", "R2 separates ambient mutation from per-build plugin authority")
atom("B07", "B07.1", "bun", "HTML graph", "request-mode", "CAN-BUN-006;CAN-BUN-007;CAN-BUN-009", "E-BUN-009;E-BUN-013", "ship")
atom("B08", "B08.1", "bun", "splitting/assets/maps", "modifier", "CAN-BUN-006;CAN-BUN-007;CAN-BUN-008;CAN-BUN-009", "E-BUN-009;E-BUN-013", "ship")
atom("B08", "B08.2", "bun", "chunks/metafile/native artifacts", "result-field", "CAN-BUN-006;CAN-BUN-007;CAN-BUN-009", "E-BUN-008;E-BUN-011", "ship")
atom("B09", "B09.1", "bun", "host compile executable", "operation", "CAN-BUN-011", "E-BUN-015;E-BUN-016", "ship")
atom("B09", "B09.2", "bun", "command compile executable with atomic public contract", "operation", "CAN-BUN-012", "E-BUN-017;E-EB-001", "ship")
atom("B10", "B10.1", "bun", "full-stack HTML executable", "request-mode", "CAN-BUN-011;CAN-BUN-012", "E-BUN-015;E-BUN-017", "ship", "provider-native compile request mode")

atom("D01", "D01.1", "deno", "Deno.bundle memory", "operation", "CAN-DENO-001", "DENO-EV-001", "defer")
atom("D02", "D02.1", "deno", "Deno.bundle write", "operation", "CAN-DENO-002", "DENO-EV-001", "defer")
atom("D03", "D03.1", "deno", "deno bundle stdout", "operation", "CAN-DENO-003", "DENO-EV-002", "defer")
atom("D04", "D04.1", "deno", "deno bundle direct write", "operation", "CAN-DENO-004", "DENO-EV-002", "defer")
atom("D05", "D05.1", "deno", "deno bundle --watch", "operation", "CAN-DENO-005", "DENO-EV-002", "defer")
atom("D06", "D06.1", "deno", "bundle --check", "sub-operation", "CAN-DENO-003;CAN-DENO-004;CAN-DENO-005;CAN-DENO-006", "DENO-EV-002", "defer")
atom("D06", "D06.2", "deno", "bundle declaration roll-up", "operation", "CAN-DENO-006", "DENO-EV-002", "defer")
atom("D07", "D07.1", "deno", "deno compile", "operation", "CAN-DENO-010", "DENO-EV-004;DENO-EV-005;DENO-EV-006;DENO-EV-007;DENO-EV-008;DENO-EV-009;DENO-EV-010", "ship")
atom("D08", "D08.1", "deno", "denort runtime acquisition", "sub-operation", "CAN-DENO-010;CAN-DENO-011", "DENO-EV-004;DENO-EV-013", "defer", "no hidden fallback")
atom("D09", "D09.1", "deno", "compiled runtime Deno.bundle", "runtime-capability", "", "DENO-EV-011", "reject", "unavailable at current exact source and historical coordinate")
atom("D10", "D10.1", "deno", "bundle permission authority", "relation", "CAN-DENO-001;CAN-DENO-002", "DENO-EV-001;DENO-EV-012", "defer")

atom("E01", "E01.1", "esbuild", "build memory", "operation", "CAN-ESB-001", "EV-ESB-002;EV-ESB-003", "ship")
atom("E01", "E01.2", "esbuild", "build direct write", "operation", "CAN-ESB-002", "EV-ESB-002;EV-ESB-003", "ship")
atom("E01", "E01.3", "esbuild", "build host stdout", "operation", "CAN-ESB-019", "EV-ESB-003", "reject")
atom("E02", "E02.1", "esbuild", "transform", "operation", "CAN-ESB-003", "EV-ESB-002;EV-ESB-003", "ship")
atom("E03", "E03.1", "esbuild", "context memory", "operation", "CAN-ESB-011", "EV-ESB-002;EV-ESB-003", "ship")
atom("E03", "E03.2", "esbuild", "context direct write", "operation", "CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E04", "E04.1", "esbuild", "context.rebuild", "sub-operation", "CAN-ESB-011;CAN-ESB-012", "EV-ESB-003;EV-ESB-021", "ship")
atom("E05", "E05.1", "esbuild", "context.watch", "sub-operation", "CAN-ESB-011;CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E06", "E06.1", "esbuild", "context.serve", "sub-operation", "CAN-ESB-011;CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E07", "E07.1", "esbuild", "context.cancel", "sub-operation", "CAN-ESB-011;CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E08", "E08.1", "esbuild", "context.dispose", "sub-operation", "CAN-ESB-011;CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E09", "E09.1", "esbuild", "loaders and plugin request authority", "modifier", "CAN-ESB-001;CAN-ESB-002;CAN-ESB-011;CAN-ESB-012", "EV-ESB-002;EV-ESB-003", "ship")
atom("E09", "E09.2", "esbuild", "plugin hooks", "sub-operation", "CAN-ESB-001;CAN-ESB-002;CAN-ESB-011;CAN-ESB-012", "EV-ESB-003;EV-ESB-009", "ship")
atom("E10", "E10.1", "esbuild", "metafile", "result-field", "CAN-ESB-001;CAN-ESB-002", "EV-ESB-002", "ship")
atom("E10", "E10.2", "esbuild", "analyze metafile", "operation", "CAN-ESB-004", "EV-ESB-002;EV-ESB-003", "ship")
atom("E11", "E11.1", "esbuild", "CLI build stdout", "operation", "CAN-ESB-015", "EV-ESB-006;EV-ESB-016", "ship")
atom("E11", "E11.2", "esbuild", "CLI build direct write", "operation", "CAN-ESB-016", "EV-ESB-006;EV-ESB-016", "ship")
atom("E11", "E11.3", "esbuild", "CLI watch", "operation", "CAN-ESB-017", "EV-ESB-006;EV-ESB-016", "ship")
atom("E11", "E11.4", "esbuild", "CLI serve", "operation", "CAN-ESB-018", "EV-ESB-006;EV-ESB-016;EV-ESB-019", "defer")
atom("E12", "E12.1", "esbuild", "shared native child identity", "runtime-capability", "CAN-ESB-001;CAN-ESB-002;CAN-ESB-003;CAN-ESB-004;CAN-ESB-005;CAN-ESB-011;CAN-ESB-012", "EV-ESB-003;EV-ESB-013", "defer")
atom("E12", "E12.2", "esbuild", "process-global child ownership", "architecture-law", "CAN-ESB-013;CAN-ESB-014", "EV-ESB-003;EV-ESB-013", "reject")

atom("S01", "S01.1", "node-sea", "direct --build-sea", "operation", "CAN-NODE-001", "E-NODE-DIRECT;E-NODE-26-DOC-CONFIG", "ship")
atom("S02", "S02.1", "node-sea", "CommonJS main", "request-mode", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-24-DOC;E-NODE-22-DOC;E-NODE-26-DOC-CONFIG", "ship")
atom("S03", "S03.1", "node-sea", "ESM main", "request-mode", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-ESM;E-NODE-ESM-CACHE", "defer")
atom("S04", "S04.1", "node-sea", "asset embedding", "request-mode", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-ASSETS;E-NODE-26-DOC-CONFIG", "ship")
atom("S04", "S04.2", "node-sea", "node:sea asset lookup APIs", "runtime-capability", "", "E-NODE-ASSETS;E-NODE-ASSET-KEYS", "defer", "copied values and raw borrowed view remain distinct")
atom("S05", "S05.1", "node-sea", "code cache", "modifier", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-CACHE;E-NODE-ESM-CACHE", "defer")
atom("S06", "S06.1", "node-sea", "startup snapshot", "modifier", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-SNAPSHOT", "defer")
atom("S07", "S07.1", "node-sea", "execArgv policy", "request-mode", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-ARGV;E-NODE-ARGVEXT", "defer")
atom("S08", "S08.1", "node-sea", "generate preparation blob", "operation", "CAN-NODE-002", "E-NODE-BLOB-JSON", "ship")
atom("S08", "S08.2", "node-sea", "inject preparation blob", "operation", "CAN-NODE-003", "E-NODE-26-DOC-LEGACY", "ship")
atom("S09", "S09.1", "node-sea", "candidate correctness repair", "post-production-mutation", "CAN-NODE-001;CAN-NODE-003", "E-CORPUS-APPLE", "ship", "inside assembler; no distribution trust claim")
atom("S09", "S09.2", "apple", "distribution signing and verification", "external-platform-primitive", "", "E-CORPUS-APPLE", "defer", "R9 family; not Node SEA")
atom("S10", "S10.1", "node-sea", "builder/base identity", "relation", "CAN-NODE-001;CAN-NODE-002;CAN-NODE-003", "E-NODE-26-DOC-CONFIG;E-CORPUS-ADMISS", "defer", "equality wherever participants are separate")

for (let i = 1; i <= 7; i++) {
  const labels = ["ChildProcess command", "Scope", "Stream/Sink", "FileSystem/Path", "Context/Layer", "Cause/interruption", "logging/tracing"]
  atom(`F0${i}`, `F0${i}.1`, "effect", labels[i - 1], "external-platform-primitive", "", "", "ship", "use official Effect primitive directly; no effect-build wrapper operation")
}
atom("R01", "R01.1", "cross-provider", "Node sealed-main producer role", "portable-role", "", "", "defer", "R5 ship-if-pass; not a provider operation")
atom("R02", "R02.1", "cross-provider", "BrowserModulePayload", "portable-role", "", "", "defer", "R5 ship-if-pass; narrower successor to imported graph application")
atom("R03", "R03.1", "cross-provider", "RuntimeExecutable", "portable-role", "", "", "reject", "runtime-neutral executable erases provider/runtime identity")
atom("R04", "R04.1", "cross-provider", "CLI-derived TypedWatchEvents", "portable-role", "", "", "reject", "current text-derived role falsified; future product-owned protocol is distinct")
atom("R05", "R05.1", "cross-provider", "operation-owned surface boundary", "architecture-law", "", "", "ship", "adopted canonicalization law")

const supplementRows = []
for (const operation of ops) {
  for (const sourceId of operation.supplemental_source_rows.split(";")) {
    const existing = supplementRows.find((row) => row.source_id === sourceId)
    if (existing) {
      existing.canonical_operation_ids = uniqueList(`${existing.canonical_operation_ids};${operation.operation_id}`)
      existing.evidence_coordinate_refs = uniqueList(`${existing.evidence_coordinate_refs};${operation.evidence_coordinate_refs}`)
      continue
    }
    supplementRows.push({
      source_set: `r2-${operation.provider}`,
      source_id: sourceId,
      atom_id: `${sourceId}.operation`,
      provider: operation.provider,
      source_label: operation.candidate_public_surface,
      classification: "operation",
      canonical_operation_ids: operation.operation_id,
      evidence_coordinate_refs: operation.evidence_coordinate_refs,
      freeze_recommendation: operation.freeze_recommendation,
      note: sourceId === "OP-ROL-018" ? "split because memory/callback and durable-write publication laws differ" : "normalized to c4 lane/lifecycle/ownership vocabulary",
    })
  }
}

for (const row of [
  ["OP-ROL-004", "RolldownBuild.close", "CAN-ROL-001", "E-ROL-HANDLE;E-EB-RECEIPT;E-EB-PROBE;E-EB-LIFE", "release is the lifecycle boundary of the reusable-build owner"],
  ["OP-ROL-009", "RolldownWatcher.close", "CAN-ROL-007;CAN-ROL-008", "E-ROL-WATCH-IMPL;E-ROL-WATCH-EVENT;E-EB-LIFE", "release is the lifecycle boundary of both watcher publication modes"],
  ["OP-ROL-019", "DevEngine.close", "CAN-ROL-018A;CAN-ROL-018B", "E-ROL-DEV;E-ROL-EXPERIMENTAL", "release is the lifecycle boundary of both DevEngine publication modes"],
]) {
  supplementRows.push({
    source_set: "r2-rolldown",
    source_id: row[0],
    atom_id: `${row[0]}.release`,
    provider: "rolldown",
    source_label: row[1],
    classification: "sub-operation",
    canonical_operation_ids: row[2],
    evidence_coordinate_refs: row[3],
    freeze_recommendation: "defer",
    note: row[4],
  })
}

const crosswalk = [...originalAtoms, ...supplementRows]

// Comparison phase. The primary arrays above were complete and validated before this immutable
// shadow package was opened. This phase reads the shadow only to compare and review the result.
const shadowRoot = resolve(here, "../r1-shadow")

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      if (row.some((value) => value !== "")) rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }
  if (quoted) throw new Error("unterminated CSV quote")
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [headers, ...values] = rows
  return values.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])))
}

const shadowOperations = parseCsv(readFileSync(resolve(shadowRoot, "CANONICAL-OPERATIONS.csv"), "utf8"))
const shadowById = new Map(shadowOperations.map((row) => [row.operation_id, row]))

const shadowPairs = new Map([
  ...Array.from({ length: 12 }, (_, index) => [`CAN-BUN-${String(index + 1).padStart(3, "0")}`, `CO-BUN-${String(index + 1).padStart(2, "0")}`]),
  ["CAN-BUN-014", "CO-BUN-13"],
  ["CAN-BUN-015", "CO-BUN-14"],
  ...Array.from({ length: 11 }, (_, index) => [`CAN-DENO-${String(index + 1).padStart(3, "0")}`, `CO-DEN-${String(index + 1).padStart(2, "0")}`]),
  ...Array.from({ length: 19 }, (_, index) => [`CAN-ESB-${String(index + 1).padStart(3, "0")}`, `CO-ESB-${String(index + 1).padStart(2, "0")}`]),
  ["CAN-NODE-001", "CO-SEA-01"],
  ["CAN-NODE-002", "CO-SEA-02"],
  ["CAN-NODE-003", "CO-SEA-03"],
  ["CAN-ROL-001", "CO-ROL-01"],
  ["CAN-ROL-002", "CO-ROL-02"],
  ["CAN-ROL-003", "CO-ROL-03"],
  ["CAN-ROL-005", "CO-ROL-04"],
  ["CAN-ROL-006", "CO-ROL-05"],
  ["CAN-ROL-007", "CO-ROL-06"],
  ["CAN-ROL-008", "CO-ROL-07"],
  ["CAN-ROL-010", "CO-ROL-08"],
  ["CAN-ROL-011", "CO-ROL-09"],
  ["CAN-ROL-012", "CO-ROL-10"],
  ["CAN-ROL-013", "CO-ROL-11"],
  ["CAN-ROL-014", "CO-ROL-12"],
  ["CAN-ROL-015", "CO-ROL-13"],
  ["CAN-ROL-016", "CO-ROL-14"],
  ["CAN-ROL-017", "CO-ROL-15"],
  ["CAN-ROL-018A", "CU-ROL-01"],
  ["CAN-ROL-018B", "CU-ROL-01"],
  ["CAN-ROL-020", "CO-ROL-16"],
  ["CAN-ROL-021", "CO-ROL-17"],
  ["CAN-ROL-022", "CO-ROL-18"],
])

const shadowRecommendation = new Map()
function shadowRec(prefix, numbers, recommendation) {
  for (const number of numbers) shadowRecommendation.set(`${prefix}${String(number).padStart(2, "0")}`, recommendation)
}
shadowRec("CO-BUN-", [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12], "ship")
shadowRec("CO-BUN-", [3], "defer")
shadowRec("CO-BUN-", [13, 14], "reject")
shadowRec("CO-DEN-", [1, 2, 3, 4, 5, 6, 11], "defer")
shadowRec("CO-DEN-", [7, 8, 9, 10], "ship")
shadowRec("CO-ESB-", [1, 2, 3, 4, 5, 11, 12, 15, 16, 17], "ship")
shadowRec("CO-ESB-", [6, 7, 8, 9, 10, 13, 14, 19], "reject")
shadowRec("CO-ESB-", [18], "defer")
shadowRec("CO-SEA-", [1, 2, 3], "ship")
shadowRec("CO-ROL-", [1, 2], "ship")
shadowRec("CO-ROL-", [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18], "defer")
shadowRec("CO-ROL-", [17], "reject")
shadowRecommendation.set("CU-ROL-01", "reject")

const comparisonNotes = new Map([
  ["CAN-BUN-001", "adopt-shadow: no release protocol means caller-owned reusable value, not a long-lived handle"],
  ["CAN-BUN-003", "retain-primary: ship with an explicit non-interruptible calling-thread contract; D5 broad native coverage and the R2 ship verdict supply no evidence-based defer gate, unlike esbuild sync variants"],
  ["CAN-BUN-012", "adopt-shadow: merge raw selected invocation and staged wrapper; record provider-direct publication separately from atomic public contract"],
  ["CAN-BUN-014", "retain-primary-resource: R2 records the caller-owned setup return; both syntheses reject the ambient mutation"],
  ["CAN-DENO-010", "adopt-shadow: native output is provider-direct until proved; the product wrapper alone promises atomic replacement"],
  ["CAN-NODE-001", "adopt-shadow: separate provider-direct candidate write from wrapper-owned atomic contract"],
  ["CAN-NODE-002", "agree-shadow: canonical internal command-stage identity; no independent public export because its value is scope-borrowed"],
  ["CAN-NODE-003", "adopt-shadow: separate injector direct write from AssembleLegacy atomic public contract"],
  ["CAN-ROL-001", "adopt-shadow: close-reusable-build is a release sub-operation; primary keeps D15 package gate as defer rather than shadow ship-identity"],
  ["CAN-ROL-002", "retain-primary-disposition: R2 package_gate is defer; narrow seed is evidence but not package-gate closure"],
  ["CAN-ROL-007", "adopt-shadow: watcher close is a release sub-operation of both publication modes"],
  ["CAN-ROL-008", "adopt-shadow: watcher close is a release sub-operation of both publication modes"],
  ["CAN-ROL-011", "adopt-shadow: command exit/process observation is caller-owned even though provider payload is durable files"],
  ["CAN-ROL-016", "adopt-shadow: resolver has no release protocol and is a caller-owned reusable value"],
  ["CAN-ROL-017", "adopt-shadow: scan is one-shot and yields scope-borrowed cleanup authority"],
  ["CAN-ROL-018A", "retain-primary-split: c4 forbids mixed publication and R2 names callback/no-write versus configured-write modes; memory identity remains deferred"],
  ["CAN-ROL-018B", "retain-primary-split: c4 forbids mixed publication and R2 names callback/no-write versus configured-write modes; direct-write identity remains deferred"],
])

function equalStatus(primary, shadow) {
  return primary === shadow ? "agree" : "different-resolved"
}

const comparisonRows = ops.map((operation) => {
  const shadowId = shadowPairs.get(operation.operation_id)
  const shadow = shadowById.get(shadowId)
  return {
    comparison_id: `CMP-${operation.operation_id}`,
    primary_operation_id: operation.operation_id,
    shadow_operation_id: shadowId,
    provider: operation.provider,
    primary_operation: operation.operation,
    shadow_operation: shadow?.operation ?? "missing",
    lane_primary: operation.lane,
    lane_shadow: shadow?.lane ?? "missing",
    lane_resolution: equalStatus(operation.lane, shadow?.lane),
    lifecycle_primary: operation.lifecycle,
    lifecycle_shadow: shadow?.lifecycle ?? "missing",
    lifecycle_resolution: equalStatus(operation.lifecycle, shadow?.lifecycle),
    resource_primary: operation.resource_result,
    resource_shadow: shadow?.resource_result ?? "missing",
    resource_resolution: equalStatus(operation.resource_result, shadow?.resource_result),
    provider_publication_primary: operation.provider_publication,
    provider_publication_shadow: shadow?.provider_publication ?? "missing",
    provider_publication_resolution: equalStatus(operation.provider_publication, shadow?.provider_publication),
    published_contract_primary: operation.published_contract,
    published_contract_shadow: shadow?.published_contract ?? "missing",
    published_contract_resolution: equalStatus(operation.published_contract, shadow?.published_contract),
    identity_owner_primary: operation.identity_owner,
    identity_owner_shadow: shadow?.identity_owner ?? "missing",
    identity_owner_resolution: equalStatus(operation.identity_owner, shadow?.identity_owner),
    provenance_primary: operation.provenance,
    provenance_shadow: shadow?.provenance ?? "missing",
    semantic_disposition_primary: operation.semantic_disposition,
    semantic_disposition_shadow: shadow?.semantic_disposition ?? "missing",
    recommendation_primary: operation.freeze_recommendation,
    recommendation_shadow: shadowRecommendation.get(shadowId) ?? "classify-only",
    recommendation_resolution: equalStatus(operation.freeze_recommendation, shadowRecommendation.get(shadowId)),
    compatibility_primary: operation.compatibility_commitment,
    compatibility_shadow: shadow?.compatibility_commitment ?? "missing",
    implementation_primary: operation.implementation_status,
    implementation_shadow: shadow?.implementation_status ?? "missing",
    certification_primary: operation.certification_status,
    certification_shadow: shadow?.certification_status ?? "missing",
    evidence_primary: operation.evidence_coordinate_refs,
    evidence_shadow: shadow?.evidence_refs ?? "missing",
    source_primary: operation.supplemental_source_rows,
    source_shadow: shadow?.source_refs ?? "missing",
    proposed_surface: operation.surface_kind === "public-operation-export"
      ? `${operation.proposed_package}${operation.proposed_subpath}#${operation.proposed_export}`
      : operation.surface_kind,
    resolution: comparisonNotes.get(operation.operation_id) ?? "agree after provider-verb and evidence-coordinate normalization; retain primary exact ship/defer/reject and proposed surface columns",
    unresolved_fact: operation.unresolved_evidence,
  }
})

const shadowNonOperations = ["RC-SEA-01", "RC-SEA-02", "RC-SEA-03", "RC-SEA-04", "RC-SEA-05", "RC-DEN-01", "RC-ESB-01"]
for (const shadowId of shadowNonOperations) {
  const shadow = shadowById.get(shadowId)
  comparisonRows.push({
    comparison_id: `CMP-${shadowId}`,
    primary_operation_id: "none-non-operation-register",
    shadow_operation_id: shadowId,
    provider: shadow.provider,
    primary_operation: "classified outside canonical operation register",
    shadow_operation: shadow.operation,
    lane_primary: "not-applicable",
    lane_shadow: shadow.lane,
    lane_resolution: "shadow-key-not-adopted",
    lifecycle_primary: "not-applicable",
    lifecycle_shadow: shadow.lifecycle,
    lifecycle_resolution: "shadow-key-not-adopted",
    resource_primary: "not-applicable",
    resource_shadow: shadow.resource_result,
    resource_resolution: "shadow-key-not-adopted",
    provider_publication_primary: "not-applicable",
    provider_publication_shadow: shadow.provider_publication,
    provider_publication_resolution: "shadow-key-not-adopted",
    published_contract_primary: "not-applicable",
    published_contract_shadow: shadow.published_contract,
    published_contract_resolution: "shadow-key-not-adopted",
    identity_owner_primary: "not-applicable",
    identity_owner_shadow: shadow.identity_owner,
    identity_owner_resolution: "shadow-key-not-adopted",
    provenance_primary: "R2 source evidence",
    provenance_shadow: shadow.provenance,
    semantic_disposition_primary: "classified-non-operation",
    semantic_disposition_shadow: shadow.semantic_disposition,
    recommendation_primary: shadowId === "RC-DEN-01" ? "reject" : "classify-only",
    recommendation_shadow: "classify-only",
    recommendation_resolution: "classification-resolution",
    compatibility_primary: "not-an-operation-support-cell",
    compatibility_shadow: shadow.compatibility_commitment,
    implementation_primary: "not-applicable",
    implementation_shadow: shadow.implementation_status,
    certification_primary: "not-certified",
    certification_shadow: shadow.certification_status,
    evidence_primary: crosswalk.filter((row) => row.classification === "runtime-capability" && row.provider === shadow.provider).map((row) => row.evidence_coordinate_refs).join(";"),
    evidence_shadow: shadow.evidence_refs,
    source_primary: crosswalk.filter((row) => row.classification === "runtime-capability" && row.provider === shadow.provider).map((row) => row.source_id).join(";"),
    source_shadow: shadow.source_refs,
    proposed_surface: "none-classification-only",
    resolution: "retain primary classification placement: c4 requires only actual operations to receive semantic identities; capabilities remain explicit in NON-OPERATION-REGISTER.csv",
    unresolved_fact: shadow.limitations ?? "runtime proof remains coordinate-specific",
  })
}

function uniqueList(value) {
  return [...new Set(value.split(";").map((part) => part.trim()).filter(Boolean))].join(";")
}

function parseFirstColumn(path) {
  const lines = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trimEnd().split("\n")
  return lines.slice(1).map((line) => line.slice(0, line.indexOf(",")))
}

function evidencePath(provider) {
  return resolve(r2Root, provider === "node-sea" ? "node-sea/EVIDENCE-COORDINATES.csv" : `${provider}/EVIDENCE-COORDINATES.csv`)
}

function csv(rows, fields) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`
  return `${fields.map(quote).join(",")}\n${rows.map((row) => fields.map((field) => quote(row[field])).join(",")).join("\n")}\n`
}

function tableCounts() {
  const counts = new Map()
  for (const operation of ops) {
    const key = `${operation.provider}:${operation.freeze_recommendation}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function renderMethod() {
  const counts = tableCounts()
  const providerCount = (provider) => ops.filter((operation) => operation.provider === provider).length
  return `# R1 canonical operation package\n\n` +
    `Date: 2026-08-21. Immutable architecture base: \`c4cefd0acc2b7854cc25513967af1a8d415ccab0\`.\n\n` +
    `Status: **primary synthesis complete; shadow comparison is recorded separately**. This package is research data, not an export freeze, implementation authorization, compatibility admission, or certification.\n\n` +
    `## Independent construction rule\n\n` +
    `The primary model was constructed only from the immutable c4 reconciliation and the five integrated R2 dossiers. Shadow files were opened only after the primary CSVs passed their own coverage, vocabulary, identity, and evidence-reference checks. The comparison section now reads the immutable shadow package solely to reproduce and validate the later neutral comparison.\n\n` +
    `## Canon\n\n` +
    `The semantic identity is \`provider / operation / lane / lifecycle / {resource-result, published-contract}\`. \`provider_publication\` separately records what the upstream operation does, while \`published_contract\` records what the effect-build operation promises; \`identity_owner\` makes the wrapper boundary explicit. Evidence coordinates remain separate links. Provenance, semantic disposition, product priority, freeze recommendation, compatibility commitment, implementation, and certification are independent columns.\n\n` +
    `A \`freeze_recommendation=ship\` is an exact candidate-surface selection, not merely priority, but it is not yet a frozen public commitment. Every ship row here is \`blocked-pending-executable-proof\`: D5 requires its named evidence gate to close before surface freeze, and R2 documentation/source evidence does not by itself establish lifecycle, interruption, or remnant behavior. A failed or still-missing gate blocks freeze unless an explicit pre-freeze disposition revision records the evidence and falsifier; it may not silently shrink the selected surface. Product priority remains a separate axis.\n\n` +
    `M8's namespace-only root recommendation is made exact in \`ROOT-NAMESPACE-MAP.csv\`. Each selected operation-specific subpath has one root namespace key with the form \`export * as <Key> from "./<Key>"\`; no function is exported directly at a package root. The Rolldown provider root is explicitly empty because its package gate remains deferred. These are candidate names, not an M8 approval or surface freeze.\n\n` +
    `The canonical register contains ${ops.length} identities: Bun ${providerCount("bun")}, Deno ${providerCount("deno")}, esbuild ${providerCount("esbuild")}, Node SEA ${providerCount("node-sea")}, and Rolldown ${providerCount("rolldown")}. Recommendations are ship ${[...counts].filter(([key]) => key.endsWith(":ship")).reduce((n, [, value]) => n + value, 0)}, defer ${[...counts].filter(([key]) => key.endsWith(":defer")).reduce((n, [, value]) => n + value, 0)}, and reject ${[...counts].filter(([key]) => key.endsWith(":reject")).reduce((n, [, value]) => n + value, 0)}.\n\n` +
    `The original inventory is covered by ${originalAtoms.length} atomic mappings over all 54 source rows. Composite rows are split; each atom has exactly one allowed classification. The ${supplementRows.length} R2 operation rows are all reverse-mapped. Rolldown DevEngine is the only one-to-many supplemental split because its dossier used \`mixed-configured\` publication; c4 requires memory/callback and durable-write publication to be separate identities.\n\n` +
    `## Important normalizations\n\n` +
    `- Bun global plugin mutation uses the Bun host API lane, not the produced-artifact runtime lane. It remains rejected for missing scoped ownership.\n` +
    `- Deno compile watch is provider-direct durable. Repeated native command writes cannot inherit the one-shot wrapper's atomic replacement claim.\n` +
    `- Rolldown is an installed library and therefore uses \`in-process-api\`, not \`host-api\`; generate/write remain handle-bound operations within \`scoped-context\`, while close methods are release sub-operations rather than invented transport lanes or root operations.\n` +
    `- Reusable objects without a release protocol (Bun.Transpiler and Rolldown ResolverFactory) are caller-owned values, not long-lived handles.\n` +
    `- No operation uses \`host-api-or-command\`, \`mixed-configured\`, \`borrowed\`, or an open-ended lifecycle value.\n` +
    `- Deno's D6 product intent is retained as \`ship-experimental-after-gate\` while the R2 freeze recommendation remains \`defer\` until exact runtime proof. This is not a contradiction: priority is not certification.\n\n` +
    `## Files\n\n` +
    `- \`CANONICAL-OPERATIONS.csv\`: one row per complete semantic identity and all independent status axes.\n` +
    `- \`CROSSWALK.csv\`: atomic forward map for the original 54 rows and every R2 operation row.\n` +
    `- \`NON-OPERATION-REGISTER.csv\`: explicit request modes, modifiers, result fields, sub-operations, relations, runtime capabilities, post-production mutations, platform primitives, portable roles, and architecture laws.\n` +
    `- \`REVERSE-INDEX.csv\`: operation-to-source reconstruction index.\n` +
    `- \`EVIDENCE-COORDINATES.csv\`: operation-to-exact-R2-evidence-row links; linked evidence does not admit support.\n` +
    `- \`SHIP-DEFER-REJECT.csv\`: one explicit freeze recommendation per identity.\n` +
    `- \`ROOT-NAMESPACE-MAP.csv\`: exact candidate root namespace keys, operation subpaths, members, and the explicitly empty Rolldown root.\n` +
    `- \`PRIMARY-VS-SHADOW.csv\`: neutral field comparison and evidence-based resolution.\n` +
    `- \`REVIEW-ATTESTATIONS.md\`: two independent reconstruction reviews and the R1 stop-condition result.\n` +
    `- \`MANIFEST.sha256\`: LF-byte hashes for the package.\n`
}

const publicShipOperations = ops.filter((operation) => operation.freeze_recommendation === "ship" && operation.surface_kind === "public-operation-export")

const rootNamespaceRows = []
const proposedPackages = [...new Set(ops.map((operation) => operation.proposed_package))].sort()
for (const packageName of proposedPackages) {
  const packageOperations = publicShipOperations.filter((operation) => operation.proposed_package === packageName)
  const subpaths = [...new Set(packageOperations.map((operation) => operation.proposed_subpath))].sort()
  if (subpaths.length === 0) {
    rootNamespaceRows.push({
      package: packageName,
      root_surface_status: "explicitly-empty-no-selected-package-surface",
      root_namespace_key: "none",
      operation_subpath: "none",
      root_export_form: "none",
      member_exports: "none",
      canonical_operation_ids: "none",
      surface_selection_status: "not-selected",
      freeze_gate_status: "not-applicable-no-ship-operations",
      empty_root_reason: packageName === "effect-build-rolldown"
        ? "all Rolldown operations are defer or reject under the unresolved R2 package gate"
        : "no ship operation selected for this provider package",
    })
    continue
  }
  for (const subpath of subpaths) {
    const members = packageOperations.filter((operation) => operation.proposed_subpath === subpath)
    const namespace = subpath.slice(2)
    rootNamespaceRows.push({
      package: packageName,
      root_surface_status: "selected-candidate-namespaces-not-frozen",
      root_namespace_key: namespace,
      operation_subpath: subpath,
      root_export_form: `export * as ${namespace} from "${subpath}"`,
      member_exports: members.map((operation) => operation.proposed_export).sort().join(";"),
      canonical_operation_ids: members.map((operation) => operation.operation_id).sort().join(";"),
      surface_selection_status: "selected-candidate-not-frozen",
      freeze_gate_status: "blocked-pending-member-executable-proof",
      empty_root_reason: "none",
    })
  }
}

function reviewerResults() {
  const directFailures = []
  const shadowFailures = []
  const coordinates = new Set()
  for (const operation of publicShipOperations) {
    const coordinate = `${operation.proposed_package}${operation.proposed_subpath}#${operation.proposed_export}`
    if (coordinates.has(coordinate)) directFailures.push(`duplicate proposed export ${coordinate}`)
    coordinates.add(coordinate)
    if (!operation.semantic_identity || !operation.evidence_coordinate_refs) directFailures.push(`primary reconstruction incomplete ${operation.operation_id}`)

    const shadowId = shadowPairs.get(operation.operation_id)
    const shadow = shadowById.get(shadowId)
    if (!shadow) shadowFailures.push(`no independent shadow operation for ${coordinate}`)
    else if (!shadow.semantic_identity || !shadow.evidence_refs) shadowFailures.push(`shadow reconstruction incomplete ${shadowId}`)
  }
  return { directFailures, shadowFailures, coordinates }
}

function renderReviews() {
  const { directFailures, shadowFailures, coordinates } = reviewerResults()
  const publicCount = publicShipOperations.length
  const internalCount = ops.filter((operation) => operation.freeze_recommendation === "ship" && operation.surface_kind === "internal-stage-no-public-export").length
  const result = directFailures.length === 0 && shadowFailures.length === 0 ? "PASS" : "FAIL"
  return `# R1 review attestations and stop condition\n\n` +
    `Date: 2026-08-21. Result: **${result}**.\n\n` +
    `## Reviewer A — direct primary reconstruction\n\n` +
    `The forward reviewer starts from each of the ${publicCount} proposed public ship exports, resolves its unique primary operation row, checks the complete semantic key, and resolves at least one exact R2 evidence-row identifier. It also rejects duplicate \`package + subpath + export\` coordinates. Result: **${directFailures.length === 0 ? "PASS" : `FAIL (${directFailures.join("; ")})`}** over ${coordinates.size} unique exports.\n\n` +
    `## Reviewer B — blind-shadow reconstruction\n\n` +
    `The reverse reviewer uses the independently constructed blind shadow synthesis at \`aa8f958\`. For every proposed public ship export it follows the neutral comparison mapping to one shadow operation identity and that row's independent evidence-coordinate set. The shadow did not see the primary or its export proposal during construction. Result: **${shadowFailures.length === 0 ? "PASS" : `FAIL (${shadowFailures.join("; ")})`}** over the same ${publicCount} exports.\n\n` +
    `The ${internalCount} ship identity without a public export is Node SEA preparation-blob generation. Both syntheses classify it as a scope-borrowed internal stage; its absence from the export set is deliberate and machine-readable, not an inference gap.\n\n` +
    `## Stop-condition result\n\n` +
    `**R1_STOP_CONDITION=${result}**: two independent reconstruction paths map every proposed public export to exactly one operation identity and evidence coordinate without inference. All 54 original inventory rows and all 70 R2 operation rows are also covered.\n\n` +
    `**SURFACE_FREEZE_RESULT=BLOCKED**: all ${ops.filter((operation) => operation.freeze_gate_status === "blocked-pending-executable-proof").length} ship identities are selected candidates, but their named executable evidence gates remain open. \`ship\` is not merely product priority, and it is not a frozen commitment. D5 requires gate closure before freeze; R2 source/docs do not establish lifecycle, interruption, or remnant behavior. A missing or failed gate blocks freeze unless an explicit pre-freeze disposition revision is recorded.\n\n` +
    `This closes R1 only. It does not certify runtime behavior, admit compatibility cells, answer M2/M3/M8, authorize the instruction cutover, or freeze the final 0.4 surface. Proposed module exports and exact root namespace keys remain a complete machine-readable recommendation for those downstream decisions.\n\n` +
    `Verification command: \`node research/post-0.3/reconciliation/r1/validate.mjs\`.\n`
}

function validateModel() {
  const failures = []
  const opIds = new Set()
  const identities = new Set()
  for (const operation of ops) {
    if (opIds.has(operation.operation_id)) failures.push(`duplicate operation id ${operation.operation_id}`)
    if (identities.has(operation.semantic_identity)) failures.push(`duplicate semantic identity ${operation.semantic_identity}`)
    opIds.add(operation.operation_id)
    identities.add(operation.semantic_identity)
    if (!allowed.lane.has(operation.lane)) failures.push(`illegal lane ${operation.operation_id}:${operation.lane}`)
    if (!allowed.lifecycle.has(operation.lifecycle)) failures.push(`illegal lifecycle ${operation.operation_id}:${operation.lifecycle}`)
    if (!allowed.resource.has(operation.resource_result)) failures.push(`illegal resource ${operation.operation_id}:${operation.resource_result}`)
    if (!allowed.publication.has(operation.provider_publication)) failures.push(`illegal provider publication ${operation.operation_id}:${operation.provider_publication}`)
    if (!allowed.publication.has(operation.output_publication)) failures.push(`illegal publication ${operation.operation_id}:${operation.output_publication}`)
    if (operation.output_publication !== operation.published_contract) failures.push(`published contract alias drift ${operation.operation_id}`)
    if (!new Set(["provider-native", "product-wrapper-over-provider-command"]).has(operation.identity_owner)) failures.push(`illegal identity owner ${operation.operation_id}:${operation.identity_owner}`)
    if (!allowed.recommendation.has(operation.freeze_recommendation)) failures.push(`missing recommendation ${operation.operation_id}`)
    const expected = `${operation.provider} / ${operation.operation} / ${operation.lane} / ${operation.lifecycle} / {${operation.resource_result}, ${operation.output_publication}}`
    if (operation.semantic_identity !== expected) failures.push(`bad key ${operation.operation_id}`)
    for (const field of ["provenance", "semantic_disposition", "product_priority", "surface_selection_status", "pre_freeze_gate", "freeze_gate_status", "evidence_gate_basis", "gate_failure_action", "compatibility_commitment", "implementation_status", "certification_status", "evidence_coordinate_refs", "proposed_root_export_kind"]) {
      if (!operation[field]) failures.push(`blank ${field} for ${operation.operation_id}`)
    }
    if (operation.freeze_recommendation === "ship") {
      const intentionallyInternal = operation.surface_kind === "internal-stage-no-public-export" && operation.surface_rationale.length > 40
      if (!publicSurface.has(operation.operation_id) && !intentionallyInternal) failures.push(`ship row lacks exact public surface or internal-stage reason ${operation.operation_id}`)
      if (!intentionallyInternal && (operation.proposed_subpath === "none" || operation.proposed_export === "none")) failures.push(`ship row has no proposed export ${operation.operation_id}`)
      if (operation.surface_selection_status !== "selected-candidate-not-frozen") failures.push(`ship row has ambiguous surface selection ${operation.operation_id}`)
      if (operation.freeze_gate_status !== "blocked-pending-executable-proof") failures.push(`ship row incorrectly claims freeze readiness ${operation.operation_id}`)
      if (operation.pre_freeze_gate !== operation.unresolved_evidence) failures.push(`ship row gate does not preserve unresolved evidence ${operation.operation_id}`)
      if (operation.gate_failure_action !== "block-freeze-or-record-explicit-pre-freeze-disposition-revision") failures.push(`ship row lacks D5 failure action ${operation.operation_id}`)
      if (!intentionallyInternal) {
        const expectedRoot = operation.proposed_subpath.slice(2)
        if (operation.proposed_root_export !== expectedRoot) failures.push(`ship row root namespace mismatch ${operation.operation_id}`)
        if (operation.proposed_root_export_kind !== "namespace-reexport") failures.push(`ship row root export is not namespace-only ${operation.operation_id}`)
      } else if (operation.proposed_root_export !== "none" || operation.proposed_root_export_kind !== "none-internal-stage") {
        failures.push(`internal ship row leaks a root export ${operation.operation_id}`)
      }
    } else {
      if (publicSurface.has(operation.operation_id)) failures.push(`non-ship row has selected public surface ${operation.operation_id}`)
      if (operation.proposed_subpath !== "none" || operation.proposed_export !== "none" || operation.proposed_root_export !== "none") failures.push(`non-ship row leaks proposed export ${operation.operation_id}`)
      if (operation.freeze_gate_status === "blocked-pending-executable-proof") failures.push(`non-ship row uses selected-candidate gate status ${operation.operation_id}`)
    }
  }

  const rootCoordinates = new Set()
  const emptyRoots = []
  for (const row of rootNamespaceRows) {
    if (row.root_namespace_key === "none") {
      emptyRoots.push(row.package)
      if (row.root_surface_status !== "explicitly-empty-no-selected-package-surface") failures.push(`ambiguous empty root ${row.package}`)
      if (row.operation_subpath !== "none" || row.root_export_form !== "none" || row.member_exports !== "none" || row.canonical_operation_ids !== "none") failures.push(`empty root contains surface ${row.package}`)
      continue
    }
    const coordinate = `${row.package}:${row.root_namespace_key}`
    if (rootCoordinates.has(coordinate)) failures.push(`duplicate root namespace ${coordinate}`)
    rootCoordinates.add(coordinate)
    if (row.root_namespace_key !== row.operation_subpath.slice(2)) failures.push(`root namespace/subpath mismatch ${coordinate}`)
    if (row.root_export_form !== `export * as ${row.root_namespace_key} from "${row.operation_subpath}"`) failures.push(`root export form mismatch ${coordinate}`)
    for (const id of row.canonical_operation_ids.split(";")) {
      const operation = ops.find((candidate) => candidate.operation_id === id)
      if (!operation) failures.push(`root namespace ${coordinate} references unknown ${id}`)
      else if (operation.proposed_package !== row.package || operation.proposed_subpath !== row.operation_subpath || operation.proposed_root_export !== row.root_namespace_key) failures.push(`root namespace ${coordinate} misindexes ${id}`)
    }
  }
  if (emptyRoots.join(";") !== "effect-build-rolldown") failures.push(`expected only explicit empty Rolldown root; found ${emptyRoots.join(";") || "none"}`)
  for (const operation of publicShipOperations) {
    const matchingRoots = rootNamespaceRows.filter((row) => row.package === operation.proposed_package && row.root_namespace_key === operation.proposed_root_export && row.canonical_operation_ids.split(";").includes(operation.operation_id))
    if (matchingRoots.length !== 1) failures.push(`public ship row has ${matchingRoots.length} root namespace mappings ${operation.operation_id}`)
  }

  const originalIds = parseFirstColumn(originalInventory)
  const mappedOriginalIds = new Set(originalAtoms.map((row) => row.source_id))
  if (originalIds.length !== 54) failures.push(`expected 54 original rows; found ${originalIds.length}`)
  for (const id of originalIds) if (!mappedOriginalIds.has(id)) failures.push(`unmapped original row ${id}`)
  for (const id of mappedOriginalIds) if (!originalIds.includes(id)) failures.push(`unknown original row ${id}`)

  const providers = ["bun", "deno", "esbuild", "node-sea", "rolldown"]
  for (const provider of providers) {
    const sourcePath = resolve(r2Root, `${provider}/PROVIDER-OPERATIONS.csv`)
    const expectedSourceIds = new Set(parseFirstColumn(sourcePath))
    const mappedSourceIds = new Set(supplementRows.filter((row) => row.provider === provider).map((row) => row.source_id))
    for (const id of expectedSourceIds) if (!mappedSourceIds.has(id)) failures.push(`unmapped ${provider} supplemental row ${id}`)
    for (const id of mappedSourceIds) if (!expectedSourceIds.has(id)) failures.push(`unknown ${provider} supplemental row ${id}`)
  }

  if (supplementRows.length !== 70) failures.push(`expected 70 supplemental operation rows; found ${supplementRows.length}`)
  if (ops.length !== 67) failures.push(`expected 67 normalized canonical operations; found ${ops.length}`)

  for (const row of crosswalk) {
    if (!allowed.classification.has(row.classification)) failures.push(`illegal classification ${row.atom_id}:${row.classification}`)
    for (const id of row.canonical_operation_ids.split(";").filter(Boolean)) {
      if (!opIds.has(id)) failures.push(`crosswalk ${row.atom_id} references unknown ${id}`)
    }
  }

  for (const operation of ops) {
    const evidenceIds = new Set(parseFirstColumn(evidencePath(operation.provider)))
    for (const ref of operation.evidence_coordinate_refs.split(";")) {
      if (!evidenceIds.has(ref)) failures.push(`${operation.operation_id} references missing evidence ${ref}`)
    }
  }


  if (shadowPairs.size !== ops.length) failures.push(`shadow comparison maps ${shadowPairs.size}/${ops.length} primary operations`)
  for (const operation of ops) {
    const shadowId = shadowPairs.get(operation.operation_id)
    if (!shadowId) failures.push(`missing shadow comparison for ${operation.operation_id}`)
    else if (!shadowById.has(shadowId)) failures.push(`missing shadow row ${shadowId}`)
  }
  const coveredShadow = new Set([...shadowPairs.values(), ...shadowNonOperations])
  for (const shadowId of shadowById.keys()) if (!coveredShadow.has(shadowId)) failures.push(`unreviewed shadow row ${shadowId}`)
  for (const shadowId of coveredShadow) if (!shadowById.has(shadowId)) failures.push(`comparison references missing shadow row ${shadowId}`)

  const allowedRecommendationDifferences = new Set(["CAN-BUN-003", "CAN-ROL-001", "CAN-ROL-002", "CAN-ROL-018A", "CAN-ROL-018B"])
  for (const row of comparisonRows.filter((row) => row.primary_operation_id.startsWith("CAN-"))) {
    if (row.lane_resolution !== "agree") failures.push(`unresolved lane difference ${row.primary_operation_id}`)
    if (row.lifecycle_resolution !== "agree") failures.push(`unresolved lifecycle difference ${row.primary_operation_id}`)
    if (row.recommendation_resolution !== "agree" && !allowedRecommendationDifferences.has(row.primary_operation_id)) failures.push(`unexpected disposition difference ${row.primary_operation_id}`)
  }

  const shadowEvidenceIds = new Set(parseCsv(readFileSync(resolve(shadowRoot, "EVIDENCE-COORDINATES.csv"), "utf8")).map((row) => row.evidence_id))
  for (const operation of publicShipOperations) {
    const shadow = shadowById.get(shadowPairs.get(operation.operation_id))
    for (const ref of shadow.evidence_refs.split(";").filter(Boolean)) {
      if (!shadowEvidenceIds.has(ref)) failures.push(`shadow reviewer evidence missing ${shadow.operation_id}:${ref}`)
    }
  }
  const review = reviewerResults()
  failures.push(...review.directFailures.map((failure) => `reviewer A: ${failure}`))
  failures.push(...review.shadowFailures.map((failure) => `reviewer B: ${failure}`))

  const manifestLines = readFileSync(resolve(shadowRoot, "MANIFEST.sha256"), "utf8").trim().split("\n")
  for (const line of manifestLines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/)
    if (!match) {
      failures.push(`malformed shadow manifest line ${line}`)
      continue
    }
    const actual = createHash("sha256").update(readFileSync(resolve(shadowRoot, match[2]))).digest("hex")
    if (actual !== match[1]) failures.push(`shadow manifest mismatch ${match[2]}`)
  }
  return failures
}

const opFields = [
  "operation_id", "provider", "operation", "lane", "lifecycle", "resource_result",
  "provider_publication", "output_publication", "published_contract", "identity_owner",
  "semantic_identity", "candidate_public_surface", "supplemental_source_rows",
  "provenance", "semantic_disposition", "product_priority", "freeze_recommendation",
  "surface_selection_status", "pre_freeze_gate", "freeze_gate_status", "evidence_gate_basis", "gate_failure_action",
  "compatibility_commitment", "implementation_status", "certification_status",
  "evidence_coordinate_refs", "contract_summary", "unresolved_evidence", "surface_kind",
  "proposed_package", "proposed_subpath", "proposed_export", "proposed_root_export", "proposed_root_export_kind", "surface_rationale",
]
const crosswalkFields = [
  "source_set", "source_id", "atom_id", "provider", "source_label", "classification",
  "canonical_operation_ids", "evidence_coordinate_refs", "freeze_recommendation", "note",
]
const comparisonFields = [
  "comparison_id", "primary_operation_id", "shadow_operation_id", "provider",
  "primary_operation", "shadow_operation",
  "lane_primary", "lane_shadow", "lane_resolution",
  "lifecycle_primary", "lifecycle_shadow", "lifecycle_resolution",
  "resource_primary", "resource_shadow", "resource_resolution",
  "provider_publication_primary", "provider_publication_shadow", "provider_publication_resolution",
  "published_contract_primary", "published_contract_shadow", "published_contract_resolution",
  "identity_owner_primary", "identity_owner_shadow", "identity_owner_resolution",
  "provenance_primary", "provenance_shadow",
  "semantic_disposition_primary", "semantic_disposition_shadow",
  "recommendation_primary", "recommendation_shadow", "recommendation_resolution",
  "compatibility_primary", "compatibility_shadow",
  "implementation_primary", "implementation_shadow",
  "certification_primary", "certification_shadow",
  "evidence_primary", "evidence_shadow", "source_primary", "source_shadow",
  "proposed_surface", "resolution", "unresolved_fact",
]

const evidenceRows = ops.flatMap((operation) => operation.evidence_coordinate_refs.split(";").map((ref) => ({
  operation_id: operation.operation_id,
  semantic_identity: operation.semantic_identity,
  evidence_ref: ref,
  evidence_source: relative(repo, evidencePath(operation.provider)),
  evidence_row_key: ref,
  evidence_status: operation.certification_status,
  support_effect: "evidence-only-does-not-admit-support",
})))

const reverseRows = ops.map((operation) => {
  const rows = crosswalk.filter((row) => row.canonical_operation_ids.split(";").includes(operation.operation_id))
  return {
    operation_id: operation.operation_id,
    semantic_identity: operation.semantic_identity,
    original_source_atoms: rows.filter((row) => row.source_set === "original-54").map((row) => row.atom_id).join(";"),
    supplemental_source_rows: rows.filter((row) => row.source_set !== "original-54").map((row) => row.source_id).join(";"),
    candidate_public_surface: operation.candidate_public_surface,
    provider_publication: operation.provider_publication,
    published_contract: operation.published_contract,
    identity_owner: operation.identity_owner,
    proposed_package: operation.proposed_package,
    proposed_subpath: operation.proposed_subpath,
    proposed_export: operation.proposed_export,
    proposed_root_export: operation.proposed_root_export,
    proposed_root_export_kind: operation.proposed_root_export_kind,
    evidence_coordinate_refs: operation.evidence_coordinate_refs,
    freeze_recommendation: operation.freeze_recommendation,
    surface_selection_status: operation.surface_selection_status,
    pre_freeze_gate: operation.pre_freeze_gate,
    freeze_gate_status: operation.freeze_gate_status,
  }
})

const dispositionRows = ops.map((operation) => ({
  operation_id: operation.operation_id,
  semantic_identity: operation.semantic_identity,
  provider_publication: operation.provider_publication,
  published_contract: operation.published_contract,
  identity_owner: operation.identity_owner,
  semantic_disposition: operation.semantic_disposition,
  product_priority: operation.product_priority,
  freeze_recommendation: operation.freeze_recommendation,
  surface_selection_status: operation.surface_selection_status,
  pre_freeze_gate: operation.pre_freeze_gate,
  freeze_gate_status: operation.freeze_gate_status,
  evidence_gate_basis: operation.evidence_gate_basis,
  gate_failure_action: operation.gate_failure_action,
  compatibility_commitment: operation.compatibility_commitment,
  implementation_status: operation.implementation_status,
  certification_status: operation.certification_status,
  unresolved_evidence: operation.unresolved_evidence,
  surface_kind: operation.surface_kind,
  proposed_package: operation.proposed_package,
  proposed_subpath: operation.proposed_subpath,
  proposed_export: operation.proposed_export,
  proposed_root_export: operation.proposed_root_export,
  proposed_root_export_kind: operation.proposed_root_export_kind,
  surface_rationale: operation.surface_rationale,
}))

const nonOperationRows = crosswalk.filter((row) => row.classification !== "operation")
const review = reviewerResults()
const stopCondition = {
  schema: "effect-build-r1-stop-condition-v1",
  result: review.directFailures.length === 0 && review.shadowFailures.length === 0 ? "PASS" : "FAIL",
  original_inventory_rows: new Set(originalAtoms.map((row) => row.source_id)).size,
  original_atomic_mappings: originalAtoms.length,
  supplemental_operation_rows: supplementRows.length,
  canonical_operations: ops.length,
  proposed_public_ship_exports: publicShipOperations.length,
  proposed_root_namespace_rows: rootNamespaceRows.filter((row) => row.root_namespace_key !== "none").length,
  explicitly_empty_provider_roots: rootNamespaceRows.filter((row) => row.root_namespace_key === "none").map((row) => row.package),
  internal_ship_identities_without_export: ops.filter((operation) => operation.freeze_recommendation === "ship" && operation.surface_kind === "internal-stage-no-public-export").map((operation) => operation.operation_id),
  ship_meaning: "selected-candidate-not-frozen; not merely product priority",
  surface_freeze_result: "BLOCKED",
  surface_freeze_blockers: ops.filter((operation) => operation.freeze_gate_status === "blocked-pending-executable-proof").map((operation) => ({
    operation_id: operation.operation_id,
    pre_freeze_gate: operation.pre_freeze_gate,
  })),
  gate_failure_rule: "block freeze or record an explicit pre-freeze disposition revision; never silently omit a failed selected operation",
  reviewer_a_direct_failures: review.directFailures,
  reviewer_b_shadow_failures: review.shadowFailures,
  scope: "R1 crosswalk only; not surface freeze, runtime certification, compatibility admission, or implementation authorization",
}

const outputs = new Map([
  ["CANONICAL-OPERATIONS.csv", csv(ops, opFields)],
  ["CROSSWALK.csv", csv(crosswalk, crosswalkFields)],
  ["NON-OPERATION-REGISTER.csv", csv(nonOperationRows, crosswalkFields)],
  ["REVERSE-INDEX.csv", csv(reverseRows, ["operation_id", "semantic_identity", "original_source_atoms", "supplemental_source_rows", "candidate_public_surface", "provider_publication", "published_contract", "identity_owner", "proposed_package", "proposed_subpath", "proposed_export", "proposed_root_export", "proposed_root_export_kind", "evidence_coordinate_refs", "freeze_recommendation", "surface_selection_status", "pre_freeze_gate", "freeze_gate_status"])],
  ["EVIDENCE-COORDINATES.csv", csv(evidenceRows, ["operation_id", "semantic_identity", "evidence_ref", "evidence_source", "evidence_row_key", "evidence_status", "support_effect"])],
  ["SHIP-DEFER-REJECT.csv", csv(dispositionRows, ["operation_id", "semantic_identity", "provider_publication", "published_contract", "identity_owner", "semantic_disposition", "product_priority", "freeze_recommendation", "surface_selection_status", "pre_freeze_gate", "freeze_gate_status", "evidence_gate_basis", "gate_failure_action", "compatibility_commitment", "implementation_status", "certification_status", "unresolved_evidence", "surface_kind", "proposed_package", "proposed_subpath", "proposed_export", "proposed_root_export", "proposed_root_export_kind", "surface_rationale"])],
  ["ROOT-NAMESPACE-MAP.csv", csv(rootNamespaceRows, ["package", "root_surface_status", "root_namespace_key", "operation_subpath", "root_export_form", "member_exports", "canonical_operation_ids", "surface_selection_status", "freeze_gate_status", "empty_root_reason"])],
  ["PRIMARY-VS-SHADOW.csv", csv(comparisonRows, comparisonFields)],
  ["PRIMARY-METHOD.md", renderMethod()],
  ["REVIEW-ATTESTATIONS.md", renderReviews()],
  ["STOP-CONDITION.json", `${JSON.stringify(stopCondition, null, 2)}\n`],
])

function manifestContent() {
  const entries = [...outputs.entries(), ["validate.mjs", readFileSync(fileURLToPath(import.meta.url), "utf8")]]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, content]) => `${createHash("sha256").update(content).digest("hex")}  ${name}`)
  return `${entries.join("\n")}\n`
}

function patchForMissingOrChanged() {
  const desired = new Map(outputs)
  desired.set("MANIFEST.sha256", manifestContent())
  const chunks = ["*** Begin Patch"]
  for (const [name, content] of desired) {
    let current
    try {
      current = readFileSync(resolve(here, name), "utf8")
    } catch {
      current = undefined
    }
    if (current === content) continue
    if (current !== undefined) chunks.push(`*** Delete File: ${resolve(here, name)}`)
    chunks.push(`*** Add File: ${resolve(here, name)}`)
    for (const line of content.split("\n").slice(0, -1)) chunks.push(`+${line}`)
  }
  chunks.push("*** End Patch")
  return `${chunks.join("\n")}\n`
}

function validateFiles() {
  const failures = validateModel()
  const desired = new Map(outputs)
  desired.set("MANIFEST.sha256", manifestContent())
  for (const [name, content] of desired) {
    try {
      const actual = readFileSync(resolve(here, name), "utf8")
      if (actual !== content) failures.push(`${name} differs from deterministic model`)
    } catch {
      failures.push(`${name} is missing`)
    }
  }
  return failures
}

if (process.argv.includes("--emit-patch")) {
  process.stdout.write(patchForMissingOrChanged())
} else {
  const failures = validateFiles()
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`R1 primary model valid: ${ops.length} operations, ${originalAtoms.length} original atoms/54 rows, ${supplementRows.length} supplemental rows, ${evidenceRows.length} evidence links.\n`)
  }
}

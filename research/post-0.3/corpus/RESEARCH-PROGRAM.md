# Research program required for the 0.4 surface freeze

Date: 2026-08-18; completed freeze disposition: 2026-08-21.
Status: **R1-R7 complete for the exact initial 0.4 freeze**. R8-R10 remain
feature-bound follow-up research and do not block the deliberately narrower
surface. These assignments are not production implementations or release
authority. Exact results live under `../reconciliation/`; the future-0.4
authority is `../freeze/SURFACE.json` together with `../freeze/MIGRATION.json`.

The goal is not to wait for external adoption. The goal is to manufacture the missing evidence
through broader native inventories, adversarial applications, independent implementations, and
unchanged-consumer demonstrations.

## Freeze blockers, in order

### R1 — Complete the canonical operation crosswalk

Normalize every source inventory row into exactly one of:

```text
operation | request mode | modifier | result field | sub-operation
relation | runtime capability | post-production mutation
```

Every operation receives the complete semantic key from `RECONCILIATION.md` and separate fields for
provenance, semantic disposition, product priority, compatibility commitment, implementation, and
certification. Split all memory/direct-write/stdout/watch variants and every merged `API/command`
row.

**Deliverable:** one complete reviewed crosswalk covering all 54 source rows and the breadth
supplement. No `host-api-or-command`, missing ownership, or unlabeled "in scope" cell is allowed.

**Stop condition:** two independent reviewers can map every proposed export back to one operation
identity and evidence coordinate without inference.

### R2 — Provider-native breadth supplement

Use current tagged declarations/source and exact execution where required:

- Bun: `Bun.Transpiler`, scan/import analysis, API executable output topology, HTML/full-stack
  builds, plugins, target variants, memory versus direct-write ownership, and cancellation.
- Deno: bundle/transpile/declaration/check modes, channel identity, permission behavior, project
  authority, denort acquisition/offline behavior, and every compile target relation.
- esbuild: memory/direct-write build modes, transform, `analyzeMetafile`, CLI one-shot/watch/serve,
  package/native-binary coherence, and context cancel/dispose races.
- Node SEA: direct `--build-sea` versus legacy blob/injection, CJS/ESM, assets config/runtime lookup,
  cache, snapshot, exec argv, builder/base relations, and target-specific correctness repair.
- Rolldown: complete provider-native API/lifecycle/result dossier, independent of portable-profile
  success.

**Deliverable:** tagged source ledger, normalized rows, adversarial probe specifications, and exact
ship/defer/reject recommendations. Documentation alone may establish advertised shape but not
cancellation, cleanup, remnants, permissions, or supported coordinates.

### R3 — Minimum compatibility evaluator proof

Prove the private D9 model without growing a public policy language:

- complete provider implementation identity for every lane;
- operation/lane/host/target deny holes;
- bounded required-capability presence, including timeout/indeterminate states;
- Node builder/base and Deno/denort relations;
- esbuild package/API/native-binary coherence;
- provider/core peers and profile compatibility where composed;
- selected-command replacement between Layer acquisition and provider launch; and
- exact eligibility of `allowUntestedVersion`.

**Deliverable:** provider-owned decision tables, typed diagnostic examples, evaluation-timing map,
and tests showing every non-overridable state remains blocked. Keep exact observed evidence
coordinates separate from reviewed support admission; CI evidence does not admit itself. Exact
evidence points do not imply a range.

For replaceable commands, reauthentication means full executable content identity, normally a
digest. A reusable probe cache key includes content identity, provider, operation, lane, host,
target, capability-schema revision, policy revision, and relation/profile inputs.

**Stop condition:** each admission or refusal has one reason, one owner, one evaluation phase, and
no invalid state can be converted by the escape flag.

### R4 — Core lifecycle and author-primitive laws

Close the laws that a rewritten Plan 039 will implement before freezing public `Author/*`:

- borrowed-output acquire/close race and authority after closure;
- file/tree containment, mutation, same-length replacement, and Windows locks;
- provider-direct partial writes and interruption remnants;
- scoped child termination, descendant limits, and reaping;
- esbuild/Rolldown handle concurrency, cancellation, dispose, and post-release rejection;
- hashed versus unhashed observation sums; and
- streaming arbitrary-size digest behavior or an explicit bound with typed failure.

**Deliverable:** a primitive-rent ledger for exactly `Author/Tool`, `Author/BorrowedOutput`, and
`Author/Executable`, plus law tables and adversarial consumer examples. Remove any primitive that
merely renames an Effect platform service.

Pack an independently versioned external adapter that imports only documented public `Author/*`
subpaths. It must supply its own finite Tool identity/capability/refusal policy, survive a duplicate
core/package graph according to the declared peer contract, and implement an unchanged consumer
without first-party internals. This is constructibility evidence, not a prior-adoption gate.

### R5 — Portable-role proofs

Run two independent programs, not fixture-name comparisons:

1. **Node sealed main:** unchanged consumers across Bun, esbuild, and Rolldown producers into the
   same assembler; exact content identity; atomic acquisition; CJS/ESM; Node target; classified
   imports/externals/dynamic/JSON/native addons; mutation/TOCTOU; and all applicable hosts.
2. **BrowserModulePayload:** authoritative entry/edge association, multiple entries, chunks,
   module-reachable CSS/assets, dynamic imports, externals, MIME, URL/query/fragment rules,
   source maps, cleanup, and a real browser oracle through each adapter.

**Deliverable:** unchanged consumers, falsifier catalog, complete law matrix, and an explicit
ship/defer verdict. Do not broaden a role to make a failing provider look conformant.

### R6 — Rolldown's two independent gates

Gate the provider-native `effect-build-rolldown` package first. Separately evaluate
`IncrementalNodeMain` against the corrected canon with both Rolldown and esbuild.

**Deliverable:** provider dossier and package proof; then a separate portable-profile receipt. A
pass or failure in one does not decide the other.

### R7 — Matrix law and hard-cut migration closure

If M2 selects a redesigned matrix, prove deterministic cell identity, bounded concurrency,
independent publication, complete outcomes, caller interruption, and partial durable-result laws
across Bun and Deno without claiming transactionality. If M2 selects removal, write the equivalent
Effect composition example and negative export/type tests.

In either case, produce one complete 0.3 → 0.4 retain/replace/remove map covering every package
root, subpath, runtime export, declaration export, and documented operation. Every removal needs a
migration target or an explicit no-replacement explanation plus negative packed-consumer tests.

## Parallel research that blocks only its selected feature

### R8 — Typed watch protocol

Research product-owned loops and in-process callbacks without parsing human CLI output. Define
watch-set/trigger authority, dependency-set changes, dirty-during-build/coalescing, output
self-trigger prevention, failed-build recovery, rename/delete behavior, host filesystem semantics,
latency, and interruption. Raw scoped command handles do not wait for this work.

### R9 — Apple distribution operations

Use `APPLE-DISTRIBUTION-BOUNDARY.md` as the sourced starting point. Execute credential-backed tests
for Developer ID Application and Installer identities, hardened runtime/entitlements, nested
signing, `.app`, ZIP, DMG, `.pkg`, notarization failures/timeouts, stapling, Gatekeeper, quarantine,
and immutable-input/new-output laws.

This work blocks an Apple distribution package, not provider-specific ad-hoc correctness repair.
Include macOS targets produced from Linux/Windows hosts, credential provenance and keychain/Notary
API boundaries, direct Developer ID versus Mac App Store scope, submission-id recovery after
unknown outcomes, and explicit no-blind-retry behavior.

### R10 — Durable receipt archival

Specify and threat-model the two-phase D14 design:

```text
read-only certifier certifies source S
  -> temporary artifact transports receipt R
  -> separately authorized archiver verifies R
  -> append-only evidence commit A contains R about S
```

Prove idempotent paths, byte conflicts, non-force fast-forward updates, least privilege, untrusted
PR isolation, branch-loop prevention, moved-head handling, and terminal partial-release receipts.
The write-capable archiver must use trusted protected validator code, never check out or execute the
certified source, bound total bytes/file count/member size, reject absolute or `..` paths,
links, duplicate names, unexpected members, and malformed/noncanonical JSON, and never derive a
command or destination path from artifact contents. Authenticate the producer through GitHub API
against an allowlisted repository, workflow id/path, run attempt, event/ref, and approved workflow
revision; never trust a workflow-identity field asserted inside the artifact. The archive commit
must never be represented as the source it certifies.

## Work explicitly deferred from the freeze

- a public compatibility matcher or relation DSL;
- a generic executable/transformation algebra;
- CLI-text-derived portable watch events;
- universal signing or packaging profiles;
- `@yao-pkg/pkg` promotion before sealed-main/no-hidden-acquisition Q10 passes; and
- coding the failed 96e closure prototypes merely to make historical CI green.

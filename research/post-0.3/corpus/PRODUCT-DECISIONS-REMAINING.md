# Remaining maintainer product decisions

Date: 2026-08-18.
Status: **historical decision packet; M1-M8 were resolved on 2026-08-21 in
`../freeze/PRODUCT-DECISIONS.md`**.

Do not use the defaults below as open questions. The freeze decision record is
the current product authority, subject to its named executable falsifiers.

The reconciliation deliberately does not ask the maintainer to decide facts that research can
establish. This packet separates product choices among semantically defensible alternatives from
governance/repository-operation approvals. Each has a recommended default so silence cannot be
mistaken for approval. Stable M-identifiers are retained even though the sections are grouped by
authority rather than numeric order.

## Governance and repository-operations approvals

### M1 — Authorize the execution-instruction cutover

**Question:** After the exact 0.4 surface and removal map are frozen, may the repository execution
instructions be replaced with that approved architecture?

**Why this is a product-authority question:** Current instructions require five packages and retain
0.3 operations that D15/D16 change. A corpus document cannot override them.

**Recommendation:** approve the cutover only against the exact future surface-freeze commit. The
replacement instruction should name the package graph, public exports, hard removals, compatibility
policy, and mutation allowlist. Until then Plan 039 remains blocked.

**Default without an answer:** no implementation.

### M5 — Durable repository-receipt policy and writer authority

**Question:** Which successful certifications and terminal release attempts are copied to the
selected orphan `evidence/receipts-v1` ref, and who may write that ref?

**Recommendation:** archive every aggregate certification that becomes a release candidate and
every terminal release attempt, including partial/unknown external mutation outcomes. Protect the
ref so only a separately reviewed archival workflow or app may fast-forward it. Do not archive
every exploratory PR run indefinitely. A separate evidence repository would require a new explicit
decision.

**Default without an answer:** retain temporary Actions artifacts only; do not grant write
authority.

## Product decisions

### M2 — Decide the matrix product

**Question:** Should `compileExecutableMatrix` be removed, retained unchanged, or redesigned as a
truthful independently committing matrix operation?

The strongest redesign owns real invariants:

- deterministic cell identity and bounded concurrency;
- independent publication per cell;
- a complete result containing every committed artifact and failure Cause;
- explicit interruption semantics and observation of partial durable outcomes; and
- no false all-or-nothing transaction claim.

**Recommendation:** do not retain the homogeneous 0.3 shape unchanged. Retain a redesigned matrix
only if this report/partial-commit behavior is part of the desired product; otherwise remove it and
document ordinary Effect composition. This is not decided by adoption.

**Default without an answer:** unresolved; no surface freeze.

### M3 — Final compile-operation names

**Question:** Keep provider-native `compileExecutable` names, use provider-specific native verbs,
or expose both only where they denote distinct operations?

**Research prerequisite:** complete Bun host/command and Deno command operation identities. A name
must follow the native request, embedded runtime, lifecycle, and ownership; it must not imply one
runtime-neutral compiler service.

**Recommendation:** preserve `compileExecutable` for Bun/Deno native compile operations where it is
truthful, use an assembly verb for Node SEA, and do not create one generic executable producer.

### M4 — Apple distribution product scope

**Question:** Is 0.4 responsible only for provider-specific executable correctness, or should it
also add a first-party Apple distribution package?

Options after `APPLE-DISTRIBUTION-BOUNDARY.md`:

1. correctness repair only in 0.4; release systems own Developer ID, notarization, and packaging;
2. add `effect-build-apple` with separate native operations for code signing, app bundles,
   archives/disk images, installer packages, notarization, stapling, and assessment; or
3. ship only a smaller, explicitly named subset after credential-backed proof.

**Recommendation:** make provider assemblers return structurally validated executables only for
build-host/target cells whose required correctness repair is available and proved, complete the
credential-backed Apple program in parallel, and promote an Apple package only when its exact
operation subset passes. Do not put distribution credentials or policy into Node SEA/Bun/Deno
assemblers.

The proposed provider inventory covers direct Developer ID distribution. Mac App Store support is
a separate scope with different identity, sandbox, provisioning, export, and publication laws.
Recommendation: explicitly exclude it from the first Apple package.

### M6 — Initial browser-role stability promise

**Question:** If `BrowserModulePayload` passes, should its first core release receive the D3 public
stability promise immediately or be explicitly experimental for one release?

This is independent of the Deno adapter's upstream-experimental status. The role and each adapter
have separate compatibility commitments.

**Recommendation:** if the full unchanged-consumer/browser proof passes the frozen laws, ship the
core role under the normal promise; mark only the Deno adapter experimental. If the proof is too
narrow for that promise, defer the core role rather than weakening its meaning.

### M7 — Tool selection developer experience

**Question:** Must every selected-command Layer receive an explicit executable, or may it perform
deterministic PATH discovery when no executable is supplied?

**Recommendation:** support both authorities: an explicit path wins when provided; otherwise
perform one deterministic PATH lookup, require one unambiguous selected executable, bind its full
content identity for the Layer lifetime, and fail clearly on absence or ambiguity. Never install,
retry another candidate, fall back after incompatibility, or substitute at operation time.

This choice affects user experience but not D9's admission laws. Whatever is selected still passes
identity, capability, relation, and replacement checks.

### M8 — First-party package and export organization

**Question:** After the complete operation map is available, should provider packages expose
operation-specific subpaths, `Api`/`Command` transport groupings, or a hybrid with both only where
each grouping contains real operations?

**Recommendation:** keep one package per provider, namespace-only package roots, and
operation-specific public modules. Use `Api` and `Command` grouping only where it improves discovery
without creating empty twins; do not make every provider mirror both. The final answer must list
every exact package/subpath and account for the sixth Rolldown package if it passes.

## Decisions already resolved; do not ask again

- Provider-native operations are the permanent base; portable roles are additive (D2).
- `Api` and `Command` are operation-specific transport lanes, not mandatory mirrored namespaces.
- Third-party authors are part of the product; lack of an adopter is not an architectural veto
  (D3).
- 0.4 is a hard cut (D4), and `withJavaScriptBundle` is removed (D16).
- Deno bundle operations are experimental per operation; stable Deno operations are not infected
  by that status (D6).
- Raw provider watch handles may ship; a typed CLI-text-derived watch protocol may not (D7).
- Compatibility needs the minimum private identity/capability/hole/relation evaluator in D9; a
  public compatibility DSL is not selected.
- First-party packages are lockstep; Rolldown is a sixth first-party package if its independent gate
  passes (D10/D15).
- Correctness re-signing and distribution trust are different operation families (D11).
- Digest requirements follow semantic claims and use distinct hashed/unhashed result variants
  (D12).

## Design questions that should not be sent to the maintainer yet

These are resolved by law/rent analysis unless two equally truthful designs remain:

- service versus function for each operation;
- whether `HostPath.Observed` is public;
- exact `Author/*` field layout;
- provider error class structure;
- internal compatibility table representation; and
- whether an upstream option is a separate operation, mode, modifier, result field, relation, or
  runtime capability.

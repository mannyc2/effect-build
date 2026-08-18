# Canonical Node pipeline

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Recover the intended Node source-to-executable composition and its information/lifetime laws.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Pipeline

```text
NodeMainProgram request
        │
        │ producer plans against assembler's exact Node target
        ▼
borrowed canonical NodeMain
        │ authenticated acquire inside producer continuation
        ▼
NodeMainExecutable assembly
        │ same-parent staging → validation → native/runtime inspection
        ▼
atomic rename
        ▼
durable Node executable artifact
```

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/final/recipe.ts#L15-L45


## Phase 1: assembler target negotiation

The assembler is consulted first because Node SEA support depends on an exact builder/base/runtime relation. Its plan exposes the target that the producer must satisfy. This prevents a producer from emitting an ambient “latest Node” bundle that the assembler later guesses how to consume.

**Invariant:** target negotiation is pure with respect to output mutation. Unsupported protocol, Node version, capability, or builder/base relation fails before a temporary output or destination is touched.

> **Provenance:** `RECONSTRUCTED-INFERENCE` · inference · confidence **high** · final contract plan ordering plus compatibility relation tests


## Phase 2: Node main production

The producer validates the source request and emits a canonical `NodeMain` inside one continuation. The value represents **main-entry semantics**. It carries authenticated identity and observations; its acquisition authority is borrowed.

Minimum import observations:

- Node built-ins;
- package imports/requires;
- static and dynamic imports;
- JSON module/require observations;
- unresolved or provider-externalized imports;
- provider-observed graph entries that cannot be classified more precisely.

An assembler may accept only a subset, but rejection must identify the unsupported imports rather than silently externalize or rewrite them.

## Phase 3: authenticated acquisition

The assembler opens a scoped lease from `NodeMain.acquire`. The lease yields bytes or a file and repeats identity observation. It compares digest and byte count to the canonical identity before any final publication.

Failure distinctions:

- expired producer authority;
- missing/unreadable file;
- byte mutation;
- digest authentication mismatch;
- unsupported transport;
- unsupported imports.

These distinctions are not interchangeable: an expired borrowed value is a lifetime error, while changed bytes are an integrity error.

## Phase 4: assembly and durable publication

Recommended state machine:

```text
resolve and canonicalize destination
→ claim destination against active cleanup roots
→ allocate same-parent staging file
→ copy/write authenticated main and invoke assembler
→ verify candidate is regular/executable
→ inspect native format and system target
→ run/inspect runtime identity where the provider law requires it
→ record bytes and optional digest
→ atomic rename staging to destination
→ return committed artifact
```

Before atomic rename, interruption/failure must leave the destination unchanged and clean staging. After rename, the result is durable and must not be rolled back because a caller fiber is interrupted later.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L351-L416


## Durable artifact observations

A durable Node executable records:

- canonical destination path observation;
- byte count and optional digest;
- runtime name `node` and runtime version;
- system target/native format;
- producer and assembler profile/adapter observations;
- ordered build steps and tool compatibility state;
- committed state.

These are observations, not a claim of hermetic provenance or reproducibility.

## Substitutability law

For any source request within the producer profile, any assembler target admitted by both adapters, and any supported canonical import set:

1. producer A or B yields a Node main whose direct main execution has the same application-visible result;
2. assembler X authenticates the same canonical content identity it was given;
3. assembler X produces a runnable Node executable with the same application-visible result;
4. borrowed expiry/mutation and durable publication laws are identical;
5. provider-specific diagnostics remain available when production/assembly fails.

The law does not require generated bytes, output size, or implementation steps to be identical.

## Known falsifiers and limits

- Importing a produced main as an ordinary module is outside the law.
- Bun/Deno standalone executables are outside the law because they embed different runtimes.
- Node builder/base version mismatch is a non-overridable relational failure.
- Current Node documentation supports ESM SEA mains, but the branch's strongest executable profile evidence centered on the earlier already-bundled single-main topology; ESM must be added only after exact implementation/certification.
- Signing and platform mutation are later copy/mutate/verify/publish operations, never in-place mutation of the observed input artifact.

> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · Node 26.1 SEA documentation in evidence/UPSTREAM-SOURCES.md


# Canonical contract specification

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Specify the smallest canonical values needed for truthful profile composition, with particular attention to NodeMain identity and borrowed lifetime.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Contract layers

The reconstructed contract has four layers:

1. **Provider-native values.** Official provider requests, results, diagnostics, contexts, and command behavior remain in provider modules.
2. **Profile plans.** A selected adapter validates protocol/target/request compatibility before acquiring output authority.
3. **Canonical borrowed values.** A role-specific value carries authenticated observations and an acquisition authority whose validity is bounded by the producer continuation.
4. **Durable artifacts.** A single-file result exists after validation and an atomic publication point; it does not retain a borrowed cleanup dependency.

> **Provenance:** `REMOTE-COMPILED` · observation · confidence **high** · `research/post-0.3/final/contracts.ts` compiled in successful architecture-research runs at `9b0d2f59567a7684b62df932c67b7a96050b605f`


## Protocol identity

The pushed final prototype used independent protocol strings for `NodeMain`, `NodeMainProgram`, `NodeMainExecutable`, `NodeSourceExecutable`, and the browser application. Protocol identity must be explicit so provider package/npm version skew can be rejected by contract rather than assumed from package-version equality.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/final/contracts.ts#L3-L7


## Canonical `NodeMain`

A canonical Node main is **not** a pair of `('plans/044-hard-cut-certify-v0.4.md', <built-in function format>)`. It is an authenticated, borrowed, Node-runtime-specific main-entry product with these required fields:

| Field group | Required information | Why it is part of the law |
|---|---|---|
| Protocol | Canonical `NodeMain` protocol/version | Prevents accidental structural compatibility across incompatible revisions |
| Content identity | SHA-256, byte count, and identity re-check on acquisition | Detects stale path reuse and mutation; authenticates assembler input |
| Acquisition | Scoped atomic bytes or file lease | Lets assemblers consume bytes/path without taking ownership of producer cleanup |
| Module semantics | `esm` or `cjs`; **main-entry** role | Node SEA and bundlers need format; receipts falsified arbitrary importable-module equivalence |
| Node target | Runtime `node`, syntax/runtime target version, checker/tool observation | Distinguishes syntax compatibility from producer host and final system target |
| Imports | Built-in, package, dynamic, JSON, and unresolved observations, including kind | Assemblers must fail honestly when external/import semantics cannot be embedded |
| Producer | Provider package/version, profile protocol, adapter protocol | Preserves which projection produced the value without exposing provider request internals |
| Steps | Ordered build-step/tool observations | Maintains composition trace and exact compatibility state |
| Transport | Bytes or file | Allows atomic byte handoff or scoped file use without pretending they have identical costs |
| Lifetime | Expiry after producer continuation; mutation detection on every acquisition | Makes borrowed authority observable rather than a convention |

The pushed prototype had static/dynamic/require/provider-observed kinds and builtin/package/unresolved classes. The requested recovered specification strengthens this by requiring explicit JSON observation and preserving unresolved dynamic/package distinctions where the provider can report them. That strengthening is a recommendation, not recovered code.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/final/contracts.ts#L13-L89


> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · user-required canonical Node pipeline fields plus provider graph evidence


### Why `('plans/044-hard-cut-certify-v0.4.md', <built-in function format>)` is lossy

Reconstruction from `('plans/044-hard-cut-certify-v0.4.md', <built-in function format>)` loses all of the following:

- whether the bytes still match what the producer observed;
- whether the path is alive or has escaped a cleaned temporary root;
- byte count and authenticated content identity;
- Node syntax/runtime target;
- unresolved package/builtin/dynamic/JSON imports;
- which profile protocol and adapter produced the main;
- provider/tool compatibility state;
- ordered build steps;
- whether the consumer is allowed to retain the path;
- whether acquisition must be bytes or file.

A downstream assembler would be forced either to trust mutable ambient filesystem state or to rediscover partial semantics with different tools. Both weaken substitution and error precision.

## `NodeMainProgram` plan

Abstract shape:

```text
plan(consumerProtocol, sourceRequest, assemblerTarget)
  -> validated producer plan

producerPlan.withMain(use)
  -> Effect<A, ProducerFailure | AFailure, Requirements>
```

The planning phase validates profile protocol, target support, format, and provider options before acquiring a temporary root or writing output. One continuation owns cleanup. The `NodeMain` passed to the callback may be returned as data, but its `acquire` authority deterministically fails after continuation exit.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · ownership and profile law tests preserved in the architecture receipt sets


## `NodeMainExecutable` plan

Abstract shape:

```text
plan(consumerProtocol, executableRequest)
  -> assembler plan containing exact Node target

assemblerPlan.assemble(nodeMain)
  -> durable Node executable artifact
```

The assembler authenticates acquired bytes against `NodeMain.identity`, rejects expired/mutated mains, rejects unsupported external imports, stages in the destination parent, validates the executable/runtime/system target, optionally hashes it, and commits by atomic rename.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/final/contracts.ts#L197-L240


## Browser canonical value

A browser application canonical value should be a borrowed tree with:

- protocol and adapter identity;
- normalized root and entry HTML;
- a manifest of every output path, bytes, digest, media kind, and generated/source relationship;
- a URL-reference graph after rewriting;
- source-map observations where supported;
- tool and ordered step observations;
- closure-owned file/tree acquisition that rechecks containment, liveness, and digest;
- no claim of atomic multi-file publication.

The pushed evidence establishes the **role and borrowed-tree direction**, not this full general manifest implementation.

> **Provenance:** `RECONSTRUCTED-INFERENCE` · inference · confidence **medium** · profile-refinement receipts plus requested browser algorithm


## Failure taxonomy

Portable profiles should normalize only profile-law failures while retaining exact provider errors as nested causes/details:

| Failure | Meaning | Override allowed? |
|---|---|---|
| Protocol unsupported | Adapter does not implement requested protocol | No |
| Target unsupported | Provider cannot produce/assemble requested Node target | No |
| Tool version untested | Unknown but capability-present version | Only explicit Layer override |
| Known incompatibility | Version is known bad | No |
| Missing capability | Required operation absent | No |
| Relation unsatisfied | E.g. Node builder/base inequality | No |
| Borrowed output expired | Producer continuation ended | No |
| Borrowed output changed | Digest/bytes differ | No |
| Acquisition failed | Scoped bytes/file could not be acquired | No |
| External import unsupported | Assembler cannot preserve required import | No |
| Authentication failed | Acquired bytes do not match canonical identity | No |
| Provider production/assembly failed | Native operation failed | N/A; retain native diagnostic |

## Contract invariants

1. Planning performs no output mutation when it rejects protocol, target, options, version, capability, or relation.
2. Provider-native request/result distinctions never leak into a portable profile request unless they are part of the role.
3. A profile adapter can preserve more observations than the minimum; it cannot silently discard a falsifier.
4. Borrowed values are not serializable durable artifacts.
5. Durable artifacts never depend on a temporary producer root after commit.
6. Profile protocols are independent of npm version equality and must be checked explicitly.
7. Instrumentation cannot alter the success value, typed failure, defect, interruption, or Cause topology.

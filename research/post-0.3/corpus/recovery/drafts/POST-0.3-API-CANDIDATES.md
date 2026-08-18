# Post-0.3 API candidates — reconstructed draft

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Provide a future design-review document comparing API candidates without asserting implementation.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Evaluation criteria

1. Preserve provider-native request, diagnostics, project authority, lifecycle, and output semantics.
2. Add portable roles only where provider substitution has a finite executable law.
3. Make borrowed versus durable ownership visible in the API shape.
4. Use official Effect services rather than duplicate wrappers.
5. Fail before mutation for protocol/options/version/capability/relation errors.
6. Keep extension cost proportional to a provider capability, not to a universal algebra.
7. Support independent provider compatibility releases.

## Candidate A — provider-native only

```text
effect-build-bun/Api
effect-build-bun/Command
effect-build-deno/Api
effect-build-deno/Command
effect-build-esbuild/Api
effect-build-node-sea/Command
```

**Advantages:** maximal fidelity; smallest shared ontology; no questionable normalization.  
**Costs:** portable applications must select providers even for demonstrated common roles; composition patterns are duplicated.  
**Verdict:** valid fallback, not the preferred whole product.

## Candidate B — provider-native plus role profiles and recipes

Adds:

```text
effect-build/Author/Tool
effect-build/Author/BorrowedOutput
effect-build/Author/Executable

effect-build/Profile/NodeMainProgram
effect-build/Profile/NodeMainExecutable
effect-build/Profile/BrowserModuleApplication

effect-build/Recipe/NodeSourceExecutable
```

Provider adapters live in their provider packages. Profiles contain only role laws; provider modules remain canonical.

**Advantages:** preserves native breadth while removing provider choice from applications that depend only on a proven role; clear ownership; finite protocol compatibility.  
**Costs:** profile protocol/version commitments and adapter conformance suites.  
**Verdict:** recommended C2.

## Candidate C — generalized transformation/executable algebra

Possible concepts would include generic input/output nodes, transformation plans, executors, graph edges, artifact sets, event streams, and mutation/signing phases.

**Advantages:** superficially uniform composition and potential future caching/serialization.  
**Costs:** represents invalid provider combinations; erases project/runtime authority; duplicates Effect composition; requires universal lifecycle/event/artifact semantics that evidence falsified.  
**Verdict:** reject.

## Proposed public-shape sketches

These are specification sketches, not implementation TypeScript.

### Provider API lane

```text
build(request) -> Effect<NativeResult, NativeError, HostRequirements>
context(request) -> Effect<NativeContext, NativeError, Scope | HostRequirements>
```

The request/result are provider-native. Cancellation exists only where upstream provides it.

### Provider command lane

```text
makeLayer({ executable?, allowUntestedVersion? })
operation(request) -> Effect<ProviderResult, ProviderError, PlatformRequirements>
watch(request) -> scoped official Effect child process/raw streams
```

The Layer captures exactly one executable/version. No fallback or automatic installation.

### `NodeMainProgram`

```text
plan(protocol, request, exactNodeTarget)
  -> producer plan
producerPlan.withMain(main => Effect<A, E, R>)
  -> Effect<A, ProducerError | E, R | Requirements>
```

### `NodeMainExecutable`

```text
plan(protocol, durableOutputRequest)
  -> assembler plan with exact Node target
assemblerPlan.assemble(canonicalNodeMain)
  -> Effect<DurableNodeExecutable, AssemblyErrors>
```

### `BrowserModuleApplication`

```text
withApplication(request, borrowedTree => Effect<A, E, R>)
  -> Effect<A, BrowserProductionError | E, R | Requirements>
```

The borrowed tree exposes re-observing Effects, not a durable directory claim.

## Rejected API names and abstractions

- `SingleNodeProgram`: overstates importable-module semantics.
- root-level `compileExecutable`: omits embedded runtime/provider.
- `withJavaScriptBundle`: omits Node-main role and canonical observations.
- `Author/Command`: duplicates Effect process APIs.
- `Author/CommandCompiler`: combines provider convenience policy without a shared invariant.
- `Artifact.Directory` as durable transaction: no commit/rollback law.
- cross-provider `WatchEvent`: upstream machine protocol absent.
- `SourceLocator` unless it provides authenticated/redacted multi-step identity beyond existing Path/source-map services.

## Selection

Select Candidate B subject to the implementation-only gates in `gaps/IMPLEMENTATION-ONLY-GATES.md` and explicit maintainer decisions in `gaps/MAINTAINER-DECISIONS.md`.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · reconstruction/ARCHITECTURE-DECISION.md


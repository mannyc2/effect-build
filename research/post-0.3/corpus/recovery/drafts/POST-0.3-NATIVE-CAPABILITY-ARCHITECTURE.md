# Post-0.3 native-capability architecture — reconstructed draft

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Offer a repository-ready architecture narrative for later maintainer review; it is not recovered wording and grants no implementation authority.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Status and baseline

- Released v0.3.0 source: `f06f96ca88b6278e5f23a898d758b99fa9322108`.
- Release-line base: `15c811bb9904142a33d119766b62082f3c689f13`.
- Research branch current head observed: `96e53a27be4ef96fb47f1a745480e0c5382640f2`.
- Last substantive evidence commit: `49cd5e1be7917bf14e89068afb4fa47cf78488fb`.
- Last successful structured receipt boundary: `9b0d2f59567a7684b62df932c67b7a96050b605f`.
- Plan 039 was not started; production packages and current export maps were not changed by the research branch.

## Product thesis

`effect-build` should provide permanent, rich, Effect-native provider access and publish portable roles only when request authority, output meaning, ownership, interruption, failure, runtime, target, and substitutability can be stated honestly and tested.

## Selected structure

```text
Core
  Author/Tool
  Author/BorrowedOutput
  Author/Executable
  Profile/NodeMainProgram
  Profile/NodeMainExecutable
  Profile/BrowserModuleApplication
  Recipe/NodeSourceExecutable

Bun
  Api
  Command
  Profile/NodeMainProgram
  Profile/BrowserModuleApplication

Deno
  Api
  Command
  Profile/BrowserModuleApplication

Esbuild
  Api
  Profile/NodeMainProgram

Node SEA
  Command
  Profile/NodeMainExecutable
```

Package roots should be discovery facades; explicit subpaths are canonical.

## Provider lanes

`Api` is the official in-process API and preserves its native request/result/callback/plugin/diagnostic/context semantics. `Command` is one selected executable and preserves CLI/project/config authority and scoped process behavior. Neither lane falls back to the other.

## Core author invariants

- `Tool` owns exact selection/version/capability/compatibility/no-fallback.
- `BorrowedOutput` owns containment, cleanup-root/destination overlap, closure authority, liveness, mutation/digest, and exact Exit cleanup.
- `Executable` owns same-parent staging, validation, native/runtime inspection, optional digest, and atomic single-file commit.
- Effect owns commands, child handles, streams, Scope, signals, Path, FileSystem, spans, logs, and exporters.

## Profiles

- `NodeMainProgram`: one Node main entry, not arbitrary importable module.
- `NodeMainExecutable`: one authenticated already-bundled main to durable Node executable.
- `BrowserModuleApplication`: contained discovered/rewriteable HTML module graph to borrowed tree.
- Incremental Node main: architecturally valid, deferred until a second product adapter/package is selected.

## Compatibility

Provider/lane/operation policies combine matrix-tested points, complete supported ranges/disjoint sets, known incompatibilities, capability probes, relational rules, strict default, and explicit unknown-but-capable override. The override never bypasses known incompatibility, missing capability, relation, protocol, or output laws.

## Watch

Provider-native watch is raw scoped process behavior. No typed cross-provider readiness/rebuild protocol is published without an upstream machine-readable contract. Telemetry is not an application event stream.

## Browser

A production profile must structurally parse HTML/CSS, traverse nested references/dynamic chunks, copy only discovered assets, rewrite URLs, validate containment/maps, and execute in real browsers. Existing fixture probes establish role plausibility, not this implementation.

## Observability

Use Effect-native root/child spans, bounded annotations, structured warnings, and safe summary logs. Preserve provider diagnostics and source maps on native values. Applications supply OpenTelemetry exporter Layers.

## Breaking direction

Subject to implementation review, remove or replace ambiguous 0.3 surfaces rather than keeping parallel advanced/legacy tiers:

```text
Integration                    -> focused Author invariants
Provider                       -> provider-local explicit construction
JavaScriptBundle.Artifact      -> canonical NodeMain or provider-native result
withJavaScriptBundle           -> NodeMainProgram continuation
SingleNodeProgram              -> NodeMainProgram
stages / StageObservation      -> steps / BuildStepObservation
```

Exact compatibility delegates, deprecation windows, and coordinated 0.4 release timing require maintainer authority.

## Non-goals

No provider registry, fallback selector, build graph algebra, CAS/cache coordinator, universal plugin system, remote execution, serializable plan language, universal event protocol, directory transaction, provenance/hermeticity claim, or release coordinator.

## Authority

This draft authorizes nothing. Implementation begins only after maintainer selection and a fresh branch/head/scope check.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · reconstruction documents in this package plus pushed research sources


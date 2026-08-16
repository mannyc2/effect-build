# Plan 039: Establish core author capabilities and observability

## Status

- Priority: P0 architecture foundation
- Effort: XL
- Risk: HIGH shared lifecycle and integration-author API
- Depends on: approval of the post-0.3 architecture decision
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Refactor the released core mechanisms into precise integration-author
capabilities without changing 0.3 behavior:

```text
effect-build/Author/Command
effect-build/Author/TemporaryOutput
effect-build/Author/Executable
effect-build/Author/CommandCompiler
```

Add native Effect tracing and logging contracts. Do not add provider-native
features, SingleNodeProgram, the final 0.4 export map, publication, tags, or a
release.

This is the first implementation PR. Plans 040, 041, and 042 may proceed
independently after it.

## Baseline and drift check

Before editing:

1. verify the implementation branch descends from `v0.3.0` source
   `f06f96ca88b6278e5f23a898d758b99fa9322108`;
2. verify the release-line base is not stale `main`;
3. record the exact parent SHA;
4. freeze current 0.3 runtime keys, declarations, errors, and lifecycle tests as
   characterization evidence;
5. stop if unrelated production changes overlap the same internals.

## Current problem

`effect-build/Integration` currently combines:

- bounded command execution;
- temporary-root ownership;
- live-bundle inspection;
- cleanup and publication overlap claims;
- executable staging;
- native inspection;
- hashing and atomic rename.

`effect-build/Provider` is specifically a selected-command
source-to-executable compiler factory, but its name suggests every provider and
it reflectively assumes every additional service function returns an Effect.

The selected architecture needs independently named authorities. It does not
need a general executor or provider registry.

## Target modules

### `Author/Command`

Provide two author-level operations.

```ts
export interface Selected<Name extends string> {
  readonly tool: ToolObservation<Name>

  readonly run: (
    argv: readonly string[],
    options?: RunOptions
  ) => Effect.Effect<Completion, CommandExecutionError>

  readonly start: (
    argv: readonly string[],
    options?: RunOptions
  ) => Effect.Effect<
    Running,
    CommandExecutionError,
    Scope.Scope
  >
}
```

`run` preserves bounded stdout/stderr and simultaneous drain/exit observation.
`start` supports provider-specific watch lanes with scoped stdout/stderr streams
and exit status.

Preserve:

- `shell: false`;
- explicit argv;
- selected executable path and version;
- bounded completion output;
- active-child signal, force-kill, and reaping behavior;
- caller interruption as interruption;
- platform-neutral Effect process requirements.

Do not expose:

- shell strings;
- raw runtime-specific process handles;
- automatic installation;
- a global executor registry;
- fallback to another command or API lane.

### `Author/TemporaryOutput`

Own:

- temporary file/directory acquisition;
- cleanup-root registration;
- overlap checks against protected publication destinations;
- liveness;
- file mutation and digest checks;
- cleanup after success, typed failure, defect, and interruption.

The 0.3 `JavaScriptBundle.Artifact` remains temporarily available through a
migration adapter until Plan 044. New production code must use the extracted
authority.

Do not claim that a temporary value is durable or serializable.

### `Author/Executable`

Own the single-file executable lifecycle:

```text
prepare
-> resolve and claim destination
-> allocate same-parent staging
-> producer writes candidate
-> verify regular/executable file
-> inspect ELF/Mach-O/PE
-> resolve SystemTarget
-> optional digest
-> atomic rename
```

Keep package-private:

- candidate type IDs;
- claim maps and counters;
- native parser range requests;
- rename implementation;
- mutable state.

This module does not promise transactional publication for arbitrary
multi-file provider outputs.

### `Author/CommandCompiler`

Replace `Provider.define` with an explicitly command-scoped author contract.

Requirements:

- explicit Effectful `makeService`;
- all construction requirements visible in the returned Layer type;
- no reflection over service keys or function return values;
- target authority remains provider-owned;
- scalar compilation is the primitive;
- matrices orchestrate validated scalar cells;
- provider-specific options remain provider-specific.

Bun and Deno are the only repository implementations. Esbuild, Node SEA, and
host API lanes do not implement this SPI.

### Durable output vocabulary

Internally introduce the future 0.4 names:

```text
Artifact.LocalPath
BuildStepObservation
steps
systemTarget
```

Do not remove the 0.3 names before Plan 044. Migration projections must be thin
and tested; they are not a second implementation.

`Artifact.LocalPath` is constructed from canonical host observation. Do not add
a general decoding Schema that implies a path exists or is portable.

## Observability contract

Use Effect tracing, annotations, and logging only. Add no direct OpenTelemetry
dependency. Exporter Layers remain application policy.

### Root spans

Every public provider operation eventually uses:

```text
effect-build.<provider>.<lane>.<operation>
```

Plan 039 establishes author child spans:

```text
effect-build.command.discover
effect-build.command.run
effect-build.command.start
effect-build.temporary-output.acquire
effect-build.executable.inspect
effect-build.executable.publish
```

### Stable attributes

Only these core low-cardinality keys are frozen in Plan 039:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.artifact.kind
effect_build.tool.name
effect_build.tool.version
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.contract
```

Rules:

- omit unknown fields;
- provider packages may add namespaced low-cardinality fields;
- do not attach source/output paths, argv, environment values, URLs, asset keys,
  plugin values, source snippets, or full diagnostics by default;
- warnings/errors may add summary log events;
- typed errors remain authoritative;
- instrumentation must not alter results, failures, defects, or Cause topology;
- a long-lived context is observed through setup/release and operation child
  spans, not one unbounded span.

### Verification instrumentation

Use an in-memory Effect tracer/logger in tests. Verify exact span names,
attributes, event counts, and redaction. Do not require an OTLP collector.

## Steps

1. Record the exact parent SHA and release ancestry.
2. Freeze 0.3 runtime/declaration API and lifecycle behavior.
3. Extract selected command discovery and `run`.
4. Add scoped command `start` without exposing raw platform handles.
5. Extract temporary ownership and claims.
6. Extract executable staging, inspection, and publication.
7. Introduce internal future-name durable output vocabulary.
8. Implement explicit `CommandCompiler.define`.
9. Migrate Bun/Deno internals and delete reflective service wrapping.
10. Add author-operation spans, attributes, and safe summary logs.
11. Keep 0.3 public paths as thin unreleased migration delegates.
12. Run the full gate and record observed workflow jobs.

## Invariants

- No provider name appears in core author implementations.
- No integration imports a sibling integration.
- No library source imports `node:*` or calls `Effect.runPromise`.
- Provider requirements are explicit in types and Layers.
- Temporary outputs close after every callback Exit.
- Caller failures, defects, interruption, and mixed Causes remain exact.
- Command interruption terminates and reaps active children.
- Atomic rename remains the durable executable publication point.
- A destination beneath an active temporary root is rejected.
- Multi-file output atomicity is not implied.
- Telemetry is exporter-neutral and redacts high-cardinality/sensitive values.
- 0.3 public behavior remains unchanged until Plan 044.

## Required verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
bun run verify:real
git diff --check
```

Focused evidence:

- mixed Fail/Interrupt and Fail/Die Cause tests;
- command start/run success and failure;
- active child interruption/reaping;
- cleanup-root/destination claim concurrency;
- temporary file mutation and digest mismatch;
- native ELF/Mach-O/PE inspection;
- platform publication and rename point-of-no-return;
- provider definition with additional Effect methods and requirements;
- no reflective wrapping;
- in-memory tracer/logger assertions;
- all current packed consumers unchanged.

## STOP conditions

Stop and report if:

- extracting a module changes any 0.3 error class, Cause, cleanup, target,
  digest, staging, or publication behavior;
- `Command.start` requires exposing a runtime-specific process value;
- explicit service construction cannot replace reflection without a hidden
  requirement;
- `Artifact.LocalPath` cannot be constructed from the active Path/FileSystem
  authority;
- telemetry requires OpenTelemetry or logs sensitive/high-cardinality values;
- a migration delegate becomes a second implementation;
- the branch is not a descendant of the released source.

## Completion receipt

Completion requires one focused implementation PR, exact source SHA, observed
GitHub Actions jobs, and an updated plan receipt. Architecture review alone does
not mark this plan complete.

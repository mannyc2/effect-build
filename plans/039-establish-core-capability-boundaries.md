# Plan 039: Establish precise core capability boundaries and telemetry

## Status

- Priority: P0 architecture foundation
- Effort: XL
- Risk: HIGH shared lifecycle and author API
- Depends on: approval of the post-0.3 native-capability architecture PR
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Refactor the released core mechanisms into precise capability-owned modules
without changing 0.3 runtime behavior. Establish the internal and temporary
public migration boundaries required by provider-native lanes and the later 0.4
hard cut.

This is the first implementation PR. It must not add provider-native build
features, the `SingleNodeProgram` profile, package publication, or the final
breaking export map.

## Motivation

`effect-build/Integration` currently owns bounded commands, borrowed bundle
inspection, temporary-root claims, executable staging, validation, hashing, and
publication. `effect-build/Provider` is specifically a command-backed
source-to-executable compiler factory but has a broad name and reflectively
wraps every additional function returned by a provider service.

The selected architecture needs these authorities to be independently usable by
Bun, Deno, Esbuild, Node SEA, and future integrations:

```text
Command
TemporaryOutput
Executable
CommandCompiler
```

The refactor must preserve the existing Cause topology, interruption, cleanup,
claim, inspection, and atomic-rename guarantees exactly.

## Scope

### `Command`

Move selected-tool observations and bounded/scoped command execution behind one
module. Preserve:

- `shell: false`;
- bounded stdout/stderr;
- simultaneous drain and exit observation;
- active-child termination and force-kill policy;
- caller interruption as interruption;
- platform-neutral Effect process requirements.

Do not expose a raw process handle, shell string, backend registry, or automatic
installation.

### `TemporaryOutput`

Move temporary root acquisition, liveness, cleanup-root claims, overlap checks,
and borrowed file/directory validation behind one module.

The implementation may introduce package-private nominal borrowed handles, but
0.3 `JavaScriptBundle.Artifact` remains temporarily exported through an adapter
until Plan 044.

### `Executable`

Move destination resolution, sibling staging, candidate identity, native
inspection, target resolution, optional digesting, and atomic publication behind
one module.

Keep candidate tokens, claim registries, raw native parser helpers, and mutation
operations package-private.

### `CommandCompiler`

Rename and reframe the command-only author factory. Replace reflective wrapping
of arbitrary service methods with an explicit Effectful `makeService` whose
requirements are represented in the Layer type.

Bun and Deno remain its only repository consumers. Esbuild and Node SEA do not
implement it.

### Telemetry

Instrument public and author-level effects with stable Effect operation names,
spans, annotations, and logs. Suggested attributes:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.tool.version
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.guarantee
```

Use Effect telemetry only. Add no direct OpenTelemetry dependency and no
required exporter Layer.

## Migration rule

This is one no-publish migration program. Plan 039 may add the new modules and
make existing `Integration`/`Provider` exports delegate to them, but it must not
remove or rename the 0.3 public surface. Plans 040-043 consume the new modules.
Plan 044 alone deletes the compatibility delegates and freezes the 0.4 surface.

The delegates are implementation sequencing, not a released compatibility
promise.

## Steps

1. Record the exact release-line SHA and assert ancestry from `v0.3.0`.
2. Freeze the 0.3 runtime/declaration API and all existing lifecycle tests as
   characterization evidence.
3. Extract selected command discovery/execution into `Command` without changing
   process behavior or output limits.
4. Extract temporary ownership and claims into `TemporaryOutput`; prove success,
   typed failure, defect, interruption, file mutation, cleanup overlap, and
   duplicate destination cases.
5. Extract executable staging/inspection/publication into `Executable`; preserve
   platform tests and rename point-of-no-return behavior.
6. Implement `CommandCompiler.define` with an explicit Effectful service
   constructor and migrate Bun/Deno internally.
7. Delete `captureAdditionalServiceEffects` and add type tests proving provider
   requirements are declared rather than discovered by reflection.
8. Add stable Effect spans/annotations around discovery, command, validation,
   temporary use, and publication.
9. Keep 0.3 exports as thin delegates for the unreleased migration branch.
10. Run full deterministic, real-tool, platform-publication, Effect endpoint,
    and packed-consumer verification.

## Invariants

- No provider name appears in core capability implementation.
- No integration imports a sibling integration.
- No library source imports `node:*` or calls `Effect.runPromise`.
- Provider service methods require no hidden captured dependencies.
- Temporary output is deleted after every callback exit.
- Typed provider errors, caller failures, defects, and interruption remain
  distinguishable.
- Atomic rename remains the only durable publication point.
- A destination beneath an active temporary root is rejected before publication.
- Public runtime behavior and declarations remain 0.3-compatible until Plan
  044.

## Verification

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

Required focused evidence:

- mixed Fail/Interrupt and Fail/Die Cause tests;
- active-child interruption/reaping tests;
- cleanup-root/destination claim concurrency tests;
- native ELF/Mach-O/PE validation and platform publication tests;
- provider definition type fixtures with additional Effect methods;
- telemetry tests using an in-memory Effect tracer/logger;
- all current packed consumers unchanged.

## STOP conditions

Stop and report before proceeding if:

- moving a function changes any 0.3 error class, Cause, cleanup, staging, target,
  digest, or publication behavior;
- the new author modules require a raw runtime-specific filesystem/process API;
- explicit provider requirements cannot replace reflection without changing the
  public provider service behavior;
- telemetry requires OpenTelemetry or changes typed operation results;
- a compatibility delegate becomes a second implementation instead of a thin
  projection;
- the branch is no longer a descendant of the released source.

## Completion receipt

Completion requires one focused implementation PR, exact source SHA, observed
GitHub Actions, and a plan update recording the verification that actually ran.
Do not mark `DONE` from design review alone.

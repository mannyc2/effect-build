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

`effect-build/Integration` currently combines bounded command execution,
temporary-root ownership, live-bundle inspection, cleanup/publication overlap
claims, executable staging, native inspection, hashing, and atomic rename.

`effect-build/Provider` is specifically a selected-command source-to-executable
compiler factory, but its name suggests every provider and it reflectively
assumes every additional service function returns an Effect.

The selected architecture needs independently named authorities. It does not
need a general executor or provider registry.

## Target modules

### `Author/Command`

Provide selected tool discovery plus two author-level operations:

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
  ) => Effect.Effect<Running, CommandExecutionError, Scope.Scope>
}
```

`run` preserves bounded stdout/stderr and simultaneous drain/exit observation.
`start` supports provider-specific watch lanes with scoped streams and exit
status. Preserve `shell: false`, explicit argv, selected path/version,
interruption, child termination/reaping, and platform-neutral requirements.
Expose no shell strings, automatic installation, global executor registry, or
runtime-specific process handles.

### `Author/TemporaryOutput`

Own temporary acquisition, cleanup-root registration, overlap checks,
liveness, file mutation/digest checks, and cleanup after success, typed failure,
defect, and interruption. The 0.3 live artifact remains only as a temporary
migration projection until Plan 044. Temporary values are not durable or
serializable.

### `Author/Executable`

Own:

```text
prepare
-> resolve and claim destination
-> same-parent staging
-> producer writes candidate
-> regular/executable validation
-> ELF/Mach-O/PE inspection
-> SystemTarget resolution
-> optional digest
-> atomic rename
```

Candidate type IDs, claim maps, parser range requests, rename implementation,
and mutable state remain package-private. This module does not promise
transactional publication for arbitrary multi-file output sets.

### `Author/CommandCompiler`

Replace `Provider.define` with an explicitly command-scoped author contract.
Requirements:

- explicit Effectful `makeService`;
- all requirements visible in the returned Layer type;
- no reflection over service keys or function return values;
- provider option validation remains a pure `Result` before staging/child work;
- provider-owned targets/options;
- scalar compilation as primitive;
- matrices as orchestration over validated scalar cells.

Bun and Deno are the repository implementations. Esbuild, Node SEA, and host API
lanes do not implement this SPI.

### Durable vocabulary

Introduce internally:

```text
HostPath.Absolute
HostPath.existing
BuildStepObservation
steps
systemTarget
```

Do not remove 0.3 names before Plan 044. `HostPath.existing` uses active
Path/FileSystem services to canonicalize and verify an existing path. Do not
add a syntax-only Schema that implies a deserialized path exists or is portable.

## Observability

Use Effect tracing, annotations, and logging only. Add no direct OpenTelemetry
dependency; exporter Layers remain application policy.

Author child spans:

```text
effect-build.command.discover
effect-build.command.run
effect-build.command.start
effect-build.temporary-output.acquire
effect-build.executable.inspect
effect-build.executable.publish
```

Stable keys:

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

Categorical values remain bounded; count/bytes are numeric. Omit unknowns. Do
not attach paths, argv, environment values, URLs, asset keys, plugin values,
source snippets, or full diagnostics by default. Safe summary logs are allowed.
Instrumentation must not alter values or Cause topology. Test with an in-memory
Effect tracer/logger, not an OTLP collector.

## Steps

1. Record parent SHA and release ancestry.
2. Freeze 0.3 API/lifecycle behavior.
3. Extract command discovery/run and scoped start.
4. Extract temporary ownership/claims.
5. Extract executable staging/inspection/publication.
6. Introduce future durable vocabulary internally.
7. Implement explicit `CommandCompiler.define`.
8. Migrate Bun/Deno internals and delete reflective wrapping.
9. Add author spans/attributes/safe logs.
10. Keep 0.3 paths as thin unreleased migration delegates.
11. Run the complete gate and record actual jobs.

## Invariants

- Core author implementations contain no provider names.
- No integration imports a sibling.
- Library source imports no `node:*` and calls no `Effect.runPromise`.
- Requirements are explicit in types/Layers.
- Scalar/matrix preflight is deterministic and performs no output or child work
  on rejection.
- Temporary outputs close after every callback Exit.
- Failures, defects, interruptions, and mixed Causes remain exact.
- Command interruption terminates/reaps active children.
- Atomic rename remains executable publication.
- Active temporary roots cannot capture durable destinations.
- Multi-file atomicity is not implied.
- Telemetry is exporter-neutral and redacted.
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

Focused evidence includes mixed Cause tests, command start/run, child reaping,
claim concurrency, mutation/digest mismatch, native inspection, platform
publication, no reflection, in-memory telemetry assertions, and unchanged packed
consumers.

## STOP conditions

Stop if extraction changes any 0.3 error/Cause/cleanup/target/digest/publication
behavior; scoped command start requires a runtime-specific process; explicit
construction leaves hidden requirements; HostPath cannot be established from
active services; telemetry requires OpenTelemetry or leaks sensitive values; a
migration delegate becomes a second implementation; or branch ancestry no
longer includes the release.

## Completion receipt

Completion requires one focused implementation PR, exact source SHA, observed
GitHub Actions jobs, and an updated receipt. Architecture review alone does not
complete the plan.

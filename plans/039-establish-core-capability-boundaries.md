# Plan 039: Establish core tool, borrowed-output, and executable laws

## Status

- Priority: P0 architecture foundation
- Effort: XL
- Risk: HIGH lifecycle, compatibility, and integration-author API
- Depends on: approval of the revised C2 architecture decision
- Research evidence: `research/post-0.3/`
- Status: TODO
- Publication authority: NONE

## Objective

Refactor released 0.3 internals into three precise public integration-author
capabilities without changing released behavior:

```text
effect-build/Author/Tool
effect-build/Author/BorrowedOutput
effect-build/Author/Executable
```

Also establish shared durable/runtime observations, provider-owned tool-version
compatibility vocabulary, and exporter-neutral Effect telemetry.

Do not add provider-native build features, profiles, recipes, final 0.4 exports,
package publication, tags, releases, or merges.

This plan deliberately does **not** publish the earlier proposed
`Author/Command` or `Author/CommandCompiler` modules.

## Baseline and drift check

Before editing:

1. verify ancestry from released source
   `f06f96ca88b6278e5f23a898d758b99fa9322108`;
2. verify the implementation branch descends from the release-line base rather
   than stale `main`;
3. record the exact parent SHA;
4. freeze 0.3 runtime keys, declaration keys, errors, target tables, lifecycle
   tests, and packed consumers;
5. read the executable research receipts and reproduce the law tests;
6. stop if unrelated production changes overlap process, temporary-root,
   publication, or provider-definition internals.

## Architectural correction

### Use official Effect process APIs directly

Official Effect `ChildProcess` already owns:

- command and argv construction;
- cwd/environment/shell policy;
- stdout/stderr streams and sinks;
- scoped child handles;
- exit status;
- signals and force-kill timeout;
- host-specific spawner Layers.

Core must not create a second public process API. Existing bounded command
capture may remain package-private while 0.3 delegates exist.

### No public command-compiler factory

`Provider.define` combines Bun/Deno convenience policy rather than a stable
cross-provider law. Its reusable parts are selected-tool compatibility,
provider validation, and executable publication. Replace reflective wrapping
internally, but do not publish a successor factory.

## Target public modules

### `Author/Tool`

Own:

- explicit executable or PATH selection;
- canonical selected-path observation;
- exact version probing;
- provider-owned tested ranges and known-incompatible versions;
- operation capability probes;
- strict default and explicit untested override;
- stable tool/build-step observations;
- no auto-installation, fallback, or hidden substitution.

Sketch:

```ts
export interface Selected<Name extends string> {
  readonly observation: ToolObservation<Name>
  readonly command: (
    argv: readonly string[],
    options?: ChildProcess.CommandOptions
  ) => ChildProcess.Command
}
```

`command` delegates to official Effect `ChildProcess.make` with the captured
canonical executable. It exposes no custom handle.

### `Author/BorrowedOutput`

Own:

- temporary files and trees;
- cleanup-root claims;
- destination/cleanup overlap checks;
- root containment;
- observed file/tree manifests;
- liveness, byte-count, and digest checks;
- closure-owned authority used by profiles;
- cleanup after every callback Exit;
- deterministic expiry after release.

The implementation must support both one-file Node-main and multi-file browser
application profiles without exposing mutable liveness tokens or root claims.

### `Author/Executable`

Own one durable single-file state machine:

```text
prepare
-> resolve and claim destination
-> same-parent staging
-> producer writes candidate
-> regular/executable validation
-> ELF/Mach-O/PE inspection
-> runtime and SystemTarget resolution
-> optional digest
-> atomic rename
```

The result includes runtime observation in addition to system target and ordered
steps. Candidate IDs, claim maps, parser internals, and rename operations remain
private.

## Shared root vocabulary

Introduce internally while retaining 0.3 projections until Plan 044:

```text
HostPath.Observed
HostPath.observe
ToolCompatibility
ToolObservation
ToolVersionUnsupported
ToolVersionUntestedOverride
BuildStepObservation
steps
systemTarget
Artifact.Executable.runtime
```

`HostPath.Observed` is a point-in-time canonical host observation. There is no
Schema decoder that pretends an arbitrary string still exists.

## Compatibility contract

Core supplies generic vocabulary/evaluation. Provider packages own ranges and
capability specifications.

Rules:

1. selection observes exact host/package/command version;
2. known-incompatible versions fail before output mutation;
3. missing required capabilities fail before output mutation;
4. untested versions fail by default;
5. Layer-configured override emits a structured warning and records
   `untested-override`;
6. override never bypasses lifecycle or output validation;
7. no operation-level fallback/install option exists.

Add type and unit tests for strict, override, known-incompatible, missing
capability, and exact observation behavior.

## Observability

Use Effect tracing/annotations/logging only. Add no direct OpenTelemetry
package or exporter requirement.

Stable author spans:

```text
effect-build.tool.select
effect-build.tool.probe
effect-build.borrowed-output.acquire
effect-build.borrowed-output.observe
effect-build.executable.inspect
effect-build.executable.publish
```

Stable keys:

```text
effect_build.provider
effect_build.lane
effect_build.operation
effect_build.artifact.kind
effect_build.runtime.name
effect_build.runtime.version
effect_build.tool.name
effect_build.tool.version
effect_build.tool.compatibility
effect_build.target.system
effect_build.output.count
effect_build.output.bytes
effect_build.interruption.contract
```

Do not attach paths, argv, environment values, URLs, asset keys, source snippets,
plugins, or full diagnostics by default. Test with in-memory Effect tracer/logger.

## Steps

1. Record parent SHA and release ancestry.
2. Freeze 0.3 behavior/declarations as characterization evidence.
3. Introduce `HostPath.Observed`, runtime observations, and future names
   internally.
4. Extract tool selection/version/capability logic into `Author/Tool`.
5. Refactor process callers to use official Effect `ChildProcess` through the
   selected tool; keep bounded-capture helpers private.
6. Extract temporary files/trees, claims, containment, manifests, and mutation
   checks into `Author/BorrowedOutput`.
7. Extract single-file staging/inspection/publication into
   `Author/Executable`.
8. Replace reflective provider-service wrapping with explicit provider-local
   construction; do not export a generic factory.
9. Add compatibility warnings/observations and native telemetry.
10. Keep 0.3 `Integration`, `Provider`, artifact, and provider-root exports as
    thin unreleased migration projections.
11. Run full deterministic, real-tool, platform-publication, Effect endpoint,
    law, and packed-consumer verification.
12. Record exact source SHA, jobs, and behavior deltas (expected: none for 0.3
    calls).

## Invariants

- Core author implementations contain no provider names.
- No integration imports a sibling.
- No library source imports `node:*` or calls `Effect.runPromise`.
- Official Effect process handles remain the only public raw process model.
- Tool selection captures one exact executable/version for Layer lifetime.
- No auto-installation, fallback, or post-selection PATH substitution occurs.
- Known-incompatible or incapable tools never reach output mutation.
- Pure provider preflight performs no staging or child work.
- Borrowed roots close after every callback Exit.
- Borrowed files/trees reject expiry, escape, mutation, and digest mismatch.
- Compatible duplicate core copies can use closure-owned borrowed authority.
- Atomic rename remains the only executable commit.
- Active cleanup roots cannot contain durable destinations.
- Multi-file atomicity is not implied.
- Telemetry does not change typed values or Cause topology.
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
node --test research/post-0.3/*.test.mjs
git diff --check
```

Focused evidence:

- exact process interruption/reaping and force-kill;
- bounded simultaneous stdout/stderr/exit capture remains unchanged;
- strict/override/known-incompatible/capability compatibility tests;
- cleanup-root/destination concurrency;
- borrowed file and tree containment/mutation/expiry;
- duplicate-core closure authority;
- ELF/Mach-O/PE inspection and runtime/system target observations;
- Linux/macOS/Windows publication;
- no public `Author/Command` or `Author/CommandCompiler`;
- no reflection over arbitrary service methods;
- telemetry names, bounded attributes, redaction, and warning behavior;
- all current packed consumers unchanged.

## STOP conditions

Stop and report if:

- any 0.3 error class, Cause, target, digest, cleanup, staging, or publication
  behavior changes;
- tool selection requires automatic installation or hidden fallback;
- provider compatibility cannot fail before mutation;
- official Effect process APIs cannot preserve the current interruption/reaping
  contract without a second public handle;
- borrowed tree containment cannot be implemented through platform-neutral
  Effect services;
- `HostPath.Observed` must claim continuing existence or decoding authority;
- runtime observation cannot be stated honestly for a provider output;
- telemetry requires OpenTelemetry or leaks sensitive values;
- a migration projection becomes a second implementation;
- branch ancestry no longer contains the release.

## Completion receipt

Record:

- exact parent and implementation SHAs;
- exact new author declarations;
- exact private helper deletions/retentions;
- every compatibility test/range fixture;
- every deterministic/real/platform/Effect job and conclusion;
- all packed consumer results;
- confirmation that no profile, provider-native feature, release, tag, or
  publication occurred.

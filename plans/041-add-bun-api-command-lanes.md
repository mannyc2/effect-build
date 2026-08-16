# Plan 041: Add Bun host API and selected-command lanes

## Status

- Priority: P1 provider-native API
- Effort: XL
- Risk: HIGH dual-lane semantics and Bun-host verification
- Depends on: Plan 039
- May run in parallel with: Plans 040 and 042
- Architecture commit: `e23722e81fa651c1540c8aa72e2703ff62ac609b`
- Status: TODO

## Objective

Expand `effect-build-bun` into:

```text
effect-build-bun/Api
effect-build-bun/Command
```

`Api` wraps real `Bun.build()` and requires a Bun orchestrator host. `Command`
invokes one selected Bun executable through Effect process services and remains
usable under another supported host.

Source -> Bun executable stays first-class. It is not replaced by
SingleNodeProgram -> Node SEA because the runtime contract differs.

## Upstream contract

At
[`oven-sh/bun@1726b14`](https://github.com/oven-sh/bun/tree/1726b144a06de8f4eeacbc9ebcb3448cc1b51b87),
`Bun.build()` supports virtual/multiple entries, browser/Bun/Node targets,
ESM/CJS/IIFE, HTML/CSS/assets, plugins/loaders, splitting, output artifacts and
logs, and executable compile mode. Cross-target compile tokens encode system,
architecture, libc, Bun compatibility, and CPU baseline/modern policy. No
per-build cancellation handle analogous to Esbuild context is documented.

## Canonical modules

```text
effect-build-bun/Api
effect-build-bun/Command
```

The root re-exports `Api`, `Command`, and later `SingleNodeProgram` namespaces,
not flat callable aliases.

## API lane

```ts
import type { BuildConfig, BuildOutput } from "bun"

export interface Service {
  readonly build: (
    options: BuildConfig
  ) => Effect.Effect<BuildOutput, BunBuildError>
}

export class BunApi extends Context.Service<
  BunApi,
  Service
>()("effect-build-bun/Api") {}

export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>
```

Public declarations import official `bun-types` module types instead of
requiring an ambient global Bun namespace. The declaration version is pinned and
tested against the supported Bun runtime.

Compile remains a mode of `BuildConfig`. Do not add a second API-lane
`compileExecutable` in 0.4: it would duplicate the provider request and would
need separate proof of output path, validation, write timing, cancellation, and
publication semantics.

The API preserves `BuildOutput` and provider plugin/output/log values.
Interruption stops awaiting/downstream Effect use but does not claim to cancel
underlying Bun work or roll back direct writes.

## Command lane

```ts
export interface Service {
  readonly build: (
    input: BunCommandBuildInput
  ) => Effect.Effect<BunWrittenOutput, BunCommandBuildError>
  readonly compileExecutable: (
    input: BunCompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, BunCompileError>
  readonly compileExecutableMatrix: (
    input: BunCompileExecutableMatrixInput
  ) => Effect.Effect<readonly Artifact.Executable[], BunMatrixError>
}
```

### Command build

Expose a typed CLI-representable subset: multiple entries; browser/Bun/Node
target; output file/directory; supported formats; splitting; minification;
source maps; externals/packages; defines/naming/public path; metafile; and
HTML/CSS/assets where the CLI supports them.

Return provider-specific written output. Do not claim atomic set publication.
Interruption may leave partial provider output unless a later probe proves an
owned staging strategy. Do not reconstruct JavaScript plugins through argv.

### Command compile

Preserve and broaden released compile: source entry, Bun target tokens,
minification, bytecode/source maps/defines where supported, selected tool
identity, native target inspection, optional digest, and core-owned single-file
staging/atomic publication.

The output is a Bun-runtime executable with Bun and Node built-ins, not a Node
SEA executable.

### Matrix

Remain homogeneous/provider-specific. Scalar compile is primitive. Validate the
whole request before output work, preserve ordered partial results, perform no
matrix-wide rollback, and stop active/queued work on interruption.

## Watch probe

Bun CLI watch exists, but a typed 0.4 operation requires evidence for readiness,
rebuild notification, diagnostics, termination, and a stable event model. Add a
scoped provider-specific watch only if the probe succeeds. Otherwise document
watch as excluded; do not expose a raw process escape.

## Profile preparation

Keep a package-private one-main Node adapter using the command lane. It becomes
public only in Plan 043 and never becomes the canonical Bun API.

## Steps

1. Pin Bun runtime/tool and official `bun-types` versions separately from
   package-manager use.
2. Add Bun-host and non-Bun-host type fixtures.
3. Implement `Api.build` with exact provider types/errors/results.
4. Add Command service and migrate scalar/matrix compile.
5. Add typed command build.
6. Characterize provider-written output on failure/interruption.
7. Probe command watch without publishing it prematurely.
8. Preserve a private profile adapter.
9. Add lane telemetry/redaction and packed consumers.
10. Run the full gate and record actual jobs.

## Invariants

- Api and Command never fall back to each other.
- Api requires Bun host; Command does not.
- Api preserves `BuildOutput` and makes no false cancellation/rollback claim.
- Command interruption terminates/reaps the child.
- Command compile retains native inspection and atomic single-file publication.
- Bun compile remains distinct from Node SEA.
- Multi-file command build is not called atomic.
- Plugins remain provider-native; no core plugin interface appears.
- Package manager, Effect host, selected tool, and output runtime remain
  independent.
- No sibling integration dependency is introduced.

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

Required evidence: packaged `bun-types` fixtures; virtual files; multiple
entries; browser/Bun/Node; formats; HTML/CSS/assets; plugins/loaders;
splitting/metafile; API compile mode; one-shot interruption without cancel
claim; Node-host command build; every advertised executable target; compile
flags; scalar/matrix interruption/partial success; partial output
characterization; watch receipt; isolated packed Api/Command consumers.

## STOP conditions

Stop if Api requires Node platform mechanics; provider values are flattened;
command claims plugin parity; API compile is called atomic/cancellable without
evidence; Bun-runtime output is replaced by Node SEA; output-set publication is
called atomic without proof; packaged types fail under target hosts; or watch is
published without a stable event/lifetime contract.

## Completion receipt

Completion requires one Bun-focused implementation PR recording exact Bun
runtime/command/declaration versions, host matrices, and observed CI.

# Plan 020: Hard-cut to a four-package Bun workspace and publish Node SEA as a provider

> **Executor instructions**: Execute this plan from exact completed Plans
> 015-019 commit `4f26c02de66db3326932e610b7225fcd0eec8b69`. The
> completed Plan 019 decision is historical evidence: it found no selected
> public consumer at that time. The maintainer has now selected Node SEA as a
> real product and Bun as the repository package manager. Implement that later
> breaking decision here without rewriting Plans 015-019, adding legacy
> facades, copying lifecycle code, or promoting the other rejected candidates.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: completed Plans 015-019 at exact commit `4f26c02`
- **Category**: public API / packages / architecture / release preparation
- **Execution branch**: `codex/020-node-sea-bun-workspaces`
- **Initial state**: `IN PROGRESS`
- **Selected breaking lockstep version**: `0.3.0`

## Restamped evidence

At program start on 2026-08-13:

- `git rev-parse HEAD` and `origin/codex/lifecycle-sea` both resolved to
  `4f26c02de66db3326932e610b7225fcd0eec8b69` before branching.
- The lifecycle worktree was clean. Older planning worktrees retained their
  user-owned dirty and untracked files and remain untouched.
- A frozen pnpm install plus `pnpm verify` passed: 146 unit tests with one
  platform skip, 65 architecture tests, TSTyche, packed consumer, lint, and
  formatting.
- npm returned E404 for `effect-build@0.3.0`, `effect-build-bun`,
  `effect-build-deno`, and `effect-build-node-sea`. GitHub returned 404 for tag
  and release `v0.3.0`. Absence is not registry ownership.
- `npm exec --yes --package=bun@1.3.14 -- bun --version` returned `1.3.14`.
- Public `@mannyc1/ts-release` remained `0.0.7`; Plan 021 owns requalification.

## Product contract

The repository becomes one private Bun workspace and exactly four public,
lockstep packages:

| Package | Responsibility |
|---|---|
| `effect-build` | portable schemas, errors, correlated provider/target contracts, scalar/matrix orchestration, process and executable lifecycle, provider-author SPI |
| `effect-build-bun` | Bun discovery, target tokens, options, argv, diagnostics |
| `effect-build-deno` | Deno discovery, target tokens, options, argv, diagnostics |
| `effect-build-node-sea` | exact esbuild 0.28.2 bundle plus exact Node 26.7.0 direct SEA producer, assets, composed diagnostics |

Dependency direction is exact:

```text
effect-build-bun -------> effect-build
effect-build-deno ------> effect-build
effect-build-node-sea --> effect-build
```

Core imports no provider. Providers import no sibling. There is no registry,
fallback, raw argv, retry, automatic installation, postject, download, signing,
cache, receipt product, semantic/bound plan, or replaceable executor.

The root is private, pins `bun@1.3.14`, commits only `bun.lock`, and owns the
workspace graph. Package manager, orchestrator runtime, selected compiler, and
artifact target stay independent. Bun remains compiler-evidence pinned at its
separate tool version.

## Public operations and provider surfaces

The product retains exactly two operation names:

- scalar `compileExecutable`;
- homogeneous-provider `compileExecutableMatrix`.

Each provider package exports `Compiler`, `Target`, both operations, and
`layer`. Node SEA currently accepts only target `linux-x64-gnu`; its matrix is
therefore statically limited to one unique target cell. This uniformity is a
deliberate generic-consumer contract, not a claim of additional Node targets.

Node SEA scalar input uses the common entrypoint/outfile/cwd/target/digest
fields and exact provider options:

```ts
interface NodeSeaOptions {
  readonly format: "esm" | "cjs"
  readonly assets?: readonly { readonly key: string; readonly path: string }[]
}
```

Unknown fields, absent/invalid format, invalid assets, any target other than
`linux-x64-gnu`, and every Plan-018 alias/builtin/syntax/tool/host violation
remain rejected before publication. `layer({ executable? })` selects exact
Node 26.7.0; it never installs or downloads Node.

## One canonical Artifact hard cut

Version 0.3.0 replaces the singular `tool` representation. It does not add a
plural peer beside it:

```ts
interface Artifact {
  readonly path: string
  readonly bytes: number
  readonly digest?: `sha256:${string}`
  readonly provider: "bun" | "deno" | "node-sea"
  readonly target: TargetFor<typeof provider>
  readonly stages: readonly [ObservedStage, ...ObservedStage[]]
}
```

Correlated schema variants are exact:

- Bun: one `compile-executable` stage with observed Bun name/version/path;
- Deno: one `compile-executable` stage with observed Deno name/version/path;
- Node SEA: exact tuple `bundle` (esbuild 0.28.2) then
  `assemble-node-sea` (Node 26.7.0 and selected canonical path).

Stages report observed work only. They are not provenance, build receipts,
closed-input, hermeticity, reproducibility, attestation, or byte-stability
claims. Provider, target, and stage tuple are one correlated root schema and
one TypeScript union; no `tool`, `tools`, `PipelineExecutableArtifact`, or
provider-specific durable peer remains.

## Provider SPI

`effect-build/Provider.define` remains the only provider-author SPI and is
closed to `bun`, `deno`, and `node-sea`. Its definition is a discriminated
union of two genuinely different producer topologies:

1. `command`: Bun/Deno provide probe argv, target tokens, option validation,
   staged-output argv rendering, and diagnostic projection. Core owns tool
   discovery, scoped process execution, candidate lifecycle, validation,
   hashing, and rename.
2. `composed`: Node SEA provides exact acquisition and one scoped
   `produceCandidate` effect which writes only the core-owned staged path and
   returns its exact stage tuple. Core still owns candidate identity,
   output validation, digest, and rename.

Direct command adapters never see final outfile, cwd, digest, destination, or
candidate identity. The composed definition has a separate preflight boundary
which may observe the resolved destination only to preserve Plan 018's
source/tool/asset/scoped-directory disjointness proof; it receives no rename,
candidate identity, filesystem lifecycle, or raw process capability from core.
The union is closed data, not registration or fallback selection.

## Package-manager and packed-consumer contract

- Root `packageManager` is exact `bun@1.3.14` and `bun.lock` is authoritative.
- Workspaces are exactly `packages/*`, `examples/bun`, `examples/deno`, and
  `examples/node-sea`.
- Public package source dependencies use `workspace:^`; packed provider
  manifests contain concrete `effect-build: ^0.3.0`.
- Every package peers on `effect >=4.0.0-beta.104 <4.1.0-0` and development
  uses exact rc.108.
- `effect-build-node-sea` alone has exact runtime dependency
  `esbuild@0.28.2`.
- Packed consumers cover core and each provider through both npm and Bun
  installers, run under the supported Node orchestrator, and prove sibling
  absence and removed legacy subpaths.
- `effect-build/bun`, `effect-build/deno`, and every internal path cease to
  resolve in the same hard cut.

## Execution steps

1. Add red topology/SPI/Artifact/Node-provider/packed-manifest contracts.
2. Create the private Bun workspace and four exact manifests; generate and
   review `bun.lock` while retaining pnpm lock only as temporary rollback
   evidence.
3. Move the exact `4f26c02` portable source into core. Never take the donor
   branch's obsolete `AtomicOutput`, duplicate `CompilerRunner`, or older
   lifecycle implementation.
4. Extract Bun/Deno adapters and implement the closed command definition.
5. Move Esbuild/NodeSea into `effect-build-node-sea`, refactor the private
   final-publication operation into the composed candidate producer, and
   retain all Plan-017/018 scope, builtin, alias, target, and failure tests.
6. Hard-cut Artifact to provider plus stages and update all scalar/matrix type,
   schema, test, and packed-consumer assertions in the same source commit.
7. Convert examples, TypeScript references, Vitest/TSTyche/lint/format inputs,
   compatibility verifier, target verifier, CI, candidate workflow, and docs.
8. Run frozen install, deterministic, packed, Effect endpoints, real tools,
   12 Bun/Deno targets, exact Node SEA, and three-host publication gates.
9. Commit/push one reviewable implementation, require native exact-SHA CI,
   dispatch one non-mutating four-tarball candidate workflow, and record native
   run/artifact metadata without a proof-of-proof verifier.

## Verification

Local required gates:

```sh
bun install --frozen-lockfile
bun run verify
bun run verify:effect
bun run verify:real
bun run test:consumer
git diff --check
```

Linux exact-SHA CI additionally requires 12/12 Bun/Deno target cells and the
exact Node 26.7.0 SEA integration. Publication semantics remain required on
Ubuntu, macOS, and Windows. The manual candidate workflow is read-only and
emits exactly four tarballs plus one manifest from one pack operation.

## Done criteria

- [ ] Exact `4f26c02` is an ancestor and Plans 015-019 remain unmodified
      historical records except the index's successor notes.
- [ ] Bun 1.3.14 plus one `bun.lock` is the only operational package-manager
      authority; no operational pnpm path remains outside historical plans.
- [ ] Exactly four public packages at 0.3.0 have the dependency graph above.
- [ ] Core imports no provider; provider packages import no sibling/private
      core path; no lifecycle/process implementation is copied.
- [ ] Provider SPI is the exact closed command/composed union and exposes no
      lifecycle, rename, candidate, or raw process capability.
- [ ] Node SEA is a real packed public provider retaining exact Plan-017/018
      behavior and exact Linux/Node/esbuild pins.
- [ ] Artifact has only provider-correlated target plus the exact non-empty
      stage representation; singular `tool` and private durable peers are gone.
- [ ] Rejected Plan-019 inspectors, receipts, plans, executors, registries,
      cache, remote, fallback, signing, postject, and downloads remain absent.
- [ ] Eight isolated npm/Bun tarball consumers plus negative legacy/sibling
      checks pass with no workspace/source leakage.
- [ ] Both Effect endpoints, current real tools, every existing Bun/Deno target,
      exact Node SEA, and three-host publication gates remain required.
- [ ] Native CI and non-mutating candidate run are green at one exact SHA and
      candidate metadata contains four tarballs plus one manifest.
- [ ] `git diff --check` is silent and no sibling/user-owned work changed.

## STOP conditions

Stop rather than add a fallback if a package name is occupied, Bun lock
resolution changes the qualified Effect family, exact Node SEA behavior cannot
be retained across the package boundary, lifecycle must be copied/exposed to
publish Node SEA, a packed manifest leaks workspace/source/private paths, an
existing evidence axis would be skipped/weakened, or a focused correction
fails twice. ts-release absence does not stop this plan; it stops Plan 021's
activation only.


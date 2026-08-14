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
- **Completion state**: `DONE` for implementation SHA
  `7058cf2a29b1f3aaceaa7d32ade6cb5e9d625ba7`
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
   returns its exact stage tuple. Core supplies the sole bounded command
   executor and still owns child scope, output collection, candidate identity,
   output validation, digest, and rename.

Direct command adapters never see final outfile, cwd, digest, destination, or
candidate identity. The composed definition has a separate preflight boundary
which may observe the resolved destination only to preserve Plan 018's
source/tool/asset/scoped-directory disjointness proof; it receives no rename,
candidate identity, filesystem lifecycle, raw process service, or process
handle from core. The bounded executor is core-owned and non-replaceable; the
union is closed data, not registration or fallback selection.

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

### Local implementation receipt (2026-08-13)

- Bun 1.3.14 `install --frozen-lockfile` reported 113 checked installs and no
  changes; `pnpm-lock.yaml` and every operational pnpm invocation were removed.
- `bun run verify` passed 150 unit tests with the existing single platform
  skip, 40 architecture tests, both TSTyche files with 18 matched
  suppressions, eight isolated npm/Bun packed consumers, lint, and formatting.
- Exact endpoint copies passed the same build, check, TSTyche, 150-unit/one-skip,
  and eight-consumer gates under Effect 4.0.0-beta.104 and 4.0.0-rc.108.
- `EFFECT_BUILD_DENO_VERSION=2.9.5 bun run verify:real` passed all six current
  Bun/Deno integration tests and the Node orchestrator smoke test;
  `bun run test:host:extra` also passed the Bun and Deno orchestrator smokes.
- The cold review found and closed four reconciliation regressions before the
  source commit: Node SEA no longer copies scoped process execution, selected
  Node bytes are again characterized as exact ELF64/x64/GNU, composed stage
  tuples are decoded before publication, and the two lost invalid/wrong-target
  publication cases are restored at the core boundary.
- Local candidate directory `/private/tmp/effect-build-020-candidate.8rCZRR`
  contains exactly four 0.3.0 tarballs plus one manifest. Its manifest records
  core SHA-256 `b68f3727f6a6cf1eeb70e20e92629df8394144e4728a8e2bc2e2764b45bd04b5`,
  Bun `12b274131da8a180e58ae03e0cdeb61934ff636a94b56eb066f9708c140d5f25`,
  Deno `b31238271b04fccab26a34010f0443c15e09f47c5463b9cc2f9f1210f14eb54c`,
  and Node SEA `ec063ad2eb86b4d3baec5a48e70ec2e97a2677998857ae39b6212cff3af0baae`,
  with every provider dependency rewritten to `effect-build: ^0.3.0` and Node
  SEA retaining exact `esbuild: 0.28.2`.
- The macOS host's exact Node 26.7.0 package was correctly rejected as Mach-O
  by the Linux-only provider before execution; exact positive Linux SEA and
  12-target evidence remain assigned to the required Ubuntu CI jobs.
- Exact Linux Node 26.7.0, 12-target, three-host, final-SHA CI, and uploaded
  candidate evidence are recorded below against the same implementation SHA.

Linux exact-SHA CI additionally requires 12/12 Bun/Deno target cells and the
exact Node 26.7.0 SEA integration. Publication semantics remain required on
Ubuntu, macOS, and Windows. The manual candidate workflow is read-only and
emits exactly four tarballs plus one manifest from one pack operation.

### Exact-source remote receipt (2026-08-13)

- Implementation SHA
  `7058cf2a29b1f3aaceaa7d32ade6cb5e9d625ba7` has exact completed CI run
  [31762785453](https://github.com/mannyc2/effect-build/actions/runs/31762785453).
  All ten required jobs passed: quality, real tools, both target-support cells,
  three publication hosts, exact Node 26.7.0 SEA, and both Effect endpoints.
- The read-only candidate workflow ran at the same exact SHA in
  [31762941814](https://github.com/mannyc2/effect-build/actions/runs/31762941814).
  Its exact-source guard, Node SEA job, deterministic verification, real tools,
  12-target verification, both Effect endpoints, eight packed consumers, and
  artifact upload all passed.
- Uploaded artifact `9205360023`, `effect-build-0.3.0-candidate`, is 75,327
  bytes with GitHub archive digest
  `sha256:97a4fbf16d08dc6f793c297f1cc3a7fa9ab8556301e2a636e9ce88858d2ea06b`.
  An independent download to
  `/private/tmp/effect-build-020-upload.G88R9N` contained exactly four tarballs
  plus `manifest.json`.
- Independently recomputed tarball SHA-256 values exactly match the manifest:
  core `b68f3727f6a6cf1eeb70e20e92629df8394144e4728a8e2bc2e2764b45bd04b5`,
  Bun `12b274131da8a180e58ae03e0cdeb61934ff636a94b56eb066f9708c140d5f25`,
  Deno `b31238271b04fccab26a34010f0443c15e09f47c5463b9cc2f9f1210f14eb54c`,
  and Node SEA
  `ec063ad2eb86b4d3baec5a48e70ec2e97a2677998857ae39b6212cff3af0baae`.
  The manifest SHA-256 is
  `17a76fbe065cabcd05372cce99404593dc030bed60c3a1f66692cb4f86bc61a5`.
- The workflow has only `contents: read`; no npm publication, Git tag, GitHub
  Release, trusted-publisher mutation, or release-byte repack occurred.

## Done criteria

- [x] Exact `4f26c02` is an ancestor and Plans 015-019 remain unmodified
      historical records except the index's successor notes.
- [x] Bun 1.3.14 plus one `bun.lock` is the only operational package-manager
      authority; no operational pnpm path remains outside historical plans.
- [x] Exactly four public packages at 0.3.0 have the dependency graph above.
- [x] Core imports no provider; provider packages import no sibling/private
      core path; no lifecycle/process implementation is copied.
- [x] Provider SPI is the exact closed command/composed union and exposes no
      lifecycle, rename, candidate, or raw process capability.
- [x] Node SEA is a real packed public provider retaining exact Plan-017/018
      behavior and exact Linux/Node/esbuild pins.
- [x] Artifact has only provider-correlated target plus the exact non-empty
      stage representation; singular `tool` and private durable peers are gone.
- [x] Rejected Plan-019 inspectors, receipts, plans, executors, registries,
      cache, remote, fallback, signing, postject, and downloads remain absent.
- [x] Eight isolated npm/Bun tarball consumers plus negative legacy/sibling
      checks pass with no workspace/source leakage.
- [x] Both Effect endpoints, current real tools, every existing Bun/Deno target,
      exact Node SEA, and three-host publication gates remain required.
- [x] Native CI and non-mutating candidate run are green at one exact SHA and
      candidate metadata contains four tarballs plus one manifest.
- [x] `git diff --check` is silent and no sibling/user-owned work changed.

## STOP conditions

Stop rather than add a fallback if a package name is occupied, Bun lock
resolution changes the qualified Effect family, exact Node SEA behavior cannot
be retained across the package boundary, lifecycle must be copied/exposed to
publish Node SEA, a packed manifest leaks workspace/source/private paths, an
existing evidence axis would be skipped/weakened, or a focused correction
fails twice. ts-release absence does not stop this plan; it stops Plan 021's
activation only.

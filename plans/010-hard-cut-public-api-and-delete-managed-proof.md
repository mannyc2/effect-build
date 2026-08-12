# Plan 010: Hard-cut the public API and delete the managed proof system

> **Deletion authorization (STOP)**: This plan is NOT authorized by Plans
> 007-009 completing. Before executing anything, verify that `plans/README.md`
> records a dated operator authorization — issued after the review §11
> vertical slice was green — for both (a) deleting the managed system and
> (b) the standalone-centric rewrite of the user-owned README/docs/examples
> (review gate 5, reopened by the operator-audited
> `FIRST-PRINCIPLES-REVIEW.md`). As of 2026-08-11 that authorization does not
> exist. If the recorded authorization is absent, STOP and report; do not
> treat this plan's position in the sequence as consent.
>
> **Executor instructions**: This is the one public cutover. Execute only after
> Plans 007-009 are `DONE`, including Plan 009's provisioned local equivalent
> of the required real-tool job, and only under the recorded authorization
> above. Preserve
> and reconcile the documented user WIP; do not restore it, commit it as-is, or
> overwrite it blindly. The repository must not finish with both managed and
> standalone APIs. Run every gate, then update Plans 010 and the superseded
> historical rows as specified. STOP rather than leaving aliases/fallbacks.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 007 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 008 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 009 \|.*\| DONE \|$' plans/README.md
> pnpm check
> pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
> pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
> git status --short
> ```

Expected: the standalone path is complete, including the provisioned local
real-tool gates. Verify the unchanged documentation/config files against
**Dirty-worktree baseline** below. `package.json` is expected to differ from its
planning checksum only by Plans 008/009's pinned platform dependencies and the
named standalone test scripts; inspect `git diff
15b6abb8c28db73b4e8aeb818755f6ffc3e05530 -- package.json` and stop for any
other unrecognized edit. Any other checksum mismatch is a STOP condition until
the new user WIP is read and this plan is reconciled.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/009-add-bun-deno-drivers-and-runtime-matrix.md`
- **Category**: migration / deletion / docs / tests / CI / DX
- **Planned at**: commit `15b6abb`, 2026-08-09

## Why this matters

The managed system is a functioning but incomplete prototype whose public
promises exceed its implementation (operator-verified in
`FIRST-PRINCIPLES-REVIEW.md`: the happy path through snapshot, execution,
content storage, and recording works on the pinned toolchain). It is not an
advanced form of the chosen product; it is a second product with its own
request, identity, store, artifact, outcome, record, driver, platform, and
publication concepts, and its distinctive machinery has no named consumer.
The honest justification for deletion is ownership, not vacuity: keeping it
would leave two canonical representations with no owner and preserve the
ceremony that prompted the redesign. “It was never real” is false and must
not be used as the rationale. Because deletion removes real working
machinery, it requires the recorded gate 5 authorization above rather than
following automatically from Plans 007-009. Because the package is private
and pre-release, the authorized migration is a hard cut: export the
standalone operation, delete the unowned managed machinery, and rewrite
verification and documentation around observable behavior rather than
“proof.”

## Final public contract

`package.json` exports exactly:

```json
{
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./bun": { "types": "./dist/Bun.d.ts", "import": "./dist/Bun.js" },
  "./deno": { "types": "./dist/Deno.d.ts", "import": "./dist/Deno.js" }
}
```

The first README example must compile as an installed consumer (shape B per
the gate decisions recorded 2026-08-11 in `plans/README.md`):

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import * as Bun from "effect-build/bun"

const artifact = await Effect.runPromise(
  Bun.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app"
  }).pipe(
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer)
  )
)
```

The application chooses the orchestrator implementation once at composition.
Importing `effect-build/bun` selects the **compiler**, not the runtime hosting
the Effect program.

The second example concurrently compiles distinct targets with normal Effect
composition and describes its default as fail-fast. Do not claim error
accumulation unless an explicit `Effect.validate*`/equivalent strategy is shown.

The one-sentence pitch is:

> `bun build --compile` / `deno compile`, except the result is a typed Artifact,
> failures are typed, interruption owns the child, and the destination is never
> a half-written executable.

Do not use “proof,” “attestation,” “input closure,” “execution proof,” or
“truthful terminal record” as product claims.

The root module has exactly three runtime keys:

- `Artifact`: namespace export from the standalone Artifact module;
- `BuildError`: namespace export containing the tagged errors and union schema;
- `Target`: namespace export from the standalone Target module.

The operation lives on the tool subpaths, not the root. The Bun and Deno
subpaths each have exactly `Compiler`, `compileExecutable`, and `layer` as
runtime keys. Their `Options`, `LayerOptions`, and
`CompileExecutableInput` instantiations remain type-only exports.
Architecture tests compare `Object.keys()` with these sorted allowlists.

## Current state to remove

- `src/index.ts:1-20` exports the managed model.
- `package.json:7-19` exposes `./bun/BunCli` and `./deno/DenoCli`.
- `tooling/public-api.json` freezes twenty namespaces and old driver keys.
- `src/Build.ts`, `BuildExecutor.ts`, `BuildContext.ts`, `BuildPlan.ts`,
  `BuildRequest.ts`, `BuildRecord.ts`, `BuildOutcome.ts`, `ContentStore.ts`,
  `Evidence.ts`, `Environment.ts`, `Toolchain.ts`, and their internal helpers
  own the abandoned workflow.
- `src/ExecutionPlatform.ts` is a Node-bound identity abstraction, not an Effect
  platform implementation.
- old Bun/Deno drivers impose exact versions and managed config/env flags.
- the existing conformance/integration/host/publication tests are shape checks,
  self-skips, or raw Node spawning rather than the selected contract.
- the dirty README/docs/examples currently expand the managed-proof design and
  therefore must be semantically replaced, while useful explanations/tests must
  be salvaged rather than discarded unseen.

## Dirty-worktree baseline

These user-owned files were dirty before planning. Their exact planning-time
SHA-256 values are:

| File | SHA-256 |
|---|---|
| `README.md` | `ecf01ab722de6389f6e1372ba73b76c3206db402594cbfae09845bdfb9d84ffa` |
| `docs/architecture.md` | `8afa6c462723bdf3b7faa520f463fcd0e2641b95d0b9af38e627a61e90d585ae` |
| `docs/roadmap.md` | `3e55abfd1d68d0779ab3ac62ee6225387f0650e0d699dd572a51ddeda6f552b7` |
| `dprint.json` | `431d10c6929d55199e6cd8c98273f87bc88d2e5c4851cc83a62cb3888a8debac` |
| `package.json` | `c11b442ee7aa5f0b1365272ef3159853d142e3d5c4e6366f67a77eba4d87afd0` before Plans 008/009's scoped dependency edits |
| `tsconfig.json` | `da491a81d4c21872ac8997e8b0afc4747b38007bc5a76d70a218e6feb84d9ec2` |
| `docs/README.md` | `f734a9597a271f20eb9ceb829b2e6e5e519bd9b438ddf3f901b52206b90e08c0` |
| `docs/api.md` | `d7a7eee44dc14022c62297ddf7534857834015c82afca18827b40d25dac47853` |
| `docs/concepts.md` | `26d528cb8da187fca72bfc6f6316df3886accc82e15fe7aca4e8b250c62f907c` |
| `docs/drivers.md` | `1ea224ccfc86a5e3b8993c2510a2f355a308595cc5caec44a46feb0dec050204` |
| `docs/errors.md` | `492873cf222f4c524f4b2bcc592eec114d2fdd0c6cc205f9119e929b824076d5` |
| `docs/getting-started.md` | `b4fd4e94d2f124598e058ec6a4ffd743957e3b39ea13214b758a89a4a84358ca` |
| `examples/README.md` | `bbfa0d5ee7b9ec0f0095719125d14498e4b3fbd91360bc350f80faa99f29223b` |
| `examples/bun-compile.ts` | `39f8ba18f2b792b99a50264b1dc4b8297a23ebe0f81da1e57f9b39fe7f1c355e` |
| `examples/deno-compile.ts` | `8440eff2ab22cd6f32fdcd2cc71107a4b7ba7c528a85f8202bc6f492857bf410` |

Before editing, read the full diff/content of each. Preserve useful prose about
the three axes, Effect composition, driver ownership, errors, and target facts,
but replace every managed API and proof claim. Do not create backup files in the
repository or stage the old WIP separately.

## Scope

### Retain as final implementation

- `src/standalone/**`
- `src/Bun.ts`
- `src/Deno.ts`
- the new standalone tests/fixtures/testkit from Plans 007-009

The standalone modules must own their small diagnostic and service-identifier
types. Do not retain the managed `src/Diagnostic.ts` or `src/Identifier.ts`.

### Rewrite

- `src/index.ts`
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `dprint.json`
- `AGENTS.md`
- `.github/workflows/ci.yml`
- `tooling/public-api.json`, `tooling/support-matrix.json`,
  `tooling/tool-pins.json`
- `scripts/read-tooling.mjs`, `scripts/test-built-consumer.mjs`,
  `scripts/verify-tool-assets.mjs`
- `test/architecture/*.test.ts`
- `test/consumer/*`
- `typetest/*`
- `README.md`
- `docs/README.md`, `docs/architecture.md`, `docs/api.md`,
  `docs/concepts.md`, `docs/drivers.md`, `docs/errors.md`,
  `docs/getting-started.md`, `docs/roadmap.md`
- `examples/README.md`, `examples/bun-compile.ts`,
  `examples/deno-compile.ts`
- `plans/README.md` status/history/index text

### Create

- `scripts/clean-dist.mjs`
- `test/architecture/docs-contract.test.ts`

### Delete

- `src/Artifact.ts`
- `src/Build.ts`
- `src/BuildContext.ts`
- `src/BuildDriver.ts`
- `src/BuildError.ts`
- `src/BuildExecutor.ts`
- `src/BuildOperation.ts`
- `src/BuildOutcome.ts`
- `src/BuildPlan.ts`
- `src/BuildRecord.ts`
- `src/BuildRequest.ts`
- `src/Compatibility.ts`
- `src/CompileExecutable.ts`
- `src/ContentStore.ts`
- `src/Diagnostic.ts`
- `src/Environment.ts`
- `src/Evidence.ts`
- `src/ExecutionPlatform.ts`
- `src/Identifier.ts`
- `src/Target.ts`
- `src/Toolchain.ts`
- `src/bun/**`
- `src/deno/**`
- managed-only files under `src/internal/`: `CanonicalJson.ts`,
  `DriverInvocation.ts`, `DurableFileCommit.ts`,
  `ExecutionEnvironmentHandle.ts`, `ExecutionToolchainHandle.ts`,
  `InvocationCapabilities.ts`, `ManagedDriverImplementation.ts`,
  `NativeExecutableFormat.ts`, `PreparedBuild.ts`, `ProcessExecutor.ts`,
  `Staging.ts`, `ToolchainProbe.ts`, `managedDriverDescriptor.ts`,
  `managedOperation.ts`, `managedRequest.ts`
- all old managed unit/model/conformance/integration/host tests and fake-driver
  testkit not reused by the standalone suites
- `scripts/generate-compatibility.mjs`
- `docs/compatibility.md` if it still describes managed descriptors/evidence

Do not delete Plans 001-006. They are a historical decision record and will be
marked superseded/rejected in the index.

## Git workflow

- Use a dedicated hard-cut commit after the standalone implementation commits.
- Use `git diff --no-renames` during review so deletions are not hidden as
  misleading renames.
- Suggested message: `refactor!: cut over to standalone compile API`.
- Do not add compatibility aliases, deprecation shims, or legacy exports.
- Do not push or open a PR without instruction.

## Steps

### Step 1: Make the new package surface red, then cut it over once

First rewrite type/API/consumer tests to the final imports and observe failure:

- root runtime keys exactly `Artifact`, `BuildError`, and `Target`;
- `effect-build/bun` runtime keys exactly `Compiler`, `compileExecutable`,
  `layer`;
- `effect-build/deno` the same;
- per-tool option positive/negative type assertions;
- removed imports `effect-build/bun/BunCli`, `effect-build/deno/DenoCli`, and
  managed namespaces must fail;
- an external packed/installed NodeNext consumer compiles the README example.

Then update `src/index.ts` and `package.json` exports in one change. Do not export
`src/standalone/internal/*`, `CompilerAdapter`, or a public driver registry.
Remove the Node-only `engines.node` claim unless package publication tooling has
a separately verified need for it.

Rewire `test:types` to actually invoke TSTyche; ordinary `tsc` remains `check`.
Use `--config tstyche.config.json` until this hard-cut step renames the file to
TSTyche 7's current `tstyche.json` default; after renaming, update every script
and remove the old filename in the same change.

Add `clean` using `scripts/clean-dist.mjs`. The script resolves only the
repository's exact `dist` child and removes it when present; absence is a
successful no-op, while a non-`dist` or out-of-repository target is refused.
Make `build` invoke `clean` before TypeScript so deleting managed source cannot
leave stale declarations or JS in the package.

**Verify**:

```sh
pnpm run clean
pnpm build
pnpm run test:types
pnpm run test:consumer
pnpm exec vitest run test/architecture/public-api.test.ts test/architecture/import-boundaries.test.ts
```

Expected: packed imports resolve only the three final export paths; positive
and negative type assertions pass; internal/old paths do not resolve.

### Step 2: Delete the managed implementation and its tests

Delete every path in the deletion list. Remove now-unused dependencies/scripts,
imports, tsconfig inclusions, fixture files, and tooling readers. Do not preserve
managed names as aliases around standalone types.

Keep one canon for each concept:

- one `Artifact`;
- one `Target`;
- one `BuildError` union;
- one compile operation;
- one Bun driver and one Deno driver;
- no serialized plan/request/outcome/record/store/materialization model.

Update architecture tests to require:

- no `node:*` imports anywhere under `src/`;
- all `effect/unstable/process` use confined to
  `src/standalone/internal/Process.ts` (and command type imports only in the
  private adapter/driver files if beta.106 requires them; enumerate exact
  allowed paths);
- no `Effect.runPromise` inside library source;
- no compiler-specific import from core standalone modules;
- final package export allowlist.

**Verify**:

```sh
pnpm check
rg -n 'ArtifactRef|ResolvedBuild|PreparedBuild|BuildContext|ContentStore|BuildRecord|BuildOutcome|materialize|ConfiguredObserved|execution proof' src test typetest scripts tooling package.json
rg -n 'from "node:' src
rg -n 'Effect\.runPromise' src
```

Expected: typecheck passes; all three searches return no matches.

### Step 3: Replace false-green verification with product behavior

Rewrite `package.json` scripts so `pnpm verify` is the deterministic full local
gate and includes:

- `check`;
- real TSTyche;
- standalone unit/contract tests;
- architecture/public API tests;
- build and packed consumer;
- lint and format check.

Keep a separate `verify:real` for tool-provisioned Bun/Deno integration and
the required Node host run. It aggregates Plan 009's `test:integration:real`
and `test:host:standalone` commands; the optional cross-target and extra-host
lanes stay separate and non-required (gate 3: advertise-equals-test). CI must
require the deterministic job, the provisioned real-tool current-host/Node-host
job, and a publication job for each OS the docs advertise; no
`continue-on-error`, silent skip, or environment-only “cross-driver proof”
remains.

Repurpose `tooling/support-matrix.json` to list observed orchestrator hosts,
compiler fixture versions, and publication hosts without evidence/provenance
lattice language. Keep `tool-pins.json` only as CI download checksums. Delete
descriptor-generated compatibility docs and their generator.

Windows publication CI must execute atomic replace and locked-output tests;
macOS/Linux must execute replace/failure/interruption cases. Cross-target tests
must inspect effect-build outputs.

**Verify**:

```sh
pnpm verify
node scripts/read-tooling.mjs
git diff --check
```

Expected: deterministic verification passes locally; tooling is internally
consistent. Run `pnpm verify:real` in the provisioned environment and require it
to pass before completion.

### Step 4: Rewrite repository guidance and docs from the operation outward

Update `AGENTS.md` so future executors enforce the new reality:

- one public `compileExecutable` operation;
- one explicitly selected driver, no registry/fallback/raw argv;
- orchestrator runtime, compiler, and artifact target are independent;
- shared lifecycle owns staging, scoped spawning, validation, hashing, atomic
  replace; drivers own discovery/probe, target mapping, argv, diagnostics;
- library source uses Effect platform-neutral services only;
- project config/environment follow CLI defaults unless a future explicit API
  is approved;
- interruption remains interruption;
- `pnpm verify` before handoff.

Rewrite the dirty documentation/examples after reading them fully. Required
content:

1. two-input first example with official host Layer composition;
2. typed Artifact and exhaustive `catchTags` error example;
3. concurrent distinct-target example described as fail-fast;
4. the three independent axes;
5. Bun and Deno option tables, visibly different;
6. PATH discovery and explicit Layer override;
7. atomic publication state table;
8. a short divergence register:
   - compilation writes to a sibling staged path before atomic rename, which may
     affect compilers that embed the requested output path;
   - interruption closes Scope and kills the compiler instead of leaving it;
9. no claim of byte identity, hermeticity, provenance, attestation, proof, or
   exact input closure;
10. `ts-release` is not named as a supported workflow or architectural owner.

Keep the docs small. Delete concepts pages that have no remaining concept rather
than filling them with historical material.

The final documentation file allowlist is exact:

- `docs/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/drivers.md`,
  and `docs/errors.md`;
- `examples/README.md`, `examples/bun-compile.ts`, and
  `examples/deno-compile.ts`.

Delete `docs/concepts.md`, `docs/getting-started.md`, and `docs/roadmap.md`
after reading them and moving any still-required sentence into the allowlisted
pages. `test/architecture/docs-contract.test.ts` must compare the actual docs
and examples paths to those allowlists, require items 1-10 above, and fail on
the prohibited terminology in `README.md`, final docs, final examples, or
`AGENTS.md`. Plans 001-010 are historical records and intentionally excluded.

Compile every example as part of consumer/type verification.

**Verify**:

```sh
rg -ni '\bproof\b|attestation|input closure|truthful terminal record|byte[- ]identical|hermetic|provenance|ConfiguredObserved|ResolvedBuild|materialize|ts-release' README.md docs examples AGENTS.md
pnpm exec vitest run test/architecture/docs-contract.test.ts
pnpm run test:consumer
pnpm run test:types
pnpm format:check
```

Expected: the search returns no matches; the exact docs manifest and required
content test pass; examples compile; formatting passes.

### Step 5: Reconcile the plan index and run final acceptance

In `plans/README.md`:

- mark Plan 001 `REJECTED: superseded by standalone hard cutover`;
- leave 002 and 003 `DONE` as historical implementation facts;
- mark 004-006 `REJECTED: managed release contract superseded`;
- mark 007-010 `DONE` only when their exact gates have passed;
- make Plans 007-010 the current execution history/north star;
- retain a short historical note explaining why the managed design was removed,
  not a live rejection of PATH/config/standalone behavior.

Run the complete acceptance:

```sh
pnpm verify
pnpm verify:real
pnpm run clean
pnpm build
npm pack --dry-run --json
rg -n 'bun/BunCli|deno/DenoCli|BuildExecutor|ResolvedBuild|ArtifactRef|ContentStore' dist package.json tooling test README.md docs examples AGENTS.md
git diff --check
git status --short
```

Expected: both verification lanes and npm's pack dry-run pass; stale-name search
returns no matches; status contains only intentional hard-cut changes and plan
status updates. No unrelated user work is lost.

## Test plan

- Final public runtime-key and package-subpath allowlists.
- Installed consumer compilation for README and both driver option types.
- Negative resolution for every removed managed import.
- Deterministic unit/type/architecture/build/lint/format gate.
- Required real Bun/Deno artifact execution and target validation.
- Same compiler call under Node/Bun/Deno official services.
- Atomic publication on Linux/macOS/Windows, including Windows locked output.
- Documentation examples compile.

## Done criteria

- [x] Exactly one operation and one Artifact/Target/error representation remain.
- [x] Package exports are exactly `.`, `./bun`, and `./deno`.
- [x] No managed compatibility alias or advanced tier remains.
- [x] No raw Node import or `Effect.runPromise` remains in library source.
- [x] `compileExecutable` methods capture platform dependencies in driver Layers
  and expose `R = never`; apps provide official host services once.
- [x] Public call fields are only entrypoint/outfile/cwd/target/digest and the
  tool module's typed options.
- [x] Docs contain no proof/attestation/input-closure framing or ts-release
  specialization.
- [x] `pnpm verify`, `pnpm verify:real`, consumer pack test, clean build, and
  `npm pack --dry-run --json` pass.
- [x] CI requires the deterministic job, the real-tool current-host/Node-host
  job, and publication jobs for each advertised OS; optional lanes remain
  non-required.
- [x] The exact docs/examples allowlist, required-content assertions, compiled
  examples, and zero-match prohibited-language test pass after every baseline
  file was read.
- [x] Plan index records the hard cut and Plan 010 is `DONE`.

## STOP conditions

Stop and report if:

- Plan 009's provisioned local offline, cross-target, and host-runtime gates
  have not passed;
- dirty WIP differs from the recorded baseline without operator confirmation;
- removing managed source would break a separately identified in-repo consumer
  outside the package's own obsolete tests/docs;
- final compilation requires a public legacy alias, dual Artifact/Target type,
  generic fallback, or raw argv;
- one official orchestrator host cannot satisfy the lifecycle contract;
- a supported host cannot implement atomic replace—do not claim it supported;
- the packed consumer cannot infer driver-specific options or host requirements;
- any final gate fails twice after a reasonable scoped repair.

## Maintenance notes

- This package is a correct Effect wrapper around compilers, not a verifier.
- A future cache/remote system may use Artifact.digest, but it does not justify
  reintroducing plans, stores, attestations, or proof language here.
- A future operation earns its own API only when it has a shared verb/result and
  driver-specific semantics; do not grow a generic build DAG preemptively.

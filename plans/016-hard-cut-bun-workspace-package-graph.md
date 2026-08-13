# Plan 016: Hard-cut effect-build into a Bun workspace with core and compiler packages

> **Executor instructions**: Read this plan completely before editing. This is
> a post-Plan-015 breaking refactor, not a package-manager-only rename. Add the
> topology and packed-package tests before moving source, then keep the tree
> green at each package boundary. Run every verification command and confirm
> its expected result. If a STOP condition occurs, stop and report instead of
> adding a compatibility facade, copying lifecycle code, or exposing existing
> private process modules.
>
> **Restamped qualification (verified 2026-08-13)**:
>
> ```sh
> git status --short
> rg '^\| 015 .*\| DONE' plans/README.md
> pnpm verify
> pnpm verify:effect
> npm view effect-build@0.3.0 version --json
> npm view effect-build-bun name version repository --json
> npm view effect-build-deno name version repository --json
> gh api repos/mannyc2/effect-build/git/ref/tags/v0.3.0
> ```
>
> Plan 015 is committed and `DONE` at `183528d`; its final product source is
> `5a4003fd704211baa9919cee52fc5386e3172b3c`, with the ordinary nine-job
> GitHub Actions run 31688719291 green at that exact SHA. `pnpm verify` and
> both clean Effect endpoint lanes pass again at this restamp. npm returns
> E404 for `effect-build@0.3.0`, `effect-build-bun`, and `effect-build-deno`,
> and GitHub returns 404 for tag and release `v0.3.0`. Those checks establish
> current absence only; they do not prove registry ownership. The published
> annotated but cryptographically unsigned `v0.2.0` tag remains fixed at
> `29f8cfb0d6fae0a3caa13562ee510d192ed09003`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/015-widen-effect-v4-compatibility.md`
- **Category**: architecture
- **Restamped baseline**: completed Plan-015 status commit
  `183528d79c45709d40133302b705ec59daf452d1`, 2026-08-13; final Plan-015
  product source `5a4003fd704211baa9919cee52fc5386e3172b3c`
- **Initial status**: IN PROGRESS — prerequisite, version/name availability, current
  manifests, verification lanes, and exact file inventory are reconciled
- **Public release boundary**: `effect-build@0.2.0` and annotated tag `v0.2.0`
  are public at `29f8cfb`; the next breaking lockstep version is `0.3.0`.
  Never reuse, move, or retag `v0.2.0`.

## Why this matters

The repository currently has one package whose `effect-build/bun` and
`effect-build/deno` entry points reach directly into the same package-private
engine. That layout makes the compiler boundary a convention rather than a
dependency direction. Plan 014 also intentionally makes the root `Artifact`
and `MatrixError` schemas reject invalid tool/target pairs. A package split must
preserve that behavior without importing either provider package.

The target mirrors the useful part of Effect v4's package graph: portable
contracts and shared lifecycle in a core package, with Bun- and Deno-specific
implementations in sibling packages that depend one way on core. It does **not**
copy Effect's package manager: the pinned Effect checkout uses pnpm. Bun is an
independent tooling decision here.

This plan pays for three packages by establishing one real invariant:

```text
effect-build-bun ──┐
                   ├──> effect-build
effect-build-deno ─┘

effect-build never imports either provider package
providers never import one another
```

The closed tool/target correlation is the deliberate exception to a fully
provider-agnostic core. Core owns the six Bun and six Deno canonical target
sets because its public wire schemas validate those pairs; provider packages
own probing, options, native target tokens, argv, and diagnostics. This
supersedes Plan 014's package-private *provider-owned target-set location* while
preserving its tested target sets and decoder behavior. It does not introduce a
registry: adding a compiler requires a coordinated core and provider release.

There is no legacy layer. Consumers replace `effect-build/bun` with
`effect-build-bun` and `effect-build/deno` with `effect-build-deno` in the same
release.

## Evidence standard

Compatibility is ordinary behavioral support, not a special attestation
product. Plan 016 therefore uses:

- direct type/unit tests and isolated packed consumers for API and peer claims;
- exact non-skipping CI cells for host, compiler, target, Effect endpoint, and
  atomic-publication claims;
- packed-manifest inspection for npm package-boundary claims; and
- one non-mutating candidate workflow because it creates the three candidate
  tarballs and manifest, not because it re-proves GitHub's own check state.

GitHub's exact `head_sha`, job conclusions, and artifacts are canonical.
No repository script mirrors those facts into a second evidence schema.

## Current state

### Authoritative live baseline

- Published `effect-build@0.2.0` and annotated tag `v0.2.0` resolve to
  `29f8cfb`. The tag has no cryptographic signature; no plan may describe it
  as signed.
- Plan 015 completed the peer interval `>=4.0.0-beta.104 <4.1.0-0`, exact
  development family `4.0.0-rc.108`, strict fresh consumers at beta.104 and
  rc.108, and required endpoint cells in both current workflows.
- Root `package.json` remains the single publishable `effect-build@0.2.0`
  package, pins `pnpm@10.17.1`, exposes `.`, `./bun`, and `./deno`, and routes
  normal gates through pnpm.
- The exact Plan-015 source run has nine green jobs: quality, real tools, two
  target shards, two Effect endpoint cells, and three publication hosts.
- `src/Bun.ts:3-9` and `src/Deno.ts:3-9` import provider adapters plus shared
  compiler, process, and discovery internals from the same package.
- In the committed Plan-014 tree, `src/standalone/Artifact.ts` and
  `src/standalone/MatrixError.ts` import both pure target tables to implement
  correlated root schemas. The data must move into core-owned closed contracts;
  imports from provider packages must not replace it.
- `scripts/test-built-consumer.mjs:12-28,102-125` packs the single root package,
  wires a temporary Node consumer, and freezes the three existing subpaths.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` install pnpm in
  every job. Release currently publishes one root package with npm provenance.
- `scripts/verify-target-support.mjs` has pnpm-specific executable discovery:
  it may run an absolute `npm_execpath` through Node or search `PATH` for
  `pnpm`. This must be rewritten, not string-replaced.

### Reference topology, translated rather than copied

The pinned Effect source at `.agent-sources/effect` uses a private root,
workspace packages, root TypeScript project references, one-way workspace
dependencies, package-local manifests, and package-local tests. Relevant
examples are:

- `.agent-sources/effect/tsconfig.packages.json:5-20` — root project graph;
- `.agent-sources/effect/packages/platform-bun/package.json:65-74` — provider
  depends on shared implementation and peers on `effect`;
- `.agent-sources/effect/packages/platform-bun/tsconfig.json:3-11` and the Deno
  equivalent — package-local source project and references; and
- `.agent-sources/effect/vitest.config.ts:89-158` — centrally coordinated
  package test projects.

Do not copy Effect's runtime gating. Its Bun platform package runs inside Bun;
this project's Bun package selects a compiler while the supported orchestrator
remains Node. Package manager, orchestrator runtime, compiler, and artifact
target remain four separate facts.

### Preliminary compression ledger

The pre-Plan-015 published baseline contains 1,841 production TypeScript lines,
4,325 test and type-test TypeScript lines, 860 script JavaScript lines, and 70
example TypeScript lines. Restamp the four categories after Plan 015 and report
them again in the final commit message or PR description.

| Dimension | Before this plan | Required result |
|---|---|---|
| package manager authority | `package.json` plus `pnpm-lock.yaml` | one root Bun pin plus one `bun.lock`; zero operational pnpm paths |
| published packages | one package with two provider subpaths | three lockstep packages with one-way provider-to-core edges |
| provider assembly | provider entry points manually import several internals | one typed first-party provider definition consumed by one core factory |
| tool/target authority | pure target tables live beside provider adapters and root schemas import them | one closed core correlation table derives root schemas and provider Target schemas; providers supply exact native-token maps |
| reverse dependencies | core imports provider-adjacent files inside one package | zero core imports from either provider package |
| compatibility paths | `.`, `./bun`, `./deno` | core `.` and `./Provider`; provider packages each expose only `.` |
| fallback paths | none | none |

This is semantic and structural boundary recovery, not a promised source-line
reduction. Report production, test, script, and generated lines separately; do
not call moved code deleted.

## Target package contract

Use these exact public package names and the live-qualified next breaking
lockstep version `0.3.0`:

| Directory | npm name | Responsibility |
|---|---|---|
| `packages/effect-build` | `effect-build` | portable schemas, closed tool/target correlations, errors, operation contracts, first-party provider factory, shared lifecycle |
| `packages/effect-build-bun` | `effect-build-bun` | Bun options, native-token map, probing, argv, diagnostics, compiler Layer |
| `packages/effect-build-deno` | `effect-build-deno` | Deno options, native-token map, probing, argv, diagnostics, compiler Layer |

`effect-build-bun` and `effect-build-deno` were absent from npm when this plan
was written. Recheck immediately before creating manifests and again before the
first release. Do not substitute a scoped name, borrow the `@effect` namespace,
or invent aliases if either name becomes unavailable.

### Public imports after the cut

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

const artifact = await Effect.runPromise(
  Bun.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
  }).pipe(
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

The exact runtime surfaces after Plan 014 and this cut are:

- `effect-build`: `Artifact`, `BuildError`, `MatrixError`, `Target`;
- `effect-build/Provider`: one provider-author factory named `define`;
- `effect-build-bun`: `Compiler`, `Target`, `compileExecutable`,
  `compileExecutableMatrix`, `layer`; and
- `effect-build-deno`: the same five provider-local keys.

Type-only exports may include the associated inputs, options, targets, and
specialized artifact/error types. No public path exposes `Process`,
`CompilerEngine`, `ToolDiscovery`, `AtomicOutput`, or a raw child-process
capability.

Every source manifest and packed manifest points public exports at built
`dist/**` JavaScript and declarations. Do not rely on an undocumented
`publishConfig.exports` rewrite. Root scripts build the TypeScript reference
graph in dependency order before any test or consumer resolves a sibling by
package name.

### The one supported first-party provider SPI

`effect-build/Provider.define` is the only new cross-package primitive and is a
public semver surface. It is closed to the two built-in names. Core contains one
private `ProviderContracts` value with exactly these correlations. The expanded
type below documents the emitted declaration; implementation derives
`ProviderTargets` from that value and must not hand-copy the union:

```ts
type ProviderTargets = {
  readonly bun:
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-x64-musl"
    | "linux-aarch64-gnu"
    | "windows-x64";
  readonly deno:
    | "macos-x64"
    | "macos-aarch64"
    | "linux-x64-gnu"
    | "linux-aarch64-gnu"
    | "windows-x64"
    | "windows-aarch64";
};
```

The root `Artifact` and `MatrixError` schemas and each returned provider
`Target` schema derive from that same value. A provider definition must supply
an exact `Record<TargetFor<Name>, string>` of non-empty native CLI tokens; its
key set cannot add or omit a target. Thus support correlation has one owner,
while compiler-native mapping stays in the compiler package.

The following declaration shape is normative. Namespace qualification may be
adapted only as required by the exact Effect declarations recorded in the
post-Plan-015 restamp; field names, variance, return surface, and
error/environment semantics are fixed:

```ts
export type ProviderName = keyof ProviderTargets;
export type TargetFor<Name extends ProviderName> = ProviderTargets[Name];

export interface LayerOptions {
  readonly executable?: string;
}

export type Validation<A> =
  | { readonly _tag: "Valid"; readonly value: A }
  | { readonly _tag: "Invalid"; readonly reason: string };

export interface CommandOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface CommandCompletion {
  readonly exitCode: number;
  readonly stdout: CommandOutput;
  readonly stderr: CommandOutput;
}

export interface Diagnostic {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
  readonly truncated: boolean;
}

export interface PreparedCompileInput<Validated, Target extends string> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly digest?: boolean;
  readonly options: Validated;
}

export interface CompilerService<
  Name extends ProviderName,
  Options,
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, TargetFor<Name>>,
  ) => Effect.Effect<ProviderArtifact<Name, TargetFor<Name>>, BuildError, never>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<TargetFor<Name>, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, TargetFor<Name>>[],
    MatrixErrorFor<Name, TargetFor<Name>>,
    never
  >;
}

export interface Definition<Self, Name extends ProviderName, Options, Validated> {
  readonly name: Name;
  readonly service: Context.Service<Self, CompilerService<Name, Options>>;
  readonly probeArgv: readonly string[];
  readonly defaultTarget?: TargetFor<Name>;
  readonly targetTokens: Readonly<Record<TargetFor<Name>, string>>;
  readonly validateOptions: (input: unknown) => Validation<Validated>;
  readonly renderArgv: (context: {
    readonly input: PreparedCompileInput<Validated, TargetFor<Name>>;
    readonly nativeTarget?: string;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (
    completion: CommandCompletion,
  ) => readonly Diagnostic[];
}

export interface Defined<Self, Name extends ProviderName, Options> {
  readonly Target: Schema.Literals<readonly [TargetFor<Name>, ...TargetFor<Name>[]]>;
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, TargetFor<Name>>,
  ) => Effect.Effect<ProviderArtifact<Name, TargetFor<Name>>, BuildError, Self>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<TargetFor<Name>, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact<Name, TargetFor<Name>>[],
    MatrixErrorFor<Name, TargetFor<Name>>,
    Self
  >;
  readonly layer: (options?: LayerOptions) => Layer.Layer<
    Self,
    ToolNotFound | ToolProbeFailed,
    ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
  >;
}

export declare const define: <Self, Name extends ProviderName, Options, Validated>(
  definition: Definition<Self, Name, Options, Validated>,
) => Defined<Self, Name, Options>;
```

`CompileExecutableInput`, `CompileExecutableMatrixInput`, `ProviderArtifact`,
`MatrixErrorFor`, and all error types are type-only exports from
`effect-build/Provider`; only `define` is a runtime export. `CommandCompletion`
is immutable bounded result data, not the private `ProcessCompletion` type or a
process capability. Core constructs tagged errors and owns discovery, staging,
native inspection, hashing, interruption, atomic replacement, and process
execution. The provider owns its `Context.Service` identity, probe argv,
validation, native tokens, argv, and diagnostic projection.

The probe argv must print the existing common JSON object
`{ path, version, hostOs }`; core owns its decoder and absolute-file validation.
At `define` time, core validates that `targetTokens` has exactly the closed
target keys and non-empty string values. Core turns an invalid options reason
into `InvalidDriverOptions` and a nonzero `CommandCompletion` plus the returned
diagnostics into `ToolFailed`, so providers cannot forge a mismatched tool name.

Each provider uses this exact assembly pattern:

```ts
export class Compiler extends Context.Service<
  Compiler,
  Provider.CompilerService<"bun", Options>
>()("effect-build-bun/Compiler") {}

const implementation = Provider.define({
  name: "bun",
  service: Compiler,
  probeArgv,
  targetTokens,
  validateOptions,
  renderArgv,
  interpretFailure,
});

export const Target = implementation.Target;
export const compileExecutable = implementation.compileExecutable;
export const compileExecutableMatrix = implementation.compileExecutableMatrix;
export const layer = implementation.layer;
```

The Deno service identifier is `effect-build-deno/Compiler`. No caller can
define a third provider name, register a provider at runtime, obtain an adapter,
or inject raw argv. Declaration tests freeze the full signature and prove an
unknown name, missing/extra token key, wrong service type, or leaked process
capability is a type error.

## Commands you will need

The current Mac has Bun 1.3.9, so do not use its bare `bun` for this migration.
In the executor shell, define an exact, non-global wrapper through npm's
official `bun@1.3.14` package:

```sh
pm_bun() { npm exec --yes --package=bun@1.3.14 -- bun "$@"; }
pm_bun --version
```

Expected: `1.3.14`. This does not upgrade the user's global Bun. CI uses the
full-SHA-pinned setup action and then the bare executable after verifying the
same version. Every `pm_bun` command below means that exact wrapper.

| Purpose | Command | Expected on success |
|---|---|---|
| Pre-cut deterministic baseline | `pnpm verify` | exit 0 before pnpm is removed |
| Install | `pm_bun install --frozen-lockfile` | exit 0; `bun.lock` unchanged |
| Typecheck | `pm_bun run check` | every project reference passes |
| Unit/type tests | `pm_bun run test:unit && pm_bun run test:types` | all package and contract tests pass |
| Build | `pm_bun run build` | all three package `dist/` trees are fresh |
| Packed consumers | `pm_bun run test:consumer` | isolated Bun and Node consumers pass using tarballs only |
| Architecture | `pm_bun run test:architecture` | topology, imports, workflows, docs, and manifests pass |
| Deterministic gate | `pm_bun run verify` | exit 0 |
| Current-host tools | `pm_bun run verify:real` | real Bun and Deno compiles plus Node-host smoke pass |
| All provider targets | `pm_bun run verify:targets` | all 12 Plan-013 cells pass on Linux x64 |
| Atomic publication | `pm_bun run test:publication` | passes on Ubuntu, macOS, and Windows CI |
| Diff hygiene | `git diff --check` | no output |

Package-manager Bun and compiler-under-test Bun are independent pins. Use Bun
`1.3.14` for the workspace because that is the selected package-manager
baseline. Preserve compiler Bun `1.3.9` in `tooling/tool-pins.json` until a
dedicated compiler-evidence change proves another version.

## Suggested executor toolkit

- Use the `recover-deterministic-architecture` skill, if available, to verify
  the provider factory eliminates reverse dependencies rather than relocating
  them.
- Use the `effect-ts` skill, if available, only against the exact locked Effect
  source recorded by completed Plan 015. Do not upgrade Effect during this
  plan.
- Bun workspace and pack behavior must match the current official documentation:
  <https://bun.com/docs/pm/workspaces> and
  <https://bun.com/docs/pm/cli/publish>.

## Scope

**In scope** (the only product/tooling areas this plan may modify):

- the exact create/move/modify/delete inventory below;
- Plan-014 files only as moves into their new owners, never semantic rewrites
  beyond the closed target-authority relocation described here; and
- `plans/README.md` plus this plan's final status and native GitHub run notes.

**Out of scope** (do not touch):

- any new compiler, build verb, target, option, fallback, registry, retry,
  cache, task graph, watcher, remote execution, signing, or release ledger;
- changing scalar/matrix behavior, error meaning, atomic publication,
  interruption, diagnostic bounds, target evidence, or supported hosts;
- migrating Vitest to `bun:test`; Bun is the package manager here, not a reason
  to combine a test-runner migration;
- upgrading Effect, TypeScript, compiler Bun/Deno, or GitHub runner versions;
- integrating `ts-release` or designing its future config (Plan 017 owns that);
- publishing, tagging, creating registry packages, or configuring npm trusted
  publishers; and
- changing historical Plans 001-014 except their status/dependency index text.

### Exact file inventory

This inventory is restamped against completed Plan 015 at `183528d`. It includes
Plan 015's compatibility verifier and current architecture suites. A new
in-scope production/test file or a missing listed file is drift and requires a
planning update; it is not permission for the executor to improvise.

**Create**:

- `.npmrc` with the single standard JSR scope registry required by
  `@effect/platform-deno`'s published `npm:@jsr/*` aliases; this is dependency
  resolution metadata, not a registry fallback;

- `bun.lock`, `tsconfig.packages.json`;
- `packages/effect-build/{package.json,tsconfig.json,README.md,LICENSE}`;
- `packages/effect-build/src/Provider.ts` and
  `packages/effect-build/src/internal/ProviderContracts.ts`;
- `packages/effect-build-bun/{package.json,tsconfig.json,README.md,LICENSE}` and
  `packages/effect-build-bun/src/{index.ts,Adapter.ts}`;
- `packages/effect-build-deno/{package.json,tsconfig.json,README.md,LICENSE}` and
  `packages/effect-build-deno/src/{index.ts,Adapter.ts}`;
- `examples/bun/{package.json,tsconfig.json}` and
  `examples/deno/{package.json,tsconfig.json}`;
- `test/architecture/workspace-topology.test.ts`,
  `test/architecture/provider-spi.test.ts`, and
  `typetest/provider-definition.tst.ts`.

**Move into `packages/effect-build/src/**` with history**:

- root `src/index.ts`;
- `src/standalone/{Artifact,BuildError,CompileExecutable,CompileExecutableMatrix,Driver,MatrixError,Target}.ts`;
- `src/standalone/internal/{AtomicOutput,CompilerEngine,NativeExecutable,Process,TargetCatalog,TargetTable,ToolDiscovery}.ts`; and
- the reusable type portions of `src/standalone/internal/CompilerAdapter.ts`,
  rewritten into the public type-only declarations and private implementation
  owned by `Provider.ts`.

**Move into provider packages with history**:

- `src/Bun.ts` and `src/standalone/internal/BunAdapter.ts` into
  `packages/effect-build-bun/src/{index,Adapter}.ts`;
- `src/Deno.ts` and `src/standalone/internal/DenoAdapter.ts` into
  `packages/effect-build-deno/src/{index,Adapter}.ts`;
- `examples/{bun-compile,bun-matrix}.ts` into `examples/bun/src/**`; and
- `examples/deno-compile.ts` into `examples/deno/src/**`.

**Delete only after replacement tests pass**:

- `src/standalone/internal/{BunTarget,DenoTarget,CompilerAdapter}.ts`, all
  remaining empty root `src/**` directories, and `pnpm-lock.yaml`.

**Modify in place**:

- root `package.json`, `.gitignore`, `tsconfig.json`, `tsconfig.build.json`,
  `tsconfig.examples.json`, `vitest.config.ts`, `tstyche.json`, `oxlint.json`,
  and `dprint.json`;
- `scripts/{clean-dist,read-tooling,test-built-consumer,verify-effect-compatibility,verify-target-support}.mjs`;
- `tooling/{public-api,support-matrix,tool-pins}.json`;
- `.github/workflows/{ci,release}.yml`;
- every existing file under `test/architecture/**`, `test/integration/**`,
  `test/host/**`, `test/unit/**`, and `test/testkit/**` only where imports,
  project selection, package paths, or workflow assertions change; fixtures do
  not move;
- `typetest/standalone-contract.tst.ts`;
- root `README.md`, `AGENTS.md`, `examples/README.md`, and
  `docs/{README,api,architecture,drivers,errors}.md`.

Do not create `bunfig.toml`, a catalog, another shared package, generated source
copies, a compatibility package, or a second consumer script. If a setting
cannot live in the root manifest/script/config files above, STOP and amend the
plan first.

## Git workflow

- Start only from the clean exact completed Plan-015 result of Plan 015; create
  `codex/016-bun-workspaces` if a separate branch is needed.
- Use conventional commits matching the repository, for example
  `refactor!: split compiler providers into Bun workspaces`.
- Commit topology tests before or with the structural move so no intermediate
  commit advertises untested packages.
- Push and workflow dispatch are authorized after their local gates. Plan 016
  still forbids npm publication, Git tagging, and GitHub Release creation.

## Steps

### Step 0: Record the completed prerequisite and restamp this plan

This restamp is based on clean status commit
`183528d79c45709d40133302b705ec59daf452d1`; Plan 015's product source is
`5a4003fd704211baa9919cee52fc5386e3172b3c`, and normal CI run 31688719291
is green at that exact source. The status commit changes only Plan 015 and the
plan index. The pre-cut `pnpm verify` and `pnpm verify:effect` gates pass.

Live checks on 2026-08-13 prove `0.3.0` is absent for the existing package and
`v0.3.0` is absent in Git tags/releases. Both provider names return npm E404.
The selected package-manager wrapper resolves exact Bun 1.3.14 while the
user's global Bun remains 1.3.9. `oven-sh/setup-bun@v2.2.0` resolves to the
full action SHA `0c5077e51419868618aeaa5fe8019c62421857d6`.

Plan-015 drift is incorporated: retain `verify:effect`,
`scripts/verify-effect-compatibility.mjs`, the bounded peer interval, exact
rc.108 development family, and both endpoint CI cells. The deleted custom
second-order workflow verifier stays deleted. The first Bun install exposed
that `@effect/platform-deno@4.0.0-rc.108` publishes `npm:@jsr/*` aliases;
without the standard `@jsr` scope registry Bun queried npmjs and failed 404.
The restamp therefore adds the minimal `.npmrc` scope mapping instead of
dropping Deno host evidence or inventing per-package overrides. Bun issue
#28959 also causes pnpm-lock migration to discard those explicit tarball URLs,
so the Bun lock is generated from the same manifests in a disposable copy with
only the legacy pnpm lock omitted; the source pnpm lock remains untouched until
the new frozen Bun install and package graph are green.

**Verify**: this plan contains no placeholder, no signed-tag claim, and no
custom proof-of-proof verifier; `git diff --check` passes; a cold review finds no
P0/P1 issue before source movement. The 2026-08-13 cold restamp review
closed the endpoint-verifier, exact-workspace, package-manager/runtime-axis,
candidate-pack-authority, and evidence-standard ambiguities.

### Step 1: Freeze the post-Plan-015 behavior and the new package graph

Before moving source, record the post-015 production/test/script line counts and
run every old deterministic gate. Add
`test/architecture/workspace-topology.test.ts` and change
`tooling/public-api.json` from a one-package subpath list to the canonical
three-package map described above. Add `provider-spi.test.ts` and
`typetest/provider-definition.tst.ts` to freeze the normative declaration,
closed target correlations, and negative cases before moving implementation.

The topology test must assert:

1. the root is private and pins `bun@1.3.14`;
2. workspace membership is exactly `packages/*`, `examples/bun`, and
   `examples/deno`;
3. the three public packages use the one exact restamped
   `0.3.0`;
4. both providers depend on `effect-build` through `workspace:^` in source;
5. core has no provider dependency, neither provider depends/peers on the
   other, and neither provider peers on core instead of declaring the required
   ordinary dependency;
6. public source/packed export maps match the exact surfaces above;
7. no package exports an `internal` path;
8. all three public packages use the same bounded Effect peer interval and the
   same exact rc.108 development reference;
9. old `effect-build/bun` and `effect-build/deno` paths are absent; and
10. package names, repository directories, license, files, side effects, and
    provenance metadata are complete.

The SPI tests must also assert that root `Artifact` and `MatrixError` accept all
12 evidence-backed tool/target pairs, reject every cross-provider-invalid pair,
and derive those checks plus both returned `Target` schemas from the one private
core `ProviderContracts` value. They must fail if a provider package contains a
second target-literal set or if core imports a provider path.

Query both selected provider coordinates read-only before freezing manifests:

```sh
npm view effect-build-bun name version repository --json
npm view effect-build-deno name version repository --json
```

Expected at planning time: each returns npm `E404`. Treat that as “coordinate
currently absent,” not proof of ownership or publication authority. Any package
metadata is a STOP condition requiring an operator naming decision and plan
revision; do not silently scope or alias either package.

Add an import-boundary rule before source moves: core cannot import a path
containing either provider package; a provider can import core public modules
but not core filesystem internals; providers cannot import each other.

**Verify**:

```sh
pnpm exec vitest run \
  test/architecture/workspace-topology.test.ts \
  test/architecture/provider-spi.test.ts \
  test/architecture/import-boundaries.test.ts
pnpm test:types
```

Expected before implementation: the new topology assertions fail for the named
missing manifests/paths, while the old behavior gates remain green. Commit this
red contract only together with the first green topology commit if repository
policy forbids red commits.

### Step 2: Establish one private Bun workspace and one lockfile

Replace the publishable root manifest with a private orchestration manifest:

```json
{
  "name": "effect-build-workspace",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.14",
  "workspaces": ["packages/*", "examples/bun", "examples/deno"]
}
```

Root owns only repository orchestration and shared development tools. Each
public package owns its own name, version, exports, files, repository directory,
peer/dependencies, and build script. Every public package retains Plan 015's
exact bounded `effect` peer interval; only the root/package development Effect
and platform references use Plan 015's exact locked reference version. Catalogs
are forbidden in this plan.

Preserve the clean forced-build invariant that prevents stale TypeScript
incremental output: root `build` runs the updated `clean-dist.mjs` and then
`tsc -b tsconfig.packages.json --force`. Package-local `build` scripts may
target their own composite project, but the release/consumer/verify paths all
use the root dependency-ordered forced build first.

Create all three final manifests and TypeScript references before generating
`bun.lock`. Retain `pnpm-lock.yaml` as the reviewed pre-cut baseline while Steps
3-5 make the Bun workspace green; do not run pnpm again after the root manifest
declares Bun. Review the migrated Effect/platform peer graph rather than
accepting lockfile churn blindly. Use a disposable clone or temporary copy for
the clean-install proof; do not delete the user's existing `node_modules`.

The first green boundary is core-only: after Step 3,
`pm_bun run --filter effect-build build` and the core projects pass. The second
is all packages after Step 4. Only after Step 6 passes the full deterministic
and isolated tarball gates may the executor delete `pnpm-lock.yaml` and the pnpm
store ignore, then rerun a frozen install and the full gate. This keeps a
reviewable rollback artifact until Bun has proven functional equivalence.

**Verify**:

```sh
pm_bun --version
pm_bun install
pm_bun install --frozen-lockfile
test -f bun.lock
test -f pnpm-lock.yaml
git diff --check
```

Expected: Bun prints `1.3.14`; the first install creates the reviewed text
`bun.lock`; the frozen reinstall exits 0 without changing it; the reviewed pnpm
rollback lock is still present; peer resolution still uses Plan 015's bounded
Effect interval with its exact locked reference version;
diff check is silent. Its deletion is Step 6's final hard cut, not an early
package-manager half-state.

### Step 3: Move portable lifecycle into `effect-build` and define the one SPI

Move portable schemas, shared scalar/matrix contracts, native inspection,
process lifecycle, discovery, staging, hashing, and atomic publication into
`packages/effect-build/src`. Preserve `.js` relative imports and the existing
Effect platform-neutral service boundary.

Create `packages/effect-build/src/Provider.ts` and implement the exact `define`
factory contract above. It must close over private lifecycle functions and
return a typed provider surface; it must not return raw adapters, process
services, or mutation hooks. Create the single private `ProviderContracts`
value in core and derive root `Artifact`, root `MatrixError`, and both
provider-returned `Target` schemas from it. Delete the provider-adjacent target
tables only after parity tests prove all 12 accepted pairs and all invalid
cross-pairs are unchanged.

Core source must contain no provider name in an import specifier. Provider names
remain as closed `ToolName`/`ProviderContracts` data and in tests/docs; this is
not a dynamic provider registry. Core must not own native CLI tokens.

Keep the existing root test ownership and add focused tests for the Provider
factory. Preserve scalar lifecycle, matrix orchestration, interruption,
publication, process bounds, and native inspection assertions without pinning
deleted file paths.

**Verify**:

```sh
pm_bun run --filter effect-build build
pm_bun run --filter effect-build check
pm_bun run test:unit -- --project effect-build
pm_bun run test:architecture
```

Expected: core typechecks and its tests pass; architecture tests prove zero
core-to-provider imports, one closed correlation value, exact `define`
declarations, and no exported process/lifecycle capability.

### Step 4: Extract Bun and Deno into independent provider packages

Move each provider's options, permissions (Deno), native-token mapping, probe,
validation, argv, diagnostics, service identity, and public functions into its
own package. Each provider calls `Provider.define` exactly once and receives its
`Target` schema from core. Delete the old `src/Bun.ts`, `src/Deno.ts`, provider
adapters, and provider target files after the new package tests pass.

Provider manifests must:

- use the exact restamped `0.3.0`;
- depend on `effect-build` as `workspace:^`;
- peer on the exact bounded Effect interval recorded by Plan 015 and use its
  exact reference Effect version as a development dependency;
- expose only `.`, with both source and packed export maps pointing at built
  JavaScript and declarations under `dist/**`;
- publish only their own dist, README, LICENSE, and package metadata.

The core source manifest follows the same built-output rule for `.` and
`./Provider`. Package-to-package imports always resolve those public exports;
only tests of a package's private implementation may use owner-local relative
source imports.

Retain all Bun/Deno option and target type tests. Reuse the shared compiler
contract suite from repo-level `test/testkit`; do not copy it into both packages.

**Verify**:

```sh
pm_bun run build
pm_bun run --filter effect-build-bun check
pm_bun run --filter effect-build-deno check
pm_bun run test:unit
pm_bun run test:types
```

Expected: both packages typecheck independently; all shared/provider tests and
negative option/target assertions pass; no provider imports a sibling or a core
private file.

### Step 5: Make examples and repository tests real workspace consumers

Turn the Bun and Deno examples into named private workspaces under
`examples/bun` and `examples/deno`. Each declares only the public packages it
imports. Keep Node as the documented supported orchestrator and keep Bun/Deno
host smoke tests distinct from compiler selection.

Configure root TypeScript project references and Vitest projects for all three
source packages while preserving the existing root test/fixture/testkit
ownership. This plan mirrors Effect's package graph and central orchestration,
not its runtime-gated test placement. Update TSTyche, oxlint, and dprint globs
for `packages/**` and private examples. Do not add `bun:test` types or make
provider tests run only under their compiler's runtime.

**Verify**:

```sh
pm_bun run build
pm_bun run check
pm_bun run test:types
pm_bun run test:unit
pm_bun run lint
pm_bun run format:check
```

Expected: all commands exit 0; examples have no undeclared dependency or source
path import; runtime/compiler axes remain independent in test names and docs.

### Step 6: Replace the single-package consumer with tarball-only package tests

Rewrite the existing `scripts/test-built-consumer.mjs`; do not create a parallel
consumer script. It must:

1. build all public packages in dependency order;
2. run `bun pm pack` in each public workspace into a temporary directory;
3. inspect every packed `package.json` and reject `workspace:`, `catalog:`,
   `file:`, absolute paths, source exports, missing declarations, or undeclared
   runtime dependencies;
4. create six isolated positive fixtures: core-only, core+Bun provider, and
   core+Deno provider installed once with npm and once with Bun; execute all six
   with Node so this varies package manager without silently widening runtime
   support; give each fixture its own install directory/cache and never install
   both providers in one positive fixture;
5. typecheck the README/examples under NodeNext;
6. run the scalar and matrix public imports under Node with fake/no-dispatch
   layers where appropriate;
7. assert the old `effect-build/bun`, `effect-build/deno`, and every internal
   path fail to resolve; and
8. install the core tarball and selected provider tarball in the same
   transaction, resolve exactly that core at `0.3.0`, and prove
   the other provider is absent. Do not require unpublished
   `effect-build@0.3.0` from the
   public registry.

Because Bun 1.3.14 resolves a packed provider's rewritten `^0.3.0` edge from
the registry even when the matching unpublished core tarball is also a root
file dependency, each Bun provider fixture may use a root-only standard
`overrides.effect-build` pointing at that same core tarball. This override is
disposable prepublication test scaffolding: it is absent from every source and
packed public manifest, and the fixture must still assert the installed core is
exactly 0.3.0. npm fixtures require no override.

Endpoint fixtures also pin the transitive `@effect/platform-node-shared`
package to the selected exact Effect endpoint through a disposable root
override. This is required because the published beta.104 platform-node
dependency is `^4.0.0-beta.104`, which npm otherwise resolves to rc.108 and
then correctly rejects against beta.104 under strict peers. The override is
absent from every public manifest and preserves, rather than relaxes, exact
endpoint-family testing.

The compatibility verifier places that override in the disposable copied root
before its Bun install, so the installed workspace and all consumers observe
the same endpoint. It does not add the override to the checked-in root or any
published package.

The packed provider manifests must rewrite `workspace:^` to
`^0.3.0`. Capture
tarball paths structurally; do not parse incidental progress prose.

**Verify**:

```sh
pm_bun run build
pm_bun run test:consumer
test ! -e pnpm-lock.yaml
pm_bun install --frozen-lockfile
pm_bun run verify
```

Expected: three tarballs are built and inspected; all six isolated Node
fixtures across the npm/Bun package-manager axis plus negative resolution
checks pass; no workspace/source leakage or
legacy path resolves. Delete `pnpm-lock.yaml` with the executor's ordinary file
editing mechanism only after those checks; then the frozen Bun
reinstall is unchanged, and the full deterministic gate remains green. If that
last gate fails, fix the Bun cut before committing; do not add a
dual-package-manager fallback.

### Step 7: Cut CI and release verification from pnpm to pinned Bun

In every CI and release-candidate job, retain `actions/setup-node` because Node
is still the supported orchestrator and the isolated npm consumer remains a
required package-boundary check.
Replace pnpm setup/install with a full-SHA-pinned `oven-sh/setup-bun` step for
package-manager Bun 1.3.14 and `bun install --frozen-lockfile`. Use
`oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`;
the architecture test freezes both SHA and version input.

Rewrite `verify-effect-compatibility.mjs` so each endpoint copy preserves every
public package's bounded peer interval, rewrites only exact development Effect/
platform references across root, package, and example manifests, installs with
the selected Bun 1.3.14 executable, builds the clean declaration graph, and
runs check, type, unit, and strict
tarball-consumer gates. Invalid endpoints must still fail before temp creation
or network access.

Rewrite `verify-target-support.mjs` to locate/invoke Bun as an executable. Do not
pass the Bun binary to Node as if it were pnpm's JavaScript `npm_execpath`.
When absolute `npm_execpath` is present, verify it is executable and invoke it
directly; otherwise search absolute `PATH` entries for `bun`/`bun.exe`. Probe
that executable and require version 1.3.14, then launch each cell with
`["run", "test:integration:target"]`.
Preserve its Linux-x64 host refusal, two provider shards, 12-cell accumulation,
provisioned compiler paths, cache isolation, and cleanup.

Keep the normal CI's nine required, no-skip cells: deterministic quality;
current-host real tools; Bun and Deno target-support shards; beta.104 and
rc.108 Effect compatibility; and atomic publication on Ubuntu, macOS, and
Windows.

Hard-disable the obsolete tag-triggered publisher. Replace
`.github/workflows/release.yml` with a manually dispatched, **non-mutating**
`Release candidate` workflow that has only `contents: read`. Its one Linux job
checks the requested exact commit, runs deterministic/real/target/Effect gates,
builds once, calls the shared `test-built-consumer.mjs` candidate mode to pack
core then Bun then Deno and validate the packed dependency graph, and uploads
the three tarballs plus a machine-readable manifest. The script, not workflow
prose, remains the one pack/manifest implementation.
Cross-platform publication semantics remain the normal CI matrix's job at the
same SHA; the candidate job is justified by the bytes it creates. It contains
no `npm publish`, `bun publish`, `id-token: write`, `packages: write`, tag or
GitHub Release creation, or registry credential. A tag push must not trigger it.

This is the exact terminal release state for Plan 016. It proves candidate
bytes and package order without pretending three npm mutations are atomic.
Plan 017 may replace it only after its external qualification and activation
gates. If ts-release 0.2.0 is unsuitable, a different separately approved
publication plan is required; do not reactivate the old single-package loop.

**Verify**:

```sh
pm_bun run test:architecture
pm_bun run verify
rg -n 'pnpm|pnpm-lock|pnpm/action-setup' package.json bun.lock AGENTS.md README.md docs examples scripts tooling test .github \
  --glob '!plans/**'
rg -n 'npm publish|bun publish|id-token: write|packages: write|NPM_TOKEN|^ *push:' .github/workflows/release.yml
```

Expected: architecture and deterministic gates exit 0; the search returns no
operational pnpm reference outside historical plans. Any prose comparison to
the pinned Effect source must say that Effect itself uses pnpm. The second
search is empty: Plan 016 leaves no latent publication authority.

### Step 8: Rewrite public docs and execution rules for the hard cut

Update root and package READMEs, API/architecture/compiler docs, examples, and
`AGENTS.md` together:

- install `effect-build` plus exactly one provider package;
- import the compiler from `effect-build-bun` or `effect-build-deno`;
- explain the portable core/provider dependency direction;
- retain one selected compiler, no registry/fallback/raw argv/retry/automatic
  install;
- retain Node as supported orchestrator and keep artifact target independent;
- name `effect-build/Provider` as a narrow provider-author SPI, not an ordinary
  build call; and
- replace the handoff command with `bun run verify`.

The docs contract test must compile every code block that represents a consumer
and reject the old import strings outside historical plans/migration notes.

**Verify**:

```sh
pm_bun run test:consumer
pm_bun run test:architecture
rg -n 'effect-build/(bun|deno)|pnpm (add|run|install|verify)' README.md AGENTS.md docs examples packages
```

Expected: consumer and architecture tests pass; the search returns no old
instructions. A migration note may quote removed paths only when the docs test
explicitly allows that file.

### Step 9: Run every release gate without publishing

Run local deterministic, real/current-host, packed-consumer, and applicable
target gates. Commit and push the implementation. Require the normal CI run at
that exact implementation SHA to finish with all nine cells green.

Then dispatch `release.yml` against the implementation branch with required
input `commit` equal to the exact 40-character remote branch SHA. The workflow
must reject any `github.sha`/input mismatch before build or pack, check out the
input SHA, and emit exactly three inspected tarballs plus one JSON manifest.
Observe the run with GitHub's native run metadata and artifact listing. Do not
add a repository proof-of-proof parser.

Record both run URLs and the common source SHA as ordinary audit notes:

```text
Workspace CI: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha>
Workspace candidate: https://github.com/<owner>/<repo>/actions/runs/<id> @ <sha>
```

Recheck the three npm coordinates read-only. A 404 remains absence, not proof
of ownership. Record final moved/added/deleted line counts and the public
dependency graph. Do not publish, tag, or create a release in Plan 016.

**Verify**:

```sh
bun run verify
bun run verify:real
bun run verify:targets
bun run test:consumer
git diff --check
git status --short
gh run view <ci-run-id> --json headSha,conclusion,jobs,url
gh run view <candidate-run-id> --json headSha,conclusion,jobs,url
gh api repos/mannyc2/effect-build/actions/runs/<candidate-run-id>/artifacts
```

Expected: local gates pass; normal CI and candidate runs are successful at the
same exact source SHA; the candidate artifact contains the three tarballs and
manifest; no custom proof-of-proof layer exists.
## Test plan

- Add `test/architecture/workspace-topology.test.ts` for exact workspace names,
  versions, dependency direction, exports, metadata, lockfile, and no pnpm.
- Add `test/architecture/provider-spi.test.ts` and
  `typetest/provider-definition.tst.ts` for the exact closed `define` ABI, the
  one core correlation table, 12 valid pairs, invalid cross-pairs, exact token
  key sets, and negative third-provider/capability cases.
- Extend import-boundary tests with core→provider, provider→provider, and
  provider→core-private negative probes.
- Move existing core/provider tests adjacent without changing behavior
  assertions; keep one shared provider contract suite.
- Extend type tests for provider-correlated scalar/matrix inputs, artifacts, and
  errors through the new package names.
- Replace the packed-consumer fixture with six isolated Node cases: core only,
  core+Bun, and core+Deno installed independently by npm and Bun.
- Add negative packed-manifest fixtures for leaked `workspace:`, source paths,
  undeclared dependencies, and old subpath resolution.
- Update generated/CI tests to require full-SHA setup-bun actions, frozen Bun
  installs, both exact Effect endpoints, all old lanes, no escape conditions,
  dependency-ordered packs, and
  a manual read-only release-candidate workflow with no mutation authority.
- Preserve real compiler/header target evidence, Node-host smoke, and
  cross-platform atomic-publication tests unchanged in meaning.

## Done criteria

All must hold:

- [ ] Plan 015 was complete and green at its exact source SHA before the
      migration began.
- [ ] The private root pins Bun 1.3.14 and has exactly the intended workspaces.
- [ ] `bun.lock` is the sole package-manager lockfile; no operational pnpm path
      remains outside historical plans.
- [ ] Public packages are exactly `effect-build`, `effect-build-bun`, and
      `effect-build-deno`, all at the exact restamped topology version.
- [ ] Providers depend one way on core; core imports no provider and providers
      do not import each other.
- [ ] One private core contract is the sole six-Bun/six-Deno target-set
      authority; providers alone own native-token maps with exact keys.
- [ ] `effect-build/Provider.define` is the only supported cross-package SPI and
      matches the frozen declaration while exposing no process/lifecycle
      capability.
- [ ] Old `effect-build/bun` and `effect-build/deno` paths do not resolve and no
      compatibility package/facade exists.
- [ ] Three packed manifests contain concrete semver, built exports, complete
      metadata, and no workspace/source leakage.
- [ ] Six isolated Node consumers across npm and Bun installers use tarballs
      only, typecheck, run, and never mask a sibling/undeclared dependency.
- [ ] `bun run verify`, provisioned `bun run verify:real`, Linux-x64
      `bun run verify:targets`, and three-host publication tests pass.
- [ ] CI retains every required no-skip lane and is green on the exact commit.
- [ ] `release.yml` is manual and non-mutating, produces the three candidate
      tarballs/manifest, and contains no tag trigger or publication permission.
- [ ] Package-manager Bun and compiler Bun pins remain independent.
- [ ] Docs and AGENTS describe the new packages and preserve the three build
      axes without claiming Effect uses Bun workspaces.
- [ ] The final compression ledger separates moved, added, and deleted code.
- [ ] `git diff --check` is silent and no unrelated/user-owned files changed.
- [ ] Native GitHub run metadata shows normal CI and candidate runs green at
      the same exact implementation SHA, with all required candidate artifacts.
- [ ] Plan 016's row in `plans/README.md` is `DONE` only after all gates pass.

## STOP conditions

Stop and report; do not improvise if:

- Plan 015 is not committed/green at its exact source SHA, the post-Plan-015
  plan restamp/cold review is absent, or Plan 013 target evidence was
  weakened/invalidated by later code;
- the worktree has unexplained concurrent changes or the active branch is not a
  descendant of the exact post-Plan-015 SHA recorded by the restamp;
- either selected provider package name is occupied at the read-only registry
  check; a 404 means only “currently absent” and never proves publishing
  authorization or trusted-publisher setup;
- the split would require core to import a provider or either provider to import
  another provider;
- preserving Plan 014's correlated root decoders would require a second target
  set, generated copy, reverse build dependency, or runtime registration rather
  than the one core `ProviderContracts` value;
- `Provider.define` cannot keep Process, ToolDiscovery, CompilerEngine,
  AtomicOutput, and raw capabilities private;
- a packed manifest contains `workspace:`, `catalog:`, `file:`, an absolute
  path, source export, or undeclared dependency;
- Bun lock migration changes the restamped Effect peer/reference tree
  unexpectedly or a frozen install fails on any required CI OS;
- converting target verification loses any of the 12 exact provider cells or
  tries to execute package-manager Bun through Node;
- the Plan-016 release workflow would retain any live mutation authority;
- the change requires a legacy subpath, fallback, dual package-manager path, or
  temporary shipped facade;
- a step's verification fails twice after one focused correction; or
- an out-of-scope feature/upgrade becomes necessary.

## Maintenance notes

- All three packages are one lockstep product for now. Do not introduce
  independent versions until a real consumer requires them and release tooling
  can prove dependency-safe partial publication.
- Adding another compiler requires a coordinated core correlation change, a new
  provider package, new real target evidence, and a lockstep release. The closed
  `Provider.define` contract deliberately does not support third-party names.
- Reviewers should scrutinize the core/provider import graph, packed manifests,
  and whether any lifecycle code was copied to avoid the SPI.
- Plan 017 owns release-coordinator qualification/adoption. Until a separately
  authorized activation completes, retain only Plan 016's non-mutating
  release-candidate workflow.

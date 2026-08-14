Program start SHA: `61d1c0c9f04c4a4254163d4f85ebf6248a67b9bf`

# Next-stage promotion evidence

Evaluated implementation SHA: `577ffa7016a7236edba26d82c549bdfc70fdce4f`

The program-start commit differs from the evaluated implementation only in the
Plan 018 receipt and status files. The required zero-diff command over
`package.json`, `pnpm-lock.yaml`, `src`, `test`, `scripts`, `tooling`, and both
workflows passed before this file was created. Workflow receipts below are
observations that named tests passed; they are not build receipts, closed-input
claims, or reproducibility evidence.

## Execution evidence

| Evidence | Host and tool observation | Result |
|---|---|---|
| Plan 019 entry `bun run verify` | local macOS 26.2, Darwin 25.2.0 arm64; Node `/opt/homebrew/bin/node` 24.14.1 | PASS: typecheck, TSTyche 1/1, unit 146 passed/1 platform skip, packed consumer, architecture 64/64, lint, format |
| Plan 019 close `bun run verify` | same local host after the five allowed documentary/test edits | PASS: unit 146 passed/1 platform skip, packed consumer, architecture 65/65, lint, format |
| `EFFECT_BUILD_DENO_VERSION=2.9.5 bun run verify:real` | Bun `/Users/cjpher/.bun/bin/bun` 1.3.9; Deno `/opt/homebrew/bin/deno` 2.9.5; official Node services | PASS: six real compiler integration tests and one Node-host smoke test |
| `pnpm verify:effect` | isolated fresh installs at both peer endpoints | PASS: Effect 4.0.0-beta.104 and 4.0.0-rc.108, 146 unit tests and fresh packed consumer at each endpoint |
| `bun run build && bun run test:architecture` | local Node 24.14.1 | PASS: exact built surface and 64 architecture tests |
| Plan 015 `effect-v1` receipt | [run 31632275191](https://github.com/mannyc2/effect-build/actions/runs/31632275191) at `5379cb36422911628d344c9cb38a31b094983815` | PASS: repository verifier accepted every required job |
| Plan 018 `node-sea-v1` receipt | [run 31754891708](https://github.com/mannyc2/effect-build/actions/runs/31754891708) at `577ffa7016a7236edba26d82c549bdfc70fdce4f` | PASS: all ten required jobs, including both Effect endpoints, real tools, both target providers, three publication hosts, quality, and Node SEA |
| Exact Node SEA producer | Ubuntu 24.04.4 x64; Node `/opt/hostedtoolcache/node/26.7.0/x64/bin/node`; ambient orchestrator restored to Node 24.14.1; esbuild 0.28.2 | PASS: four real tests covering capability/builtins, raw CJS+ESM+assets, malformed config, and the complete private pipeline |
| `pnpm verify:targets` | required provisioned Linux x64 cells represented by the exact `node-sea-v1` receipt | CI RECEIPT USED: Bun 6/6 and Deno 6/6 target jobs passed |
| Local exact Node SEA integration | local host is macOS arm64, not the approved Linux x64 producer lane | CI RECEIPT USED: no local PASS or SKIP claim |

The initial characterization run
[`31753557975`](https://github.com/mannyc2/effect-build/actions/runs/31753557975)
cleared Plan 018's implementation STOP. It is not used as final evidence; the
receipt uses the later complete-source run.

## File and symbol ownership map

| Concern | Direct compiler topology | Composed topology | Shared owner or consequence |
|---|---|---|---|
| Input | `CompilerEngine.makeCompilerService`, scalar target/options checks, and `preflightMatrix` | `Esbuild.decodeInput`; `NodeSea.decodeInput` and `prepareInput` | Inputs remain topology-specific; no universal request was added |
| Tool | Bun/Deno adapters, target tables, discovery, and probe | `makeEsbuildService`; `makeNodeSeaService` with exact Node metadata/help/native/builtin checks | No registry, fallback, or common tool descriptor |
| Execution | `runProcess` receives adapter-rendered argv | esbuild `context/rebuild`, then one `runProcess(node, ["--build-sea", config])` | CLI process mechanics are shared; producer protocols are not |
| Scope | scalar/matrix cell Scope owns candidate and child | esbuild continuation owns bundle; nested Node Scope owns config, candidate, and child | Scope cleanup is observed, not a static non-escape proof |
| Validation | `validateAndPublishExecutable` | the same `validateAndPublishExecutable` | Exactly one regular/executable/native/target/byte-count owner |
| Digest | `validateAndPublishExecutable` optional SHA-256 | the same operation | Exactly one digest implementation |
| Publication | `ExecutableLifecycle` candidate state and `fileSystem.rename` | the same candidate state and rename | Exactly one rename owner and one point of no return |
| Result | public provider-correlated singular-tool `Artifact` | private `PipelineExecutableArtifact` with an exact two-stage tuple | Results deliberately remain different; no peer public artifact |
| Matrix | homogeneous provider `preflightMatrix` plus ordered collect-all cells | none | Cardinality is not a producer abstraction |

`rg -l 'fileSystem\.rename' src/standalone/internal` returned only
`ExecutableLifecycle.ts`. `rg -l 'inspectNativeExecutableFile'
src/standalone/internal | sort` returned only `ExecutableLifecycle.ts` and
`NodeSea.ts`: the lifecycle defines/calls the inspector for produced output,
while Node SEA calls it only to select the producer binary.

The capability boundary is also compile-time checked:

- `test/unit/standalone-publication.test.ts:105` rejects candidate `commit` and
  `destination` access and tests forged, copied, double-used, and scope-closed
  identities before filesystem effects.
- `test/unit/standalone-contract.test.ts:55` proves adapters receive only
  entrypoint, target, validated options, and staged outfile—not final outfile,
  cwd, digest, or destination.
- `test/unit/esbuild-node-sea-pipeline.test.ts:297` proves bundle/config/
  candidate cleanup on typed, invalid, and wrong-target exits; lines 327, 347,
  and 379 prove durable success, child interruption cleanup, and post-rename
  point-of-no-return behavior.
- `test/unit/esbuild-bundle.test.ts` proves continuation-owned artifact identity,
  stale-handle rejection, and cancel-before-dispose cleanup.
- `test/integration/node-sea.test.ts` proves the real CJS/ESM/assets pipeline on
  exact Linux Node 26.7.0.

## Public surface diff

The following command passed with no diff:

```sh
git diff --exit-code e4257ccc84db70a6966c163700c9423659f9a4fc -- \
  src/index.ts src/Bun.ts src/Deno.ts tooling/public-api.json
```

The manifest remains exact:

| Public fact | Exact value |
|---|---|
| subpaths | `.`, `./bun`, `./deno` |
| root runtime keys | `Artifact`, `BuildError`, `MatrixError`, `Target` |
| provider runtime keys | `Compiler`, `Target`, `compileExecutable`, `compileExecutableMatrix`, `layer` |
| durable public result | provider-correlated `path`, `bytes`, optional `digest`, `target`, singular `tool` |

Built declarations contain only the three entrypoints and their existing
standalone dependencies. Architecture tests explicitly reject `Esbuild`,
`NodeSea`, `JavaScriptBundleArtifact`, `PipelineExecutableArtifact`,
`withJavaScriptBundle`, `createExecutable`, and `stages` from every built
entrypoint.

## Internal artifact and observation tables

| Representation | Retained fields | Lifetime and claim |
|---|---|---|
| `JavaScriptBundleArtifact` | `path`, `format`, `nodeSyntaxTarget`, sorted `observedExternalImports`, `stage` | WeakSet-recognized only during the continuation; records one observed esbuild operation |
| bundle stage | `operation: "bundle"`, tool name `esbuild`, version `0.28.2` | Observation only; esbuild metadata does not prove arbitrary-JavaScript closure |
| `PipelineExecutableArtifact` | `path`, `bytes`, optional `digest`, exact target, `stages` | Durable private result; no scoped intermediate path is retained |
| Node stage | `operation: "assemble-node-sea"`, tool name `node`, version `26.7.0`, canonical selected path | Observation of the selected physical producer, not a content-identified toolchain |
| public `Artifact` | `path`, `bytes`, optional `digest`, provider target, singular provider `tool` | Released one-stage Bun/Deno result; unchanged |

## Consumer inventory

An importing test, internal implementation, plan, or architectural desire is
not counted as an external consumer.

| Candidate | Named consumer and observable job | Verdict |
|---|---|---|
| inspection | none; only lifecycle publication and Node selection inspect native files | none; public inspection gate NOT MET |
| artifact | README/examples consume the existing singular Bun/Deno Artifact; no caller needs one durable type spanning direct and composed topologies | existing caller only; common artifact gate NOT MET |
| receipt | CI invokes `verify-workflow-receipt.mjs` to validate workflow status; no caller needs a durable build record | workflow evidence is not a build-receipt consumer; NOT MET |
| semantic plan | none; current callers intentionally rely on ambient cwd, project config, PATH, environment, and scoped paths | REJECTED now |
| bound plan | none; no portable plan exists to bind and no application imports such a value | REJECTED now |
| executor | none; both producers use the same local filesystem/process backend and no application needs backend substitution | REJECTED now |

Repository searches found internal/test/plan references for the proposed names,
but no public import, application module, example, or known external workflow
performing any of the six proposed jobs.

## Gate verdict summary

| Candidate | Verdict | Decisive evidence |
|---|---|---|
| Public file-level inspection/validation | NOT MET | shared internal owner is earned; no inspection-only consumer and no independent public ranged-I/O/error contract |
| Common public artifact/provenance | NOT MET | both pipelines are real, but their durable results intentionally differ and no external multi-topology consumer exists |
| Versioned build receipts | NOT MET | only workflow-status receipts exist; no durable-record consumer/schema/evolution suite |
| `SemanticPlan` | REJECTED | inputs and toolchain are not closed/content-identified; no second binder |
| `BoundExecutionPlan` | REJECTED | prerequisite semantic plan and two real bindings do not exist |
| Replaceable executors | REJECTED | Bun, Deno, esbuild, and Node all execute through one local backend; two producers are not two backends |

## Compression and cost ledger

Program-start line counts were measured with the Plan 019 commands before any
Plan 019 source/test/docs edit:

| Category | Program-start LOC | Plan 019 close LOC | Change from `e4257cc` to evaluated implementation | Interpretation |
|---|---:|---:|---:|---|
| production TypeScript | 2,994 | 2,994 | +1,401 / -248, net +1,153 | two real private producer capabilities were added while direct lifecycle duplication was removed |
| tests and fixtures | 7,730 total; 7,453 TypeScript | 7,746 total; 7,469 TypeScript | +3,238 / -50, net +3,188 | Plan 019 added only 16 architecture-test lines; implementation evidence remains separately measured |
| user docs/examples | 670 | 692 | +23 / -10, net +13 | Plan 019 added 22 truthful internal-boundary lines and no private example |
| plans/research | 15,968 before this packet | 16,250 | +4,002 / -5, net +3,997 | Plan 019 added 282 decision/evidence/index lines; plans remain reported separately from product code |
| scripts/manifests/workflows | 1,544 | 1,544 | +475 / -34, net +441 | compatibility, target, receipt, consumer, and mandatory CI evidence |

| Representation/workflow change | State-space consequence |
|---|---|
| removed `CompilerRunner` beside `CompilerService` | one compiler runtime representation and factory remains |
| removed `AtomicOutput.commit` and lifecycle fields from adapter input | adapters cannot publish or observe final destination/digest policy |
| added opaque `ExecutableCandidate` plus durable `ExecutableFile` | pre-publication authority and post-validation fact cannot be structurally interchanged |
| added continuation-owned bundle artifact | one consumer can use temporary JS without making the path durable/public |
| added exact selected Node state and exact two-stage private result | producer/version/target/builtin invalid states are rejected without widening public Artifact |
| did not add receipt, semantic/bound plan, registry, executor, cache, or public stage protocol | speculative representations and fallback/configuration state remain absent |

The code grew because the program proved a genuinely second producer topology;
the compression claim is about ownership and impossible states, not negative
line count.

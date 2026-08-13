# Plan 017: Build one continuation-owned esbuild JavaScript bundle artifact

> **Executor instructions**: Follow this plan step by step. This is internal
> feature growth, not a public bundle API. Implement one structured
> esbuild-library operation that creates exactly one temporary
> Node-targeted JavaScript file and
> runs its consumer before cleanup. Keep fixed constraints unconfigurable. The
> contract covers dependency edges observed by esbuild 0.28.2; it does **not**
> claim arbitrary JavaScript is closed or hermetic. Do not scan generated code,
> add a parser/plugin, or weaken that distinction silently.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 015 \|.*\| DONE' plans/README.md
> rg -q '^\| 016 \|.*\| DONE' plans/README.md
> git merge-base --is-ancestor e4257ccc84db70a6966c163700c9423659f9a4fc HEAD
> git diff --stat e4257cc..HEAD -- \
>   package.json pnpm-lock.yaml src/standalone test tooling/public-api.json
> git status --short
> test "$(bun pm view esbuild@0.28.2 version)" = "0.28.2"
> bun run check
> bun run test:unit
> bun run build && bun run test:architecture
> ```
>
> Expected: Plans 015-016 are `DONE`; their Effect rc.108 and lifecycle seams
> are present; exact esbuild 0.28.2 remains available; public exports are unchanged;
> all gates pass; and every dirty file is understood. The planning worktree had
> user-owned plan edits—never discard or broadly rewrite them. If the current
> esbuild version or structured-message behavior differs, STOP and re-audit.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/015-widen-effect-v4-compatibility.md` and
  `plans/016-compress-executable-lifecycle.md`
- **Category**: direction / feature / architecture / tests
- **Planned at**: commit `e4257cc`, 2026-08-13
- **Goal kind**: bounded feature growth testing a structured library API,
  context cleanup, and temporary lifetime; no public API

## Why this matters

Bun and Deno are both Effect-owned CLI-to-native producers. They cannot show
whether the internal architecture can compose a structured library API, a
temporary intermediate, and a different native producer without inventing a
universal adapter. Exact esbuild 0.28.2 itself uses an unref'd, process-global
native service subprocess; this plan does not mislabel it as in-process or
claim to own that service lifetime. It creates the first half of the topology.

Live Effect source corrects the original `bundleScoped -> artifact` hypothesis.
`Effect.scoped` removes the `Scope` requirement but returns `A` unchanged, so a
returned path-bearing artifact can escape after finalization. The smallest
honest operation is continuation-owned:

```ts
Esbuild.withJavaScriptBundle(input, (bundle) => use(bundle))
```

It runs the consumer inside the bundle's private dynamic Scope and removes the
temporary bytes on success, typed failure, defect, or interruption. TypeScript
still cannot stop a malicious callback from copying the path; this is dynamic
resource ownership, not a linear-type claim. No raw artifact-returning operation
is exported even package-privately.

## Fixed operation contract

```ts
withJavaScriptBundle<A, E, R>(
  {
    entrypoint,
    format: "esm" | "cjs",
    cwd?,
  },
  use: (bundle: JavaScriptBundleArtifact) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  EsbuildBundleError | E,
  Esbuild | Exclude<R, Scope.Scope>
>
```

`Esbuild` is one concrete package-private `Context.Service`, not a producer
protocol. A package-private exported
`makeEsbuildService(fileSystem, path, api)` factory owns the real
`withJavaScriptBundle` implementation; it is not re-exported by any package
entrypoint, and `api` is only the narrow exact
esbuild `version`/`context` library dependency. The default Layer imports exact
esbuild 0.28.2, rejects a non-equal `api.version`, obtains `FileSystem`/`Path`,
and calls that factory. Tests call the same factory with a controlled context
implementation, so they exercise product validation/finalization instead of
replacing the method under test. The Layer does not create a build context or
Scope eagerly. This earns a normal Effect runtime/test boundary without adding
`StructuredLibraryProducer`, registry, or a public adapter interface.

The default Layer type is exactly
`Layer.Layer<Esbuild, EsbuildVersionMismatch, FileSystem.FileSystem |
Path.Path>`. After it is provided, the operation has only the error/environment
shown above.

The esbuild package lazily starts a global native service subprocess. A build
context owns one build session, not that service process. On every operation
exit this plan awaits context `cancel()` and `dispose()`; it deliberately does
not call global `esbuild.stop()`, which could terminate concurrent callers'
work. Exact 0.28.2 declarations say Node terminates the service automatically
before the parent exits, while Deno callers must manually stop it. This first
producer is therefore accepted only under the Node orchestrator proof and is
not claimed as a Bun/Deno-orchestrator operation. The service is unref'd and
remains package/Node-host-process lifetime state.
If per-operation process ownership is later required, it needs a different
isolated subprocess operation and evidence; do not overstate this plan's Scope
guarantee.

The Node syntax target is fixed to the literal `"node26.7"`, matching Plan
018's exact tested Node 26.7.0 producer. There is no caller syntax-target grammar
or range in this first slice.

### Canonical callback artifact

```ts
interface JavaScriptBundleArtifact {
  readonly path: string
  readonly format: "esm" | "cjs"
  readonly nodeSyntaxTarget: "node26.7"
  readonly observedExternalImports: readonly string[]
  readonly stage: {
    readonly operation: "bundle"
    readonly tool: { readonly name: "esbuild"; readonly version: "0.28.2" }
  }
}
```

Use a module-private constructor/brand and identity set, not a public schema
class. Export package-private
`getJavaScriptBundleArtifact(value: unknown): JavaScriptBundleArtifact |
undefined` from this internal module so Plan 018 can verify brand identity; do
not export the constructor or raw identity set. Freeze the artifact, external
specifier array, stage, and nested tool record before registering identity so
unsafe callback code cannot mutate a still-branded path/format/compatibility
fact. `path` is a
temporary physical handle and must never be encoded as durable provenance.
`observedExternalImports` is sorted/deduplicated structured evidence from the
metafile. It pays rent because Plan 018's exact selected Node service is the
authority that decides whether every specifier is a real builtin for that Node;
esbuild alone accepts builtin-shaped strings such as invalid `node:` subpaths.
The list is not a closure proof.

Do **not** retain entrypoint, cwd, output bytes, byte count, digest, metafile,
complete output list, assets, `bundle`, `splitting`, `platform`, `packages`, or
boolean validation flags. Node SEA consumes none of them.

### Statically encoded options

```ts
{
  absWorkingDir: resolvedCwd,
  entryPoints: [resolvedEntrypoint],
  outfile: stagedPath,
  bundle: true,
  splitting: false,
  platform: "node",
  packages: "bundle",
  format,
  target: "node26.7",
  write: false,
  metafile: true,
  logLevel: "silent",
  plugins: [],
  supported: { "dynamic-import": false },
  logOverride: {
    "unsupported-dynamic-import": "error",
    "unsupported-require-call": "error",
    "indirect-require": "error",
    "require-resolve-not-external": "error",
    "direct-eval": "error",
    "ignored-dynamic-import": "error",
    "empty-glob": "error",
  },
}
```

This statically establishes one entrypoint, bundling, no splitting, Node
resolution, ESM/CJS only, one explicit syntax level, dependencies bundled by
default, one fixed output name, and no caller plugins/watch/externals/loaders/options bag. The context
API is used only for rebuild/cancel/dispose; never call `watch()`.

### Dynamic validation before artifact construction

- Decode one non-null non-array object with exactly `entrypoint`, `format`, and
  optional `cwd`; reject unknown keys. Require non-empty NUL-free entrypoint and
  optional cwd strings and exact format `"esm" | "cjs"`.
- Normalize `cwd` and entrypoint with `Path`; require a
  regular entry file whose lowercase extension is exactly one of `.js`,
  `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, or `.tsx`. No extensionless,
  CSS, JSON, custom-loader, or stdin entry is accepted in this slice.
- Reject any esbuild error and every returned warning. The explicit promoted
  message IDs are the stable first-line defense; an empty warning list is not
  described as an exhaustive source oracle.
- Acquire the scoped temp directory before creating the context and set
  `stagedPath` to absolute `main.cjs`/`main.mjs`. Require exactly one
  `outputFile` whose normalized path equals it and exactly one metafile output
  whose output key resolves against `absWorkingDir` to it. Resolve the output
  record's possibly relative `entryPoint` against `absWorkingDir` and require
  equality with `resolvedEntrypoint`. Require `cssBundle` absent; reject CSS,
  maps, chunks, assets, extra outputs, or mismatched entry records.
- Reject any input/metafile import with `path:"<runtime>"`, any
  `require-resolve` kind, and any unknown import kind.
- Accept local literal dynamic imports only when they are folded into the one
  output with no external output edge.
- For CJS, the only external output-edge kind allowed is `require-call`; for
  ESM, only `import-statement` is allowed. Reject ESM `require-call`, including
  dynamic builtins lowered because dynamic import support was disabled.
- Retain every allowed external specifier in `observedExternalImports`; do not
  classify it as a builtin here. Plan 018 validates exact membership against
  the selected Node 26.7 service before Node builds.
- Materialize the sole already-validated output at `stagedPath`, then stat it
  as a regular file before invoking the callback.

This contract catches ordinary computed `import`, computed/direct/aliased
`require`, direct `eval`, ignored missing imports, and ordinary
`require.resolve` through pinned diagnostic IDs/metafile kinds. It cannot see
all indirect `eval`, `Function`, `globalThis.require`, computed
`require.resolve`, or paths constructed behind `createRequire`. Those constructs
are outside the guarantee. Complete source closure would require a stable parser
or plugin identity and is explicitly outside this plan.

## Verified current-state excerpts and primary evidence

The root package uses an explicit test list, so a new test is not covered until
registered (`package.json` at the planning baseline):

```json
"test:unit": "vitest run ... test/unit/standalone-matrix.test.ts",
"verify": "pnpm check && pnpm test:types && pnpm test:unit && ..."
```

Plan 017 must append `test/unit/esbuild-bundle.test.ts` to `test:unit`; a focused
command alone is not an acceptance gate.

Effect rc.108 explicitly permits a scoped value to escape after cleanup
(`.agent-sources/effect/packages/effect/src/Effect.ts:6427-6429`):

```ts
export const scoped: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<A, E, Exclude<R, Scope>> = internal.scoped
```

Its example at `Effect.ts:6412-6421` returns the released resource. This is why
the operation owns a continuation rather than claiming Scope creates a static
lifetime.

Additional evidence:

- `package.json` has no direct esbuild dependency. The installed transitive
  package is exactly 0.28.2; product source must not rely on it transitively.
- The pinned API exposes `context`, `rebuild`, `cancel`, `dispose`, `write:false`,
  `outputFiles`, `metafile`, `supported`, and `logOverride`. See the official
  [esbuild API](https://esbuild.github.io/api/).
- Live 0.28.2 probes showed the promoted IDs/metafile can catch ordinary
  computed imports/requires but cannot observe arbitrary runtime code
  construction. This corrects Fable Max's broader closure claim.
- Live 0.28.2 package code starts an unref'd process-global native service;
  `BuildContext.cancel`/`dispose` manage a context but do not terminate that
  service. This accepts Fable's API-shape distinction while correcting every
  `in-process` topology claim.
- `FileSystem.makeTempDirectoryScoped` removes its directory on Scope close
  (`.agent-sources/effect/packages/effect/src/FileSystem.ts:181-191`).
- Official Effect bundle tooling uses `Effect.acquireRelease` and `Effect.fn`
  (`.agent-sources/effect/packages/tools/bundle/src/Rollup.ts:125-181`).

## Exact internal error model

At the Plan 015 rc.108 baseline use the live `Schema.TaggedError` API and
`Schema.Struct` for nested records; do not use unavailable
`Schema.TaggedErrorClass`.

```ts
EsbuildVersionMismatch {
  expected: "0.28.2"
  observed: string
}

InvalidBundleInput {
  reason: string
}

EsbuildDiagnostic {
  id: string
  text: string
  location?: { file: string; line: number; column: number }
}

EsbuildFailed {
  diagnostics: readonly EsbuildDiagnostic[]
  truncated: boolean
}

JavaScriptBundleInvalid {
  reason: string
}

BundleMaterializationFailed {
  path: string
  operation: "make-temp" | "write" | "stat"
  reason: string
}
```

`EsbuildLayerError` is exactly `EsbuildVersionMismatch` and occurs only while
constructing a Layer; it is not an operation error after `Esbuild` has been
provided. `EsbuildBundleError` is exactly the union of the other four tags.
Retain at most 100
diagnostics, at most 16 KiB UTF-8 per diagnostic text, 256 UTF-8 bytes per ID,
and 4 KiB UTF-8 per location file; set `truncated` when any bound or count is
exceeded. Numeric locations must be finite non-negative safe integers. Do not
create one error tag per message ID. Input/file errors known before context
creation map to `InvalidBundleInput`; context/rebuild esbuild failures map to
`EsbuildFailed`; a successful but invalid structured result maps to
`JavaScriptBundleInvalid`; temp filesystem failures map to
`BundleMaterializationFailed`. Interruption and cleanup defects remain Cause-
level and are never translated to these errors.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Add exact dependency | `pnpm add --save-exact esbuild@0.28.2` | authoritative pnpm manifest/lock add exact direct esbuild; no `bun.lock` |
| Dependency audit | `pnpm list --depth 0 esbuild effect @effect/platform-node @effect/platform-bun @effect/platform-deno` | esbuild exact direct; Effect/platform exact aligned |
| Typecheck | `bun run check` | exit 0 |
| Focused tests | `bun x vitest run test/unit/esbuild-bundle.test.ts` | new suite passes |
| Architecture | `bun run build && bun run test:architecture` | build ignored `dist`, then private boundary and explicit test registration pass |
| Full deterministic gate | `bun run verify` | new suite is exercised through `test:unit`; all checks pass |
| Dirty scope | `git status --short` | only in-scope files changed |

Use Bun for build/test/verification gates. Dependency mutation and the direct-
dependency listing use pnpm because this repository declares pnpm 10.17.1 and
`pnpm-lock.yaml` as authoritative; `bun add`/some `bun pm` commands would create
or report a migrated peer `bun.lock`. Do not bulk-update dependencies.

## Scope

**In scope**:

- `package.json` (exact dependency and explicit unit-test registration)
- `pnpm-lock.yaml`
- `src/standalone/internal/Esbuild.ts` (create; owns the concrete private
  `Context.Service`/Layer, artifact, exact error schemas/union, context factory,
  and continuation operation)
- `test/unit/esbuild-bundle.test.ts` (create)
- `test/fixtures/esbuild/` (create bounded valid `.ts`/`.js` fixtures and use
  non-typechecked `.js`/`.css` for deliberate rejection cases)
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/generated-and-ci.test.ts` (require exact unit-script
  registration)
- `plans/README.md` (status only after completion)

Use `.js` or another non-typechecked extension for intentionally invalid
fixtures. Root TypeScript includes `test/**/*.ts`; missing imports inside `.ts`
fixtures would break `bun run check` for the wrong reason.

**Out of scope**:

- Any root/Bun/Deno public entrypoint, `tooling/public-api.json`, public
  Artifact/error/target, or public `Esbuild`/bundle subpath.
- Node SEA execution, CI/release workflows, Node acquisition, or final native
  publication; Plan 018 owns those.
- Complete source closure/hermeticity, a parser, plugin, eval/Function ban,
  generated-code scanning, watch, sourcemaps, minification/options bag, npm
  packaging, declarations, multiple entries/outputs, splitting, browser/neutral
  platform, user externals, asset loaders, or automatic downloads.
- Generic producer/bundler/compiler/executor interfaces, digest/content
  identity, receipts, SemanticPlan, cache/CAS, or remote execution.
- `.repos/effect` or `.agent-sources/effect` modification.

## Git workflow

- Suggested branch: `advisor/017-scoped-esbuild-bundle`.
- Suggested commit: `feat: add continuation-owned internal esbuild bundle`.
- Do not publish, tag, push, or open a PR without operator instruction.

## Steps

### Step 1: Freeze the dependency, private surface, and test registration

Run:

```sh
pnpm add --save-exact esbuild@0.28.2
```

Confirm only `package.json`, `pnpm-lock.yaml`, and ignored install state changed;
no `bun.lock` appears and Plan 015's Effect family did not move. Add failing
architecture assertions that:

- no public entrypoint exports `Esbuild`, `withJavaScriptBundle`,
  `JavaScriptBundleArtifact`, or a new runtime key;
- only the named production-source module imports `esbuild`; the explicitly
  registered raw characterization test may import it directly;
- it contains no `node:*` import or `Effect.runPromise`; and
- `package.json#scripts.test:unit` explicitly contains exactly one invocation of
  `test/unit/esbuild-bundle.test.ts`.

Append the new test to the existing explicit `test:unit` command when the test
file is created; do not replace the explicit list with a broad glob.

**Verify**:

```sh
pnpm list --depth 0 esbuild effect @effect/platform-node @effect/platform-bun @effect/platform-deno
bun run build && bun run test:architecture
```

Expected: dependency pins are exact; architecture fails only for the not-yet-
created module/test registration until the next steps satisfy it.

### Step 2: Characterize the exact esbuild-observed dependency contract

First create a raw pinned-API characterization block in
`test/unit/esbuild-bundle.test.ts` that imports exact esbuild directly and does
not yet import the product module. Register that file in `test:unit`. Create
minimal fixtures for CJS and ESM covering:

1. valid JavaScript and TypeScript entries plus a local module;
2. literal local dynamic import folded into one output;
3. bare and `node:` builtin spellings as external observations;
4. installed dependency bundled internally;
5. missing and caught-missing literal imports;
6. computed `import`, computed `require`, aliased `require`, and direct eval;
7. literal/computed/aliased `require.resolve`;
8. ESM dynamic builtin lowered to `require-call`;
9. an external URL/custom specifier;
10. CSS-only entry rejection and a JS entry that would emit a CSS side output;
11. an asset/second-output attempt; and
12. two entrypoints supplied through an unsafe runtime call.

Assert exact stable message IDs, normalized metafile entry/output paths,
`cssBundle`, import paths/kinds/external flags, output count, and
format-specific allowlists. Add explicit negative
characterization showing indirect eval/`Function`/`globalThis.require` and a
path behind `createRequire` are not observable; those tests freeze the limit of
the guarantee instead of pretending rejection.

Do not assert English diagnostic sentences and do not scan output JS.

**Verify**:

```sh
bun x vitest run test/unit/esbuild-bundle.test.ts \
  --reporter=verbose -t 'pinned esbuild API contract'
```

Expected: every promised observed edge has a structured accept/reject oracle,
every unobservable construct is documented as outside guarantee, and this raw
characterization subset is green before the operation exists. Architecture may
still be red only for the not-yet-created internal module/API assertions. If a
promoted message ID or metafile/output invariant differs, STOP before
implementation.

### Step 3: Implement `withJavaScriptBundle`

Implement one concrete package-private `Esbuild` `Context.Service` and default
Layer, using `Effect.fn("Esbuild.withJavaScriptBundle")`, `Effect.gen`, and a
private `Effect.scoped` surrounding acquisition, materialization, and the entire
callback:

1. Decode input; compute `resolvedCwd = path.normalize(path.resolve(input.cwd ??
   ""))`, then `resolvedEntrypoint = path.normalize(path.resolve(resolvedCwd,
   input.entrypoint))`; validate the exact extension and stat it once as a
   regular file.
2. Acquire a scoped temp directory; derive absolute `stagedPath`, then build the
   exact options with `absWorkingDir`, `outfile: stagedPath`, and literal target
   `node26.7`.
3. Acquire `esbuild.context(options)` with `Effect.acquireRelease`.
4. Rebuild exactly once; never call watch.
5. Validate the pinned structured contract and create the sorted/deduplicated
   observed-external list.
6. Write the validated bytes to `stagedPath` and stat it.
7. Register the artifact in the module-private identity set, invoke and fully
   await `use(artifact)`, then remove its identity during scope finalization.

Extend the already-registered unit file with operation tests in this step. Add
type tests proving the callback may require `Scope.Scope`, the private scope
discharges it (`Exclude<R, Scope.Scope>`), and the returned effect does not
require Scope. Also prove only the package-private brand accessor recognizes
the live identity.

The release function is exact and Cause-level:

```ts
const releaseContext = (context: esbuild.BuildContext) =>
  Effect.uninterruptible(
    Effect.promise(() => context.cancel()).pipe(
      Effect.ensuring(Effect.promise(() => context.dispose())),
    ),
  )
```

Do not set `interruptible:true` on `acquireRelease`. Always await cancel before
dispose; `ensuring` attempts dispose even when cancel rejects. `Effect.promise`
makes cleanup rejection a defect, not `EsbuildFailed`. A cleanup defect augments
the final Cause; it is neither logged-and-swallowed nor translated into a typed
error.

**Verify**:

```sh
bun run check
bun x vitest run test/unit/esbuild-bundle.test.ts
bun run build && bun run test:architecture
```

Expected: the callback sees a live file; there is no raw artifact-returning
operation; public exports remain exact; explicit unit registration passes.

### Step 4: Prove lifetime and finalizer behavior on every exit

Provide a test `Esbuild` Layer backed by a tiny controlled context factory for
deterministic ordering tests.
Cover:

- default/test factory accepts only exact API version 0.28.2; mismatch fails
  Layer acquisition before any scope/context;
- callback success, typed failure, defect, and interruption: file exists only
  during the callback and temp directory is removed afterward;
- input/build/structured-validation/materialization failures: callback is not
  invoked and acquired resources close;
- cancel and dispose both succeed in exact start/end order;
- cancel rejects: dispose still runs and the final Cause contains a cleanup
  defect;
- dispose rejects: the final Cause contains a cleanup defect;
- both reject: both were attempted and cleanup failure remains observable; and
- rebuild interruption with clean cleanup remains interruption; cleanup
  rejection adds a defect without becoming `EsbuildFailed`.

Also prove `withJavaScriptBundle(input, bundle => Effect.succeed(bundle))`
returns a stale handle whose file has been removed. This is negative evidence
for the documented TypeScript limitation; package code must expose no helper
that encourages this use.

Do not assert that context cleanup terminates esbuild's process-global native
service, and do not call `esbuild.stop()`. Assert instead that every acquired
context is cancelled/disposed and that the package-private operation contains
no global-stop call. The wider unref'd service lifetime is an explicit accepted
limit, not an Effect-owned resource.

**Verify**:

```sh
bun x vitest run test/unit/esbuild-bundle.test.ts --reporter=verbose
```

Expected: deterministic finalizer ordering and all lifetime exits pass.

### Step 5: Run gates and freeze the minimal representation

```sh
bun run verify
pnpm list --depth 0 esbuild effect @effect/platform-node @effect/platform-bun @effect/platform-deno
bun x vitest run test/unit/esbuild-bundle.test.ts -t 'exact artifact keys'
git diff --check
git status --short
```

Expected: all gates pass and include the new suite; exact dependency alignment
holds; the exact runtime/type assertion sees only the five retained artifact
keys; no public or out-of-scope file changed.

Then update only Plan 017's status row in `plans/README.md` to `DONE` with the
green command summary.

## Test plan

- Input: malformed object, entrypoint/cwd, format, NUL, non-file, unsafe runtime
  extra fields, allowed JS/TS extensions, CSS-only rejection; syntax target is
  not configurable.
- Fixed options: one entry, no split, Node platform, packages bundled,
  `absWorkingDir`, exact outfile, write false, metafile, no
  plugins/watch/loaders; JS-plus-CSS cannot cross as one JS artifact.
- Structured observations: local/package imports, literal dynamic import,
  computed/aliased cases, require-resolve, direct eval, returned warnings,
  format-specific external kinds, extra outputs/assets.
- Honest limit: indirect eval/Function/global require/createRequire path are
  explicitly not claimed as closed.
- Lifetime: callback success/failure/defect/interruption and stale-return
  negative characterization; context ownership is separate from the accepted
  package-global native-service lifetime.
- Identity: frozen top-level/nested facts reject mutation; only the accessor
  recognizes the live registered object.
- Finalization: cancel-before-dispose, both attempted, cleanup Cause policy.
- Artifact rent: exact five fields and one named downstream consumer for
  observed externals.
- Architecture: no export/Node import and explicit full-gate test registration.

## Done criteria

- [ ] esbuild is exact direct runtime dependency 0.28.2; Effect/platform pins
      remain aligned, and Layer construction rejects a mismatched loaded API.
- [ ] `withJavaScriptBundle` owns a private Scope spanning the callback and no
      raw artifact-returning operation exists.
- [ ] Exactly one CJS/ESM JS output reaches the callback with fixed Node 26.7
      syntax and Node resolution; TS input is proven, while CSS-only and
      JS-plus-CSS outputs are rejected.
- [ ] Every esbuild-observed external is retained; no claim of arbitrary source
      closure/hermeticity is made.
- [ ] Artifact has exactly path, format, literal syntax target, observed
      externals, and observed esbuild stage.
- [ ] Cancel/dispose and cleanup defects obey the exact Cause-level policy.
- [ ] `test:unit` includes the new suite and `bun run verify` exercises it.
- [ ] Context cancel/dispose is operation-owned; the unref'd esbuild service is
      explicitly package/host-process-owned and never described as in-process.
- [ ] Public API remains exact and no out-of-scope/user-owned file changed.

## STOP conditions

Stop and report; do not improvise if:

- esbuild 0.28.2 is unavailable or pinned message/metafile semantics differ.
- Product requirements demand proof that arbitrary JS has no runtime-computed
  dependency; that requires separately approved parser/plugin identity.
- Structured validation requires generated-output scanning or English messages.
- A second output/asset/plugin/watch mode is necessary.
- Correct interruption cannot await both cancel and dispose in Scope.
- Requirements demand per-operation ownership/termination of esbuild's hidden
  native service; global `stop()` is unsafe for concurrent library callers and
  an isolated producer needs a separate design.
- A Bun or Deno orchestrator is required for this internal producer; exact
  esbuild documentation gives Deno different service-stop obligations, and
  this slice proves Node only.
- A raw independently scheduled bundle handle is required; continuation
  ownership is no longer sufficient and lifetime needs a separate design.
- More fields are requested only for hypothetical receipts/cache/provenance.
- A public export, Node SEA implementation, workflow, or out-of-scope file is
  needed, or a verification fails twice after reasonable correction.

## Maintenance notes

- Upgrade esbuild only with the structured-observation fixture suite. Never
  silently turn the current observed-edge contract into a closure claim.
- `observedExternalImports` exists only so the exact selected Node consumer can
  validate its own builtin set. Remove it if a future producer eliminates all
  externals; do not promote it as durable provenance.
- Plugins remain excluded because their behavior/identity is not stable here.
- Explicit SEA assets belong to Plan 018, not this artifact.
- Context Scope does not own esbuild's global native service. Revisit the
  producer mechanism if isolated process lifetime becomes an acceptance rule.

## Compression ledger

| Retained capability/fact | Named consumer/rent | Rejected peer/state |
|---|---|---|
| continuation-owned temp `path` | Node SEA reads it before private Scope closes | raw scoped handle returned to caller |
| exact `format` | derives SEA `mainFormat` | second Node format input |
| literal `node26.7` syntax | exact selected Node compatibility check | public syntax/execution target family |
| observed external specifiers | selected Node 26.7 builtin membership preflight | false esbuild-only builtin/closure proof |
| observed esbuild stage | internal two-stage result | public receipt/reproducibility claim |
| cancel/dispose finalizer | interrupted build context is cancelled/disposed | false ownership of package-global service; generic producer protocol |

Source compression is not promised; this is bounded feature growth. The
semantic compression is one temporary lifetime, one structured observation
contract, and one downstream consumer rather than parallel raw-path and
artifact representations.

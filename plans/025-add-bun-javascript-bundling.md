# Plan 025: Add Bun as a second scoped JavaScript bundle producer

> **Executor instructions**: Follow this plan step by step. Plan 024 must be
> `DONE` at one exact source commit and no package, tag, release candidate, or
> GitHub Release may exist from the intermediate cut. Preserve every existing
> Bun/Deno compile behavior. Implement only the files named in **Scope**. Stop
> on any condition in **STOP conditions**; do not improvise a Node-version
> option, direct `Bun` global dependency, second Bun discovery path, generic
> bundler service, or source-to-SEA convenience facade. Record this plan's
> receipt only after one clean implementation commit passes every gate.
>
> **Drift check (run first)**:
>
> ```sh
> test "$(bun --version)" = "1.3.14"
> rg -Fx -- '- Architecture generation: `granular-integration-migration-v2`.' AGENTS.md
> PLAN024_SHA="$(sed -n 's/^- \*\*Implementation source SHA\*\*: `\([0-9a-f]\{40\}\)`$/\1/p' plans/024-split-esbuild-node-sea-integrations.md)"
> test "${#PLAN024_SHA}" -eq 40
> test "$(git rev-parse HEAD)" = "$PLAN024_SHA"
> git diff --exit-code HEAD -- . \
>   ':(exclude)plans/024-split-esbuild-node-sea-integrations.md' \
>   ':(exclude)plans/README.md'
> test -z "$(git ls-files --others --exclude-standard)"
> git merge-base --is-ancestor 60259f98a460b3d9b25b95221ca71b56c17d9d78 HEAD
> git status --short
> ```
>
> Expected: HEAD equals Plan 024's implementation SHA and status contains only
> Plan 024's frozen receipt plus the matching README handoff. Any source,
> config, test, workflow, documentation, or untracked non-plan drift is a STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 023 and 024
- **Category**: feature / public API / architecture pressure test
- **Planned at**: source baseline `60259f98a460b3d9b25b95221ca71b56c17d9d78`, 2026-08-14
- **Initial state**: TODO

## Success criteria

This is feature growth, not source compression. It is successful only when all
of the following are simultaneously true:

1. Existing `Bun.compileExecutable` and `Bun.compileExecutableMatrix` inputs,
   results, targets, errors, cleanup, selected-tool policy, and ordered matrix
   behavior remain unchanged.
2. `effect-build-bun` additively exposes
   `Bun.withJavaScriptBundle(input, use)` on the existing `Compiler` service and
   existing `layer`; an application does not provide or discover a second Bun.
3. The operation accepts one entrypoint, one required ESM/CJS format, and an
   optional cwd; it emits exactly one scoped Node-resolution JavaScript bundle
   through core `JavaScriptBundle.Artifact` with one observed Bun stage. Bun's
   producer-default syntax behavior is integration evidence, not a neutral
   Artifact field.
4. Bun is never said to target Node 26.7. Pinned Bun owns resolution and
   bundling; exact selected Node 26.7.0 owns syntax acceptance through the
   `NodeSea.createExecutable` preflight already established by Plan 024.
5. Both Bun ESM and CJS bundles work independently and through
   `Bun.withJavaScriptBundle(..., main => NodeSea.createExecutable(...))` on the
   required Linux x64 GNU real-tool lane. The resulting executable passes the
   same native validation and atomic publication path as Esbuild -> Node SEA.
6. Source remains Effect-platform-neutral: no `node:*`, raw process API,
   `Effect.runPromise`, or direct global `Bun.build()` under package source.
   Applications continue to provide one official Effect platform Layer.
7. The final public surface still has exactly five one-way packages. No generic
   `JavaScriptBundler`, Build/Toolchain service, registry, plan, executor,
   manifest, receipt, store, cache, watch API, plugin protocol, fallback, or
   automatic download is introduced.
8. Plan 026, not this plan, owns exact-source candidate certification and any
   release-direction record. No source state between Plans 024 and 025 is a
   release point.

Semantic compression is limited and explicit: one selected Bun command and one
scoped bundle capability serve two Bun operations and two independent bundle
producers. This plan does not promise fewer production lines; it adds a real
capability while refusing false target and closure claims.

## Evidence: Bun cannot select a Node release

The repository pins compiler Bun `1.3.9` in `tooling/tool-pins.json`; its source
tag is commit `cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a`. Verify these exact
upstream excerpts before implementation:

`packages/bun-types/bun.d.ts:2430-2457,2779-2884,5074-5092`:

```ts
namespace Build {
  type CompileTarget =
    | `bun-darwin-${Architecture}`
    | `bun-linux-${Architecture}`
    | `bun-windows-${Architecture}`
}

interface BuildConfigBase {
  entrypoints: string[]
  target?: Target
}

interface CompileBuildOptions {
  target?: Bun.Build.CompileTarget
}

type Target = "bun" | "node" | "browser"
```

The top-level target and compile target are different axes. The former chooses
the resolution/execution environment. The latter chooses the Bun executable's
native OS/architecture/libc/CPU target. Neither names a Node version.

`src/bun.js/api/JSBundler.zig:451-473` and
`src/options.zig:354-405` reduce the JavaScript API value to the finite native
enum; the parser additionally recognizes Bun's internal `macro` target, while
the public TypeScript union and CLI expose only `browser | bun | node`. An
unknown value is rejected. The CLI independently documents those three public
values at `src/cli/Arguments.zig:174-187`.
`src/bundler/bundle_v2.zig:900-901` shows that `node` marks builtins external,
while `src/options.zig:423-440` and the default-condition table show target-
specific output/resolution behavior. None derives unsupported JavaScript
features from a runtime version. The implementation is explicit at
`src/bundler/linker_context/postProcessJSChunk.zig:343-352`: Bun does not lower
arrow functions.

Reproduce the API result without writing repository files:

```sh
test "$(bun --version)" = "1.3.9"
test "$(bun --revision)" = "1.3.9+cf6cdbbba"
bun -e 'try { await Bun.build({ entrypoints: ["/entry.ts"], files: { "/entry.ts": "export const x = ({a:1})?.a" }, target: "node26" }); console.log("accepted") } catch (error) { console.log(error instanceof Error ? error.message : String(error)) }'
bun -e 'const base = { entrypoints: ["/entry.ts"], files: { "/entry.ts": "export const x = ({a:1})?.a" }, target: "node", minify: false }; const a = await Bun.build(base); const b = await Bun.build({ ...base, supported: { "optional-chain": false } }); console.log((await a.outputs[0].text()) === (await b.outputs[0].text()))'
```

Expected on exact 1.3.9: the first command reports that `node26` is not an
accepted target; the second prints `true`, and both outputs retain optional
chaining. The unknown esbuild-shaped `supported` field is ignored rather than
providing a hidden syntax-target escape hatch.

**Decision:** there is no truthful way to select Node 26.7 in Bun. Do not add a
`nodeVersion`, `syntaxTarget`, `supported`, `engines`, or cast-only option to
the Bun request. Model what Bun actually does:

```text
Bun target "node" -> Node resolution/builtin treatment
Bun emitted syntax -> pinned producer behavior, not version-targeted
NodeSea layer      -> exact Node 26.7.0 selection and native target
NodeSea operation  -> exact selected Node --check, then --build-sea
```

The ownership distinction removes the impossible state “Bun artifact claims
Node 26.7 lowering even though Bun cannot configure it.” It does not require a
neutral syntax tag: Node SEA performs the same acceptance check for every
producer, so such a field would not select behavior. It does not add a general
target matrix.

### Known Bun 1.3.9 semantic difference

Pinned live characterization found that `--target=node` rewrites
`import.meta.main` into a `createRequire(import.meta.url)`-based expression
whose direct-versus-imported behavior differs from native Node and from
Esbuild's `target: "node26.7"` output. `node --check` accepts both forms and
cannot detect that semantic difference. Treat this as a documented producer
limitation, not evidence that Bun and Esbuild are interchangeable.

Do not scan or rewrite generated output to compensate. Freeze a differential
behavior fixture using `import.meta.main`, one bundled CommonJS dependency,
and classic CommonJS main detection. Run the Bun and Esbuild results both as
ordinary Node bundles and through Node SEA, recording their exact observable
behavior. A future Bun pin may change that characterization only after the
source/API/probe checklist is rerun; this plan does not silently bless semantic
equivalence.

## Why the first implementation uses the Bun CLI

Pinned `Bun.build()` returns structured in-memory `BuildArtifact[]`, logs, and
a metafile (`bun.d.ts:3410-3469`), and the source confirms that its config is
parsed by the native bundler. It is useful upstream evidence for the contract,
but the global exists only when the orchestration program itself runs under
Bun. Calling it directly from library source would collapse the currently
independent orchestrator-runtime and build-tool axes.

The first slice therefore invokes the already-selected Bun executable with its
CLI through core `Integration.executeCommand`. The required fixed options all
have direct CLI forms, and the CLI writes the bundle plus JSON metafile into the
core-owned temporary root. Do not add a generated helper script, private JSON
RPC protocol, `bun -e` source string, or Bun-host-only Layer merely to reach the
JavaScript API. Reconsider a child API bridge only when a named consumer needs
an API-only capability such as in-memory virtual files or plugins; those are
out of scope here.

## Exact public API

Keep the existing Context key `effect-build-bun/Compiler`. Extend that service
rather than creating `Bundler`, `Bun`, or a second Layer:

```ts
type BunExecutableStages = typeof Stages.Type // package-private Adapter schema

export interface JavaScriptBundleInput {
  readonly entrypoint: string
  readonly format: "esm" | "cjs"
  readonly cwd?: string
}

export interface BunBundleStage {
  readonly operation: "bundle-javascript"
  readonly tool: {
    readonly name: "bun"
    readonly version: "1.3.9"
    readonly path: Artifact.FileArtifact["path"]
  }
}

export interface Service extends Provider.CompilerService<
  "bun",
  Options,
  Target,
  BunExecutableStages
> {
  readonly withJavaScriptBundle: <A, E, R>(
    input: JavaScriptBundleInput,
    use: (
      main: JavaScriptBundle.Artifact<readonly [BunBundleStage]>
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    BunBundleError | E,
    Exclude<R, Scope.Scope>
  >
}

export class Compiler extends Context.Service<Compiler, Service>()(
  "effect-build-bun/Compiler"
) {}

export const withJavaScriptBundle = <A, E, R>(
  input: JavaScriptBundleInput,
  use: (
    main: JavaScriptBundle.Artifact<readonly [BunBundleStage]>
  ) => Effect.Effect<A, E, R>
) => Compiler.use((service) => service.withJavaScriptBundle(input, use))
```

The top-level accessor remains a one-line delegator. Name only the reusable
service implementation `Effect.fn("Bun.withJavaScriptBundle")`; do not
double-wrap it. The operation's environment is exactly `Compiler |
Exclude<R, Scope.Scope>` and its callback error `E` passes through unchanged.
`Stages` above is Plan 024's package-private exact Bun command-stage Schema;
derive the type from it and do not export a second stage authority.

The runtime export allowlist becomes exactly:

```text
BunBundleFailed
BunBundleInvalid
BunBundleMaterializationFailed
BunBundleMaterializationOperation
BunBundleSpawnFailed
BunBundleVersionMismatch
Compiler
InvalidBundleInput
Target
compileExecutable
compileExecutableMatrix
layer
withJavaScriptBundle
```

Type-only declarations add `BunBundleError`, `BunBundleStage`,
`JavaScriptBundleInput`, and `Service` to the existing exact set. There is no
returned `BunBundle`, raw `BuildOutput`, metafile, context, plugin, or builder
object.

## Exact error boundary

Use the installed `Schema.TaggedError<Self>()` API with package-qualified
identifiers and one private family marker for the Bun-bundle errors. Do not use
the unavailable `Schema.TaggedErrorClass`. Keep ordinary descriptors and stage
DTOs as frozen Schema-validated data rather than nominal classes.

The method error union is exactly:

```ts
type BunBundleError =
  | BunBundleVersionMismatch
  | InvalidBundleInput
  | BunBundleSpawnFailed
  | BunBundleFailed
  | BunBundleInvalid
  | BunBundleMaterializationFailed
```

- `BunBundleVersionMismatch { supported: readonly ["1.3.9"], observed: string }`
  is an operation error, not a Layer error. One package-private frozen
  `SupportedBundleVersions` tuple is the sole gate, Schema input, and error
  projection; do not repeat the version literal in branches. Existing compile
  calls must continue to accept and observe other discovered Bun versions
  exactly as before.
- `InvalidBundleInput { reason }` uses exact literals `expected-object`,
  `unknown-field`, `missing-field`, `invalid-entrypoint`, `invalid-format`,
  `invalid-cwd`, and `entrypoint-not-regular`.
- `BunBundleSpawnFailed { reason }` means the selected child could not be
  started/waited/drained. It never represents a nonzero exit.
- `BunBundleFailed { exitCode, diagnostics }` means the Bun process completed
  nonzero and retains the existing two bounded stdout/stderr diagnostic
  records.
- `BunBundleInvalid { reason }` composes core
  `JavaScriptBundle.InvalidReason` with Bun-specific exact literals
  `missing-output`,
  `unexpected-root-entry`, `missing-metafile`, `invalid-metafile`,
  `expected-one-metafile-output`, `metafile-output-mismatch`,
  `entrypoint-mismatch`, `css-output-not-supported`,
  `invalid-metafile-input`, `invalid-metafile-import`, and
  `invalid-external-import`. Import the core Schema value and use
  `Schema.Union(JavaScriptBundle.InvalidReason, BunSpecificInvalidReason)`;
  never copy the core reason literals into this package.
- `BunBundleMaterializationOperation` is exactly `stat-entrypoint |
  read-root | read-metafile | make-temp | realpath | stat | read | digest`.
  `BunBundleMaterializationFailed { path, operation, reason }` retains platform
  failures from those operations.

Decode the request field by field with `Schema.decodeUnknownResult` and
`Result`, explicit record/key/presence checks, and exact reason mapping. Do not
parse `SchemaError` text or add the bespoke `Valid`/`Invalid` ADT removed by
Plan 024. Map core JavaScript-bundle errors by their family marker and exact
class before entering caller `use`; never put `Effect.catchTags` around the
whole higher-order Effect because caller `E` may reuse the same `_tag`.

Map core `InvalidJavaScriptBundle.reason` one-for-one into the same
`BunBundleInvalid.reason`; map core `JavaScriptBundleAccessFailed.operation`
one-for-one to `realpath | stat | read | digest`; and map
`JavaScriptBundleTemporaryDirectoryFailed` to
`BunBundleMaterializationFailed { path: resolvedCwd, operation: "make-temp",
reason }`. A missing entrypoint or successful stat of a non-regular entry is
`InvalidBundleInput("entrypoint-not-regular")`; another platform stat failure
is `BunBundleMaterializationFailed` with `stat-entrypoint`. These mappings
happen before caller `use`, and a same-tag caller error passes through.

## One selected Bun command, not two Layers

Evolve the command-provider SPI only enough to construct a provider-specific
service from the one already discovered command. Freeze the exact type-only
author context as:

```ts
export interface BoundCommand<Name extends string> {
  readonly tool: {
    readonly name: Name
    readonly version: string
    readonly path: Artifact.FileArtifact["path"]
  }
  readonly execute: (
    argv: readonly string[],
    cwd?: string
  ) => Effect.Effect<CommandCompletion, PlatformError.PlatformError>
}

export interface CommandServiceContext<
  Name extends string,
  Options,
  Target extends SystemTarget,
  Stages extends ProviderStages<Name>
> extends CompilerService<Name, Options, Target, Stages> {
  readonly command: BoundCommand<Name>
}
```

Revise Plan 024's exact generic declarations—not a parallel overload—as:

```ts
interface CommandDefinition<
  Self,
  Name extends string,
  TargetEntries extends readonly [
    readonly [SystemTarget, string],
    ...Array<readonly [SystemTarget, string]>
  ],
  Stages extends ProviderStages<Name>,
  Options,
  Validated,
  Service extends CompilerService<
    Name,
    Options,
    TargetEntries[number][0],
    Stages
  >
> {
  readonly service: Context.Service<Self, Service>
  readonly makeService: (
    context: CommandServiceContext<
      Name,
      Options,
      TargetEntries[number][0],
      Stages
    >
  ) => Service
  // Every other Plan 024 field remains exact and unchanged.
}

declare function define<
  Self,
  const Name extends string,
  const TargetEntries extends readonly [
    readonly [SystemTarget, string],
    ...Array<readonly [SystemTarget, string]>
  ],
  Stages extends ProviderStages<Name>,
  Options,
  Validated,
  Service extends CompilerService<
    Name,
    Options,
    TargetEntries[number][0],
    Stages
  >
>(definition: CommandDefinition<
  Self,
  Name,
  TargetEntries,
  Stages,
  Options,
  Validated,
  Service
>): Defined<Self, Name, TargetEntries, Stages, Options>
```

`makeService` is required and pure. Existing `Defined` and its scalar/matrix/
Layer generics stay unchanged; do not add a second `define` overload. The
`service` Context tag is typed to the exact provider `Service` while the author
context stays the smallest common generated service plus bound command.
`Provider.define` discovers/probes once, captures
the existing `ChildProcessSpawner`, binds `command.execute` permanently to the
canonical selected executable, constructs scalar/matrix functions, and calls
`makeService` once while building the Layer. It does not place `BoundCommand`
on the returned runtime service unless the integration deliberately closes over
it, and no end-user API accepts executable/argv.

Deno returns only the two generated compile functions. Bun returns those same
functions plus `withJavaScriptBundle`. `Provider` gains no runtime export beyond
`define`, no Context service, and no registry. This seam pays rent by removing
the otherwise possible states in which Bun compilation and Bun bundling probe
twice, select different PATH binaries, or require two Layers.

The final Provider runtime export remains exactly `define`. Its sorted public
type-only declaration set becomes exactly `BoundCommand`, `BuildError`,
`CommandDefinition`, `CommandServiceContext`, `CompileExecutableInput`,
`CompileExecutableMatrixInput`, `CompilerService`, `Defined`, `LayerOptions`,
`PreparedCommandInput`, `ProviderArtifact`, `ProviderLayerRequirements`,
`ProviderMatrixError`, `ProviderStage`, `ProviderStages`, `ToolNotFound`, and
`ToolProbeFailed`. All Plan 024 declaration-private helpers remain private.

## Fixed Bun bundle operation

After total input validation and the exact 1.3.9 check, resolve cwd/entrypoint
with Effect `Path`, require a regular entry whose suffix is one of `.js`,
`.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, or `.cts` through `FileSystem`,
and call
`Integration.withOwnedJavaScriptBundle` with prefix `effect-build-bun-`.

Its producer invokes the bound Bun command with exactly:

```text
build
--target=node
--format=<esm|cjs>
--packages=bundle
--outfile=<cleanupRoot>/main.<mjs|cjs>
--metafile=<cleanupRoot>/metafile.json
<absolute entrypoint>
```

Set cwd on the child rather than changing process cwd. Do not pass `--compile`,
`--splitting`, `--external`, `--minify`, `--sourcemap`, `--watch`, plugins,
defines, loaders, conditions, public paths, or raw extra flags. Bun's native
config defaults code splitting to false; omission plus exact output validation
is the first-slice invariant. `packages=bundle` plus `target=node` bundles
packages and automatically externalizes Node builtins.

After exit 0, require the owned root to contain exactly `main.mjs|main.cjs` and
`metafile.json`. Exact CLI probing confirms that Bun 1.3.9 records an absolute
`--outfile=<root>/main.mjs` under the metafile output key `./main.mjs` (and the
corresponding CJS form). Parse the metafile as an excess-property-tolerant
upstream observation but validate every field this operation consumes:

- exactly one output record; replace every U+005C reverse solidus with `/`,
  remove at most one leading
  `./`, and require the remaining key to equal exactly `main.mjs` or `main.cjs`
  for the selected format, with no directory component;
- the record's `entryPoint`, resolved **lexically** against the child cwd,
  equals the lexically resolved requested entrypoint. Do not compare this
  field to a realpath: Bun 1.3.9 can emit cwd-relative `..` entry paths while
  realpathing other metafile records;
- no `cssBundle` and no peer output/chunk/asset;
- every input record has an imports array;
- every `external: true` import has a non-empty string path;
- collect those `path` values, sort and deduplicate them, and retain no other
  metafile field.

Return the descriptor:

```ts
{
  path: expectedMain,
  format: decoded.format,
  resolutionTarget: "node",
  observedExternalImports,
  stages: [{
    operation: "bundle-javascript",
    tool: { name: "bun", version: "1.3.9", path: command.tool.path }
  }]
}
```

Core observes size/digest, authenticates the live handle, spans the caller
callback, and deletes the root on success, failure, defect, or interruption.
The integration never creates another liveness registry or deletes the root.

This metafile is observation, not a closed-input proof. Pinned live probes show
that `const p = ...; import(p)`, indirect `require`, and `eval("require(...)")`
can survive with no useful external edge. Even a generated static
`node:module` import can be absent while a `bun:wrap` pseudo-record appears.
Therefore `observedExternalImports` means only the sorted subset of
`external: true` metafile edges; it is not the emitted bundle's complete import
set. Accept and ignore well-formed non-external `bun:wrap`-style records while
retaining strict validation of every field actually consumed. Do not scan
output text, add a parser, or call the bundle hermetic. Node SEA validates
every observed external against its exact selected-Node builtin authority,
runs exact Node `--check`, and the real executable smoke supplies behavioral
evidence; none of these proves all arbitrary JavaScript dependencies are
closed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| install | `bun install --frozen-lockfile` | exit 0; lock unchanged |
| build | `bun run build` | all five packages compile |
| provider | `bun x vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/architecture/provider-spi.test.ts` | old compile behavior plus one selected-command service construction pass |
| bundle unit | `bun x vitest run test/unit/bun-bundle.test.ts test/unit/core-artifact.test.ts` | exact API/output/error/lifetime cases pass |
| pipelines | `bun x vitest run test/unit/bun-node-sea-pipeline.test.ts test/unit/esbuild-node-sea-pipeline.test.ts test/unit/node-sea.test.ts` | both producers satisfy one Node consumer contract |
| type API | `bun run test:types` | exact service/callback/error environments pass |
| architecture | `bun run build && bun run test:architecture` | graph/import/export/docs/CI contracts pass |
| full | `bun run verify` | exit 0 |
| Effect range | `bun run verify:effect` | beta.104 and rc.108 pass |
| real Bun bundle | `EFFECT_BUILD_BUN_BIN=/absolute/bun-1.3.9 bun run test:integration:bun-bundle` | scoped ESM/CJS outputs pass |
| real Bun -> SEA | explicit Bun and Node paths with `bun run test:integration:bun-node-sea` | ESM/CJS executables run on Linux x64 GNU |
| formatting | `git diff --check` | no output |

Always build before architecture tests because they inspect built declarations.
Use repository-pinned package-manager Bun 1.3.14 for workspace commands and the
explicit compiler Bun 1.3.9 for real bundle evidence; never conflate them.

## Scope

**In scope** (the only source/config/test/workflow/docs files this plan may
modify):

- `packages/effect-build/src/Provider.ts`
- `packages/effect-build-bun/src/Adapter.ts`
- `packages/effect-build-bun/src/Bundle.ts` (new)
- `packages/effect-build-bun/src/index.ts`
- `packages/effect-build-deno/src/index.ts`
- `packages/effect-build-bun/package.json`
- `packages/effect-build-bun/README.md`
- `packages/effect-build-node-sea/README.md`
- `package.json`
- `bun.lock` only if the exact frozen workspace metadata changes; no dependency
  may be added
- `tooling/public-api.json`
- `scripts/read-tooling.mjs`
- `scripts/test-built-consumer.mjs`
- `test/unit/bun-bundle.test.ts` (new)
- `test/unit/bun-node-sea-pipeline.test.ts` (new)
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/public-api.test.ts`
- `test/architecture/provider-spi.test.ts`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/docs-contract.test.ts`
- `test/architecture/workspace-topology.test.ts`
- `test/integration/bun-bundle.test.ts` (new)
- `test/integration/bun-node-sea.test.ts` (new)
- `typetest/bun-bundle.tst.ts` (new)
- `typetest/provider-definition.tst.ts`
- `typetest/standalone-contract.tst.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `docs/architecture.md`
- `docs/api.md`
- `docs/errors.md`
- `docs/README.md`
- `README.md`
- `examples/README.md`
- `packages/effect-build/README.md`
- `AGENTS.md`
- this plan and `plans/README.md` for status/receipt only

**Read-only evidence scope**:

- every other source/test/config file;
- Bun v1.3.9 source at exact commit
  `cf6cdbbbadd50604bc17f21ed5d0612c920a5d9a`;
- Node v26.7.0 source at exact commit
  `b4f23d3619c98bed09af93a21192f6080197a8c6`;
- exact-SHA CI logs and disposable external temp directories.

**Out of scope**:

- changing the five-package star graph or adding a package;
- changing Bun/Deno compile inputs, behavior, targets, result values, errors,
  or matrix semantics;
- Deno bundling, browser/Bun resolution bundles, multiple entrypoints, code
  splitting, CSS outputs, durable bundle publication, watch/rebuild, plugins,
  arbitrary external configuration, source maps, minification, virtual files,
  or direct in-process `Bun.build()`;
- a Bun `nodeVersion`/`syntaxTarget` request or Node discovery in the Bun
  integration;
- a combined Bun+SEA operation/package, generic bundler/packager/provider,
  public bound-command capability, raw argv, process handle, native inspector,
  plan/executor, registry/fallback, receipt/manifest product, store/cache/CAS,
  container/remote backend, or transport;
- publication, tagging, release creation, trusted-publisher mutation, or
  automatic tool download.

## Steps

### Step 1: Freeze the API and Bun-source characterization as red tests

Before implementation, add public allowlist/type tests for the exact Bun
service, operation, stage, and error surface above. Add source-shaped unit
fixtures for ESM/CJS, Node builtins, external sorting, CSS side output,
malformed metafiles, missing outputs, computed dynamic imports, and callback
failure/interruption. Intentionally invalid files must use `.js` or another
non-TypeScript fixture extension so root TypeScript checking does not fail for
the wrong reason.

Add architecture assertions that production package source contains no
`Bun.build`, `globalThis.Bun`, `node:*`, helper/RPC script, second Bun service,
or integration sibling import. Assert Provider's runtime keys do not grow and
its new bound-command/service-context declarations are type-only.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/bun-bundle.test.ts test/architecture/public-api.test.ts test/architecture/provider-spi.test.ts
bun run test:types
```

Expected: red only because the named Bun API, Provider service-construction
contract, and implementation do not exist. Any unrelated failure is a STOP.

### Step 2: Reuse one selected Bun command across compile and bundle

Implement the exact `BoundCommand`/`CommandServiceContext`/
`CommandDefinition.makeService` change. Bind execute to the canonical path and
captured child-process service inside `Provider.define`; do not expose the
bound command on end-user exports. Update Bun and Deno definitions atomically.
Bun's existing compile operations and Deno's full public surface must remain
byte/value/type compatible.

Use `Result.Result` for provider option validation, `Effect.gen` only for real
sequences, and `Effect.fn` exactly once on generated compile methods. Do not add
a Layer-scoped child or command service; children remain operation-scoped.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-matrix.test.ts test/architecture/provider-spi.test.ts
bun run test:types
```

Expected: all old provider tests pass; one fake selected command is observed by
both Bun service branches; Deno exposes no extra operation; Provider runtime
allowlist is unchanged.

### Step 3: Implement the scoped Bun bundle operation

Implement `Bundle.ts` and the exact public exports. Use the fixed CLI/options,
total decoders, finite error vocabularies, structured metafile validation,
core-owned temporary root, one Bun stage, and identity-safe core error mapping
specified above. Reject selected Bun versions other than 1.3.9 before file
observation or child execution, while leaving compile behavior unchanged.

Tests must cover success and every named error, exact argv/cwd, ESM/CJS suffix,
Node builtin external observation, sorted uniqueness, CSS/extra output,
malformed/changed/missing metafile/output, unsafe size mapping through core,
caller error with a colliding `_tag`, callback defect, and interruption. Use
`Latch`, `Deferred`, `Ref`, `Effect.forkChild`, and fiber interruption for
deterministic lifecycle tests; do not use polling, `Date.now`, or
`setTimeout`. Do not add `@effect/vitest`.

Freeze `SupportedBundleVersions` as exactly `["1.3.9"]`, prove the mismatch
error projects that tuple without discovering another tool, and make the
source/API/metafile/differential re-probe checklist the only authorized route
to widening it.

Add a symlinked-cwd/entry fixture proving the entrypoint comparison is lexical
while imported-input records may be canonical, plus a fixture proving a
well-formed `bun:wrap` pseudo-record is tolerated and a generated builtin that
is absent from metafile externals is not falsely claimed in
`observedExternalImports`. These are Bun 1.3.9 characterization contracts, not
generic metafile semantics.

Append `test/unit/bun-bundle.test.ts` and
`test/unit/bun-node-sea-pipeline.test.ts` to the repository's explicit
`test:unit` script in `package.json`; add an architecture assertion that both
remain registered so `bun run verify` cannot omit them.

**Verify**:

```sh
bun run build
bun x vitest run test/unit/bun-bundle.test.ts test/unit/core-artifact.test.ts test/unit/standalone-bun.test.ts
bun run test:types
```

Expected: all pass; callback exit always removes the owned bundle root, a
returned/stale handle fails core liveness, and no raw metafile/BuildOutput is
public.

### Step 4: Prove independent and Node SEA consumers

Add a fake pipeline test proving Bun's exact observed stage prefix survives
Node SEA's prepared-stage correlation and Node stage suffix. Assert selected
Node copies and authenticates the main, runs `--check` on that private copy
before candidate acquisition, points the SEA config at the same copy, and runs
`--build-sea` only after it passes. Failure/interruption leaves no destination
while Bun's root and Node's private staging cleanup complete.

Add a differential producer suite for the same idiom-heavy entrypoint. It must
contain `import.meta.main`, one bundled CommonJS dependency, and classic
CommonJS main detection, and it must run each ordinary ESM/CJS bundle both
directly and through an importing wrapper. Freeze the exact Bun 1.3.9 versus
Esbuild 0.28.2 observations, including the known Bun imported-bundle
`import.meta.main` divergence. The assertion is that the difference is visible
and documented—not that the producers are interchangeable.

Add real Linux x64 GNU integration coverage with explicit selected tool paths:

```sh
EFFECT_BUILD_BUN_BIN=/absolute/path/to/bun-1.3.9 \
bun run test:integration:bun-bundle

EFFECT_BUILD_BUN_BIN=/absolute/path/to/bun-1.3.9 \
EFFECT_BUILD_NODE_SEA_BIN=/absolute/path/to/node-26.7.0 \
bun run test:integration:bun-node-sea
```

The second suite builds and runs both ESM and CJS executables from the same
idiom-heavy fixtures. It records the exact embedded `import.meta.main`, bundled
CommonJS dependency, and classic main-detection observations for both formats;
a hello-world-only smoke is insufficient. It must use
ambient Node 24.14.1/Bun 1.3.14 only as orchestration/package tools and the two
explicit paths as producers. If the local host is not Linux x64 or lacks exact
tools, record `UNAVAILABLE`; the exact-source CI `bun-bundle` job is mandatory.

Register exactly `test:integration:bun-bundle` and
`test:integration:bun-node-sea` in `package.json` with the corresponding
single Vitest files. Do not fold them into `verify:real`, whose published
Bun/Deno compiler contract remains unchanged; the new required CI job invokes
both scripts explicitly.

Update CI with one required `bun-bundle` job that captures/provisions exact Bun
1.3.9 and Node 26.7.0 paths, restores ambient Node 24.14.1, asserts all three
versions/paths, then runs both real suites. Add that required job to the
non-mutating release workflow's prerequisite list. Do not put selected producer
paths in global workflow environment or substitute package-manager Bun.

**Verify**:

```sh
bun x vitest run test/unit/bun-node-sea-pipeline.test.ts test/unit/esbuild-node-sea-pipeline.test.ts test/unit/node-sea.test.ts
bun run build && bun run test:architecture
```

Expected: both producer topologies are explicit application Effects; no
integration imports a sibling; CI mechanically requires the new real lane.

### Step 5: Update packed consumers, docs, and final governance

Update the Bun isolated npm/Bun packed cases to call
`withJavaScriptBundle` without Node SEA installed. Add npm/Bun composed cases
that directly declare core, Bun, and Node SEA and build one executable; keep the
existing Esbuild composition cases. The final count is fourteen: ten isolated,
two Esbuild+Node SEA, and two Bun+Node SEA. The candidate still contains exactly
five tarballs plus one private verification manifest.

Document:

- Bun `target: "node"` is a resolution/builtin target, not a Node-version or
  syntax-lowering target;
- Bun's pinned producer-default syntax behavior is documented as an
  integration fact but is not encoded in the neutral Artifact;
- Node SEA selects exact Node, privately stabilizes the authenticated main,
  and runs syntax acceptance for every producer;
- `Bun.withJavaScriptBundle` and `Esbuild.withJavaScriptBundle` share only the
  core artifact/lifetime language, not a generic bundler options/service;
- observed external imports are not a closure/hermeticity claim;
- direct Bun executable compilation remains a separate transformation.

In the same implementation commit, replace migration governance with this
exact final rule set:

```md
# effect-build execution rules

- Architecture generation: `granular-integration-v2`.
- Keep exactly five lockstep public packages: `effect-build`, `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and `effect-build-node-sea`. Every integration depends one way on core and never on an integration sibling.
- Keep Bun and Deno's existing public scalar `compileExecutable` and homogeneous-provider `compileExecutableMatrix` operations and behavior. Bun additionally exposes one scoped Node-resolution JavaScript-bundle continuation; Deno gains no bundle API without separate evidence. There is no registry, fallback, retry, caller-facing raw argv, or automatic installation.
- `effect-build` owns only provider-neutral Artifact/Target semantics plus the narrow `./Integration` and command-only `./Provider` author boundaries earned by current consumers. Do not add a generic builder, bundler, packager, plan, executor, store, cache, transport, or backend registry.
- Esbuild and Bun independently produce the core scoped JavaScript-bundle capability. Node SEA consumes it and creates an executable. Application Effect code owns composition; do not add a combined facade/package or an integration sibling dependency.
- Bun's Node target controls resolution and builtin handling, not a Node release or syntax lowering. The exact selected Node tool owns syntax acceptance before SEA assembly; core does not carry a provenance-only syntax mode.
- Shared lifecycle code exclusively owns sibling staging, scoped child processes, candidate identity, executable validation, optional hashing, lifetime-safe publication claims, and atomic replacement. Integrations own tool discovery/probing, native invocation, semantic input validation, and diagnostics.
- `effect-build/Provider.define` is a command-provider author SPI with Bun and Deno as its consumers. It may construct a provider-specific service from one selected bound command, but that command is not an end-user service or generic bundler protocol. Esbuild and Node SEA do not implement it.
- `effect-build/Integration.executeCommand` is the one bounded/scoped integration-author command function. Do not expose a process handle, replaceable process service, candidate, commit, raw native inspector, or publication mutation capability.
- Keep package manager, orchestrator runtime, build tool, and artifact target independent. Applications provide one official Effect platform Layer at composition time.
- Library source uses Effect platform-neutral services. Do not import `node:*` or call `Effect.runPromise` under `packages/*/src/`.
- Preserve compiler CLI project/environment behavior unless a dedicated public decision explicitly changes it.
- Interruption closes Scope and terminates active children. Do not translate interruption into a build error. Atomic rename remains the publication point of no return.
- Run `bun run verify` before handing off a complete implementation.
```

**Verify**:

```sh
rg -Fx -- '- Architecture generation: `granular-integration-v2`.' AGENTS.md
! rg -n 'granular-integration-migration-v2|exactly two public operations|exactly four lockstep' AGENTS.md
bun run build
node scripts/test-built-consumer.mjs --built
bun run test:architecture
```

Expected: final governance and documentation agree; all fourteen packed
consumer cases pass; no legacy or combined API returns.

### Step 6: Run the complete gates and record one source SHA

Run from exact package-manager Bun 1.3.14:

```sh
test "$(bun --version)" = "1.3.14"
bun install --frozen-lockfile
bun run verify
bun run verify:effect
git diff --check
```

On Linux x64, provision the exact repository-pinned Bun and exact selected
Node, then run both real suites. On other hosts, record the exact reason local
evidence is unavailable and require Plan 026's exact-SHA `bun-bundle` CI job.
Do not fall back to PATH.

Review the diff against Plan 024's implementation SHA. Commit only the declared
source/config/test/workflow/docs files plus Plan 024's pre-existing receipt and
README handoff. Then rerun the deterministic gates from clean HEAD. Use a
disposable local pack directory only for built-consumer verification; do not
dispatch the candidate workflow here.

After every non-receipt criterion passes, record the implementation SHA and
verification below and update only this plan plus `plans/README.md`. Those two
plan edits remain the handoff to Plan 026.

## Test plan

- Unit: exact decoder/error codes, version gate, argv/cwd, metafile/output
  interpretation, lexical/canonical path characterization, incomplete external
  observations, Effect cleanup and caller-error preservation.
- Provider regression: Bun/Deno scalar and matrix values/types/errors unchanged;
  one selected Bun command shared inside one service/Layer.
- Pipeline: Bun and Esbuild stage prefixes each correlate with the same Node
  suffix; private-copy authentication and syntax check precede candidate;
  failure/interruption cleans producer, Node staging, and executable resources.
- Differential behavior: the idiom-heavy Bun/Esbuild fixtures freeze their
  distinct direct/imported `import.meta.main` behavior instead of asserting
  producer equivalence.
- Real: exact Bun 1.3.9 standalone ESM/CJS bundles and exact Bun -> Node 26.7.0
  ESM/CJS executables on Linux x64 GNU.
- Architecture/type: exact exports, environments, one-way graph, no direct Bun
  global/node imports, no generic service, fourteen packed consumers, required
  CI/release prerequisite.
- Compatibility: Effect beta.104 and rc.108, existing real Bun/Deno compilers,
  all target cells, and three publication hosts remain required by Plan 026.

## Done criteria

- [ ] Bun source/API evidence is recorded exactly and no Bun Node-version or
      syntax-target input exists.
- [ ] The existing `Compiler` service/layer exposes the new continuation and
      shares one canonical selected Bun with existing compile methods.
- [ ] Pinned 1.3.9 version enforcement applies only to bundling; existing
      compile behavior is unchanged.
- [ ] Bundle outputs have one ESM/CJS file, Node resolution, sorted observed
      metafile externals, one Bun stage, core liveness/digest, and
      cleanup on every exit.
- [ ] Node SEA accepts any valid core Node-resolution bundle, privately copies
      and authenticates it, runs exact selected Node `--check`, and
      produces/runs both Bun-origin formats on the required real lane.
- [ ] The Bun/Esbuild differential suite and idiom-heavy real SEA smoke record
      `import.meta.main`, bundled CommonJS dependency, and classic main-detection
      behavior; docs do not claim producer equivalence.
- [ ] Provider runtime exports do not grow; its type-only bound-command context
      is not an end-user service or raw process handle.
- [ ] Bun's exact runtime/declaration export allowlists and all named tagged
      error fields/reasons are frozen at both Effect endpoints.
- [ ] There is no direct `Bun.build`, `node:*`, `Effect.runPromise`, integration
      sibling dependency, second discovery/Layer, helper RPC, generic bundler,
      combined facade, fallback, or automatic download.
- [ ] All deterministic/full/Effect gates pass; real local gates pass where the
      exact host/tools are available and otherwise are assigned to exact-SHA CI.
- [ ] Five tarballs and fourteen consumer cases pass locally without
      publication; final `AGENTS.md` carries `granular-integration-v2`.
- [ ] One clean implementation SHA and this plan-only receipt are recorded for
      Plan 026.

## STOP conditions

Stop and report without improvising if:

- Plan 024 is incomplete, its source SHA differs, or any non-plan input drifted;
- package-manager Bun is not exact 1.3.14 before any workspace command;
- pinned compiler Bun is not exact 1.3.9 or its source/API/metafile/CLI behavior
  differs from the verified excerpts and probes;
- the exact 1.3.9 `import.meta.main`, CJS dependency, classic main-detection,
  `bun:wrap`, or symlinked-path characterization differs; restamp evidence
  rather than weakening the fixtures or claiming producer equivalence;
- supporting the operation requires `target: "node26"`, a `supported` cast,
  another Node discovery/probe inside Bun, or any false syntax-target claim;
- invoking `Bun.build()` directly would make the orchestration program Bun-only,
  or reaching it requires a helper/RPC protocol without an API-only consumer;
- Provider cannot construct one Bun service from one selected command without
  exposing that command to end users or changing Deno/Bun compile behavior;
- Bun produces more than one artifact for a supposedly accepted input, the
  metafile cannot account for the output/external facts, or CJS remains
  incompatible with exact Node 26.7 SEA;
- Node `--check` does not run before candidate acquisition or does not preserve
  format/failure/interruption semantics;
- any required test, exact-SHA CI cell, packed consumer, Effect endpoint, or
  existing behavior gate fails twice after one bounded correction;
- an out-of-scope file/concept, sibling dependency, generic service, fallback,
  publication mutation, or receipt/hermeticity claim becomes necessary.

## Maintenance notes

- Bun emits according to its pinned tool defaults without targeting a runtime
  syntax version. This remains integration documentation rather than a neutral
  field because no current consumer branches on it. Bun transforms
  TypeScript/JSX, bundles modules, and may perform runtime-oriented lowering.
- Node `--check` establishes parser acceptance by the selected Node; it does not
  execute, resolve every hidden dynamic dependency, or prove runtime success.
- Bun metafile edges remain a subset of engine observations. Computed
  import/eval forms and even generated static builtin imports can be invisible;
  do not relabel them as a closed graph.
- A future Bun release upgrade must repeat the exact source/API/metafile,
  symlink-path, differential `import.meta.main`, and real SEA probes before
  widening the sole `SupportedBundleVersions` tuple and stage schema.
- A future Deno bundle API needs its own operation evidence. It must not be
  inferred from Bun merely to manufacture a generic bundler service.
- Direct Bun compile and Bun bundle -> Node SEA are intentionally different
  transformations with different toolchains and final stage observations.

## Compression ledger

| Accepted primitive/change | Invalid state or duplication removed | Rejected parallel representation |
|---|---|---|
| no neutral syntax-mode field | provenance-only tag cannot drift into a false compatibility promise | optional `syntaxTarget`, `nodeVersion`, `supported` escape hatch |
| Provider bound-command service construction | compile and bundle can select/probe different Bun binaries | second Bun service/Layer/discovery helper |
| `Bun.withJavaScriptBundle` | Bun's real bundle capability remains trapped behind direct executable compile | generic `JavaScriptBundler` or copied Esbuild options |
| Node-owned `--check` acceptance | each producer invents Node compatibility validation | Node discovery inside Bun or rebranded bundle artifact |
| core scoped artifact reuse | a second Bun-specific live file/cleanup registry | durable temp path, raw BuildArtifact, public metafile |

## Implementation handoff receipt

Fill only after every non-receipt done criterion passes. This is a plan handoff,
not a public build receipt, provenance record, or reproducibility claim.

- **Implementation status**: `PENDING`
- **Implementation source SHA**: `PENDING`
- **Bun source/API characterization**: `PENDING`
- **Deterministic and Effect gates**: `PENDING`
- **Real Bun bundle evidence**: `PENDING`
- **Real Bun -> Node SEA evidence / Plan 026 CI assignment**: `PENDING`
- **Packed consumer result**: `PENDING` (expected: five tarballs, fourteen cases)
- **Allowed plan-only handoff changes**:
  `plans/025-add-bun-javascript-bundling.md`, `plans/README.md`

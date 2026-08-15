# API

The workspace publishes five packages with seven public entry points:

```ts
import { Artifact, BuildError, JavaScriptBundle, MatrixError, Target } from "effect-build";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";
import * as Integration from "effect-build/Integration";
import { define } from "effect-build/Provider";
```

There is no root compile operation or provider argument. `effect-build` owns
provider-neutral file, executable, target, error, and scoped-bundle semantics.
`effect-build/Integration` is the narrow package-author boundary for bounded
commands, bundle inspection/production, and executable production.
`effect-build/Provider` contains only the command-provider `define` factory
used by Bun and Deno; it is not a registry or application operation.

## Command compilers

Bun and Deno both expose `Compiler`, `Target`, `compileExecutable`,
`compileExecutableMatrix`, and `layer` at runtime. Bun also exposes the scoped
bundle operation and its closed error Schemas described below. Their scalar
input is:

```ts
interface CompileExecutableInput<Options, Target> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target;
  readonly digest?: boolean;
  readonly options?: Options;
}
```

The scalar result is the provider-refined executable Artifact. Its error
channel is `BuildError.BuildError`, and its environment is the selected
provider service.

The homogeneous matrix input shares one entrypoint, output directory, name,
options value, and non-empty target tuple. `concurrency` defaults to one and
must be a positive safe integer. Total preflight runs before any filesystem,
argv-rendering, or child-process work. Execution is bounded and collect-all.
`MatrixFailed` keeps already committed Artifacts and every cell failure in
target input order; it does not roll them back.

## Scoped JavaScript bundles

`JavaScriptBundle.Artifact<Stages>` is a nominal, continuation-scoped capability,
not a serializable file record. It carries an authenticated path,
safe byte count, SHA-256 identity, `format`, Node `resolutionTarget`, observed
external imports, and the producer's exact stage tuple. The handle can be
inspected only while its continuation is live.

`effect-build-esbuild` exposes:

```ts
interface JavaScriptBundleInput {
  readonly entrypoint: string;
  readonly format: "esm" | "cjs";
  readonly cwd?: string;
}

declare const withJavaScriptBundle: <A, E, R>(
  input: JavaScriptBundleInput,
  use: (bundle: JavaScriptBundle.Artifact) => Effect.Effect<A, E, R>,
) => Effect.Effect<A, Esbuild.EsbuildBundleError | E, Esbuild.Esbuild | Exclude<R, Scope.Scope>>;
```

Its fixed producer behavior is one Node-resolving bundle, one JavaScript
output, Esbuild 0.28.2, ESM or CJS, no splitting, no plugins, and explicit
`node26.7` lowering.

The existing Bun `Compiler` service and Layer additionally expose:

```ts
declare const withJavaScriptBundle: <A, E, R>(
  input: JavaScriptBundleInput,
  use: (
    bundle: JavaScriptBundle.Artifact<
      readonly [{
        readonly operation: "bundle-javascript";
        readonly tool: { readonly name: "bun"; readonly version: "1.3.9"; readonly path: string };
      }]
    >,
  ) => Effect.Effect<A, E, R>,
) => Effect.Effect<A, Bun.BunBundleError | E, Bun.Compiler | Exclude<R, Scope.Scope>>;
```

The same selected Bun command serves scalar compile, matrix compile, and bundle
calls. Bundling fixes `target=node`, packages bundled, one output, and the
pinned Bun 1.3.9 producer defaults. Here `node` controls resolution and builtin
handling; it cannot select Node 26.7 or a syntax-lowering level. Metafile
`external: true` edges are sorted observations, not a complete import closure.
Bun's generated `import.meta.main` behavior is intentionally documented as
different from Esbuild when an ESM bundle is imported.

## Node SEA

`effect-build-node-sea` exposes granular assembly rather than compile/matrix:

```ts
interface CreateExecutableInput<MainStages extends readonly Artifact.StageObservation[]> {
  readonly main: JavaScriptBundle.Artifact<MainStages>;
  readonly outfile: string;
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly assets?: readonly { readonly key: string; readonly path: string }[];
}

declare const createExecutable: <const MainStages extends readonly Artifact.StageObservation[]>(
  input: CreateExecutableInput<MainStages>,
) => Effect.Effect<NodeSea.Artifact<MainStages>, NodeSea.NodeSeaCreateError, NodeSea.NodeSea>;
```

The result keeps the main's exact stage prefix and appends one observed
Node 26.7.0 `assemble-node-sea` stage. A borrowed bundle with no stages therefore
produces exactly one stage; an Esbuild bundle produces Esbuild then Node; a
Bun bundle produces Bun then Node.

Application Effect code owns composition:

```ts
const executable = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "cjs" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app" }),
);
```

Node SEA accepts only Node-resolution bundles, validates externals against the
selected Node builtin set, authenticates a private main copy, runs `--check`,
and then performs direct SEA assembly. Exact syntax acceptance belongs to the
selected Node tool for every producer, not a neutral core syntax mode.

## Artifacts and errors

Core `Artifact` has exactly the neutral runtime schemas `AbsolutePath`,
`ByteCount`, `Digest`, `ExecutableArtifact`, `FileArtifact`,
`StageObservation`, and `ToolObservation`. Core `Target` has only
`ResolutionTarget` and `SystemTarget`. Provider literals and exact stage tuples
are owned by their integration packages.

Stages are observations of work. They are not provenance, receipts, or
reproducibility claims. See [Errors](errors.md) for the separate compiler,
matrix, bundle-producer, and Node SEA unions. Interruption remains an Effect
Cause rather than any build error.

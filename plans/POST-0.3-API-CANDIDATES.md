# Post-0.3 public API candidates

Status: exact architecture sketches. These declarations are intentionally not
production source. They are complete enough to expose type, package, lifetime,
error, and host-runtime consequences before implementation.

The candidates share these constraints:

- integrations depend one way on `effect-build`;
- no integration imports a sibling integration;
- direct provider APIs remain available unless the candidate explicitly omits
  portable composition;
- interruption is never converted to a typed build failure;
- borrowed output cannot become durable merely by returning it from a callback;
- one universal `ExecutableBuilder` union is excluded from every serious model.

## Common vocabulary used in sketches

```ts
import {
  Context,
  Data,
  Effect,
  Layer,
  Scope,
  Stream,
} from "effect"

export type SystemTarget =
  | "linux-x64-gnu"
  | "linux-x64-musl"
  | "linux-aarch64-gnu"
  | "macos-x64"
  | "macos-aarch64"
  | "windows-x64"
  | "windows-aarch64"

export namespace Artifact {
  export type Digest = `sha256:${string}`
  export type LocalPath = string & {
    readonly LocalPath: unique symbol
  }

  export interface File {
    readonly path: LocalPath
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface Executable extends File {
    readonly systemTarget: SystemTarget
    readonly steps: readonly BuildStepObservation[]
  }
}

export interface BuildStepObservation {
  readonly operation: string
  readonly tool: {
    readonly name: string
    readonly version: string
    readonly path?: Artifact.LocalPath
  }
}

export interface Diagnostic {
  readonly severity: "error" | "warning"
  readonly message: string
  readonly code?: string
  readonly file?: string
  readonly line?: number
  readonly column?: number
}
```

## Candidate A: provider-native Effect APIs only

### Model

Core publishes durable artifact and lifecycle-author primitives. Every provider
publishes direct API and/or command services. There is no portable application
service.

### Bun declarations

```ts
// effect-build-bun/Api
export interface BunApiService {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<
    Bun.BuildOutput,
    BunApiError
  >

  readonly compileExecutable: (
    options: Bun.CompileBuildOptions
  ) => Effect.Effect<
    Artifact.Executable,
    BunApiError | ExecutablePublicationError
  >
}

export class BunApi extends Context.Service<
  BunApi,
  BunApiService
>()("effect-build-bun/Api") {}

/** Detects and captures the current global Bun API. */
export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>

// effect-build-bun/Command
export interface BunCommandBuildInput {
  readonly entrypoints: readonly [string, ...string[]]
  readonly cwd?: string
  readonly outdir?: string
  readonly outfile?: string
  readonly target?: "browser" | "bun" | "node"
  readonly format?: "esm" | "cjs" | "iife"
  readonly splitting?: boolean
  readonly minify?: boolean
  readonly sourcemap?: boolean | "linked" | "inline" | "external"
  readonly external?: readonly string[]
  readonly writeMetafile?: boolean
}

export interface BunWrittenOutput {
  readonly files: readonly Artifact.File[]
  readonly metafile?: unknown
}

export interface BunCommandService {
  readonly build: (
    input: BunCommandBuildInput
  ) => Effect.Effect<BunWrittenOutput, BunCommandBuildError>

  readonly compileExecutable: (
    input: BunCompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, BunCompileError>

  readonly compileExecutableMatrix: (
    input: BunCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    BunMatrixError
  >
}

export class BunCommand extends Context.Service<
  BunCommand,
  BunCommandService
>()("effect-build-bun/Command") {}

export const layer: (
  options?: { readonly executable?: string }
) => Layer.Layer<
  BunCommand,
  BunToolNotFound | BunProbeFailed,
  CommandRequirements
>
```

### Deno declarations

```ts
// effect-build-deno/Api
export interface DenoApiService {
  readonly bundle: (
    options: Deno.bundle.Options
  ) => Effect.Effect<Deno.bundle.Result, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  DenoApiService
>()("effect-build-deno/Api") {}

export const layerCurrent: Layer.Layer<
  DenoApi,
  DenoApiUnavailable
>

// effect-build-deno/Command
export interface DenoCommandService {
  readonly bundle: (
    input: DenoBundleCommandInput
  ) => Effect.Effect<DenoWrittenOutput, DenoBundleCommandError>

  readonly compileExecutable: (
    input: DenoCompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, DenoCompileError>

  readonly compileExecutableMatrix: (
    input: DenoCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    DenoMatrixError
  >
}

export class DenoCommand extends Context.Service<
  DenoCommand,
  DenoCommandService
>()("effect-build-deno/Command") {}
```

### Esbuild declarations

```ts
// effect-build-esbuild/Api
export interface EsbuildContext<
  Options extends esbuild.BuildOptions
> {
  readonly rebuild: Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >

  readonly watch: (
    options?: esbuild.WatchOptions
  ) => Effect.Effect<void, EsbuildBuildError>

  readonly serve: (
    options: esbuild.ServeOptions
  ) => Effect.Effect<esbuild.ServeResult, EsbuildBuildError>
}

export interface EsbuildApiService {
  readonly build: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >

  readonly transform: <Options extends esbuild.TransformOptions>(
    input: string | Uint8Array,
    options?: Options
  ) => Effect.Effect<
    esbuild.TransformResult<Options>,
    EsbuildTransformError
  >

  readonly context: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    EsbuildContext<Options>,
    EsbuildBuildError,
    Scope.Scope
  >
}

export class EsbuildApi extends Context.Service<
  EsbuildApi,
  EsbuildApiService
>()("effect-build-esbuild/Api") {}

export const layer: Layer.Layer<
  EsbuildApi,
  EsbuildVersionMismatch
>
```

The scoped context hides direct `dispose()`. Its finalizer performs
`cancel()` followed by `dispose()` exactly once.

### Node SEA declarations

```ts
// effect-build-node-sea/Command
export type NodeSeaMain =
  | {
      readonly _tag: "File"
      readonly path: string
      readonly format: "commonjs" | "module"
    }
  | {
      readonly _tag: "Bytes"
      readonly contents: Uint8Array
      readonly format: "commonjs" | "module"
      readonly sourceName?: string
    }

export interface CreateExecutableInput {
  readonly main: NodeSeaMain
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly executable?: string
  readonly assets?: Readonly<Record<string, string>>
  readonly useSnapshot?: boolean
  readonly useCodeCache?: boolean
  readonly execArgv?: readonly string[]
  readonly execArgvExtension?: "none" | "env" | "cli"
}

export interface NodeSeaCommandService {
  readonly createExecutable: (
    input: CreateExecutableInput
  ) => Effect.Effect<Artifact.Executable, NodeSeaError>
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  NodeSeaCommandService
>()("effect-build-node-sea/Command") {}
```

An in-memory main is materialized privately before Node reads it. A file main is
canonicalized and copied into private staging before syntax check and assembly.

### Usage

```ts
const browserBuild = BunApi.use((bun) =>
  bun.build({
    entrypoints: ["src/client.tsx"],
    target: "browser",
    outdir: "dist/client",
    splitting: true,
    plugins: [cssPlugin]
  })
).pipe(Effect.provide(BunApiLayer))

const serverBuild = EsbuildApi.use((esbuild) =>
  esbuild.build({
    entryPoints: ["src/server.ts"],
    platform: "node",
    bundle: true,
    write: false,
    metafile: true
  })
).pipe(Effect.provide(EsbuildLayer))

const denoExecutable = DenoCommand.use((deno) =>
  deno.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "linux-x64-gnu",
    permissions: { read: true, net: ["example.com"] }
  })
)
```

### Host and lifetime

- Bun API effects require Bun.
- Deno API effects require Deno and its runtime permission context.
- Esbuild build/transform run under supported API hosts; context is scoped.
- Command services require Effect process/filesystem/path implementations.
- Bun/Deno one-shot API interruption cannot promise provider cancellation.

### Provider extension

A new package defines its own direct services and uses core author subpaths for
process, temporary output, and durable publication. No common application
service must be implemented.

### 0.3 migration

- move current compile operations under provider `Command`;
- replace current Esbuild profile with full `Api`;
- broaden Node SEA input to existing bundled mains;
- delete `JavaScriptBundle.Artifact` and profile composition.

### Supported and excluded capability

Supported: maximum provider fidelity and coverage.

Excluded: unchanged application Layer substitution between Bun and Esbuild for
the already-demonstrated one-Node-program role.

### Public concepts

Introduces explicit `Api` and `Command` lanes. Removes `Integration`, `Provider`,
and temporary JavaScript artifact vocabulary. Adds no portable profile.

### Verdict

Coherent and substantially better than 0.3 for provider capability, but
incomplete for a generic library because it discards valid portable
composition.

---

## Candidate B: narrow `NodeProgramBundler` architecture

### Model

A portable core service for source to one temporary Node-compatible JavaScript
program is the primary application API. Bun and Esbuild provide Layers. Node
SEA consumes the program. Provider-native build APIs are secondary or omitted.

### Declarations

```ts
// effect-build
export namespace NodeProgram {
  export type Format = "esm" | "cjs"

  export interface Lease {
    readonly format: Format
    readonly resolutionTarget: "node"
    readonly digest: Artifact.Digest
    readonly externalImports: readonly string[]
    readonly steps: readonly BuildStepObservation[]

    readonly withFile: <A, E, R>(
      use: (
        file: Artifact.File
      ) => Effect.Effect<A, E, R>
    ) => Effect.Effect<A, NodeProgramExpired | E, R>
  }
}

export namespace NodeProgramBundler {
  export interface Request {
    readonly entrypoint: string
    readonly cwd?: string
    readonly format: NodeProgram.Format
  }

  export class Failure extends Data.TaggedError(
    "NodeProgramBundlingFailure"
  )<{
    readonly provider: string
    readonly diagnostics: readonly Diagnostic[]
    readonly providerError: unknown
  }> {}

  export interface Service {
    readonly withProgram: <A, E, R>(
      request: Request,
      use: (
        program: NodeProgram.Lease
      ) => Effect.Effect<A, E, R>
    ) => Effect.Effect<
      A,
      Failure | E,
      Exclude<R, Scope.Scope>
    >
  }

  export class NodeProgramBundler extends Context.Service<
    NodeProgramBundler,
    Service
  >()("effect-build/NodeProgramBundler") {}
}
```

Provider Layers:

```ts
export const BunNodeProgramLayer: Layer.Layer<
  NodeProgramBundler.NodeProgramBundler,
  BunToolError,
  CommandRequirements
>

export const EsbuildNodeProgramLayer: Layer.Layer<
  NodeProgramBundler.NodeProgramBundler,
  EsbuildVersionMismatch,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>
```

### Complete composition example

```ts
const program = NodeProgramBundler.NodeProgramBundler.use(
  (bundler) =>
    bundler.withProgram(
      {
        entrypoint: "src/main.ts",
        format: "esm"
      },
      (main) =>
        NodeSea.createExecutable({
          main,
          outfile: "dist/app"
        })
    )
)

const withBun = program.pipe(
  Effect.provide(BunNodeProgramLayer),
  Effect.provide(NodeSeaLayer),
  Effect.provide(NodeServices.layer)
)

const withEsbuild = program.pipe(
  Effect.provide(EsbuildNodeProgramLayer),
  Effect.provide(NodeSeaLayer),
  Effect.provide(NodeServices.layer)
)
```

### Direct provider escape hatch

```ts
Bun.withJavaScriptBundle(input, use)
Esbuild.withJavaScriptBundle(input, use)
```

In the strict form of this candidate, those remain narrow profile operations,
not full provider-native build APIs.

### Host and lifetime

The lease owns one temporary file and expires after its continuation. Bun uses
the process lane; Esbuild uses a cancellable context. The generic service can
promise the same cleanup and interruption behavior.

### Provider extension

A provider must implement exactly the one-entry, one-file, Node-resolution,
ESM/CJS profile and map its error into the common failure.

### 0.3 migration

Add the core service, adapt Bun and Esbuild, rename the artifact to a lease, and
keep Node SEA composition. Bun/Deno compile remain provider operations.

### Supported and excluded capability

Supported: the existing Bun/Esbuild to Node SEA topology and application Layer
substitution.

Excluded or demoted:

- Bun browser/Bun/HTML/CSS/assets/plugins/virtual inputs;
- Deno bundle and project semantics;
- Esbuild transform, multi-output build, plugins, loaders, context, rebuild,
  watch, and serve;
- Rolldown multi-output generation.

### Public concepts

Introduces one service, one request, one lease, and one normalized failure.
Retains provider direct profile methods. It does not explain provider-native
output sets.

### Verdict

Semantically valid for its narrow profile but invalid as the ontology of the
whole library. Its apparent simplicity is purchased by excluding most provider
capability.

---

## Candidate C: provider-native APIs plus portable profiles and recipes

This is the selected architecture.

### Core declarations

```ts
// effect-build/Command
export interface SelectedTool<Name extends string = string> {
  readonly name: Name
  readonly version: string
  readonly path: Artifact.LocalPath
}

export interface CommandOutput {
  readonly text: string
  readonly truncated: boolean
}

export interface CommandCompletion {
  readonly exitCode: number
  readonly stdout: CommandOutput
  readonly stderr: CommandOutput
}

export interface BoundCommand<Name extends string = string> {
  readonly tool: SelectedTool<Name>

  readonly run: (
    argv: readonly string[],
    options?: {
      readonly cwd?: string
      readonly env?: Readonly<Record<string, string>>
      readonly extendEnv?: boolean
    }
  ) => Effect.Effect<
    CommandCompletion,
    CommandExecutionError
  >
}

export const discover: <Name extends string>(
  specification: ToolSpecification<Name>
) => Effect.Effect<
  BoundCommand<Name>,
  ToolNotFound | ToolProbeFailed,
  ChildProcessSpawner.ChildProcessSpawner |
    FileSystem.FileSystem |
    Path.Path
>
```

```ts
// effect-build/TemporaryOutput
export interface BorrowedFile {
  readonly path: Artifact.LocalPath
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface BorrowedDirectory {
  readonly path: Artifact.LocalPath
}

export const withDirectory: <A, E, R>(
  options: {
    readonly prefix: string
    readonly publicationDestinations?: readonly string[]
  },
  use: (
    directory: BorrowedDirectory
  ) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  TemporaryOutputError | E,
  FileSystem.FileSystem |
    Path.Path |
    Exclude<R, Scope.Scope>
>

export const inspectFile: (
  path: string
) => Effect.Effect<
  BorrowedFile,
  TemporaryOutputError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>
```

`BorrowedFile` is valid only inside the owning continuation. The implementation
keeps the liveness authority private and returns a typed expired error when a
borrowed handle is used later.

```ts
// effect-build/Executable
export interface ProduceInput<Prepared, Steps> {
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean

  readonly prepare: () => Effect.Effect<Prepared, unknown, unknown>

  readonly produce: (
    prepared: Prepared,
    stagedOutfile: Artifact.LocalPath
  ) => Effect.Effect<Steps, unknown, unknown>

  readonly resolveSystemTarget: (
    observation: NativeExecutableObservation
  ) => Effect.Effect<SystemTarget, OutputInvalid>
}

export const produce: <Prepared, Steps>(
  input: ProduceInput<Prepared, Steps>
) => Effect.Effect<
  Artifact.Executable,
  ExecutableProductionError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>
```

```ts
// effect-build/CommandCompiler
export interface Definition<
  Self,
  Name extends string,
  Target extends SystemTarget,
  Options,
  Validated,
  Service,
  Requirements
> {
  readonly name: Name
  readonly service: Context.Service<Self, Service>
  readonly targets: readonly Target[]
  readonly probe: ToolSpecification<Name>

  readonly validateOptions: (
    options: Options
  ) => Effect.Effect<Validated, InvalidCompilerOptions>

  readonly render: (
    input: PreparedCompileInput<Validated, Target>,
    stagedOutfile: Artifact.LocalPath
  ) => readonly string[]

  readonly makeService: (
    context: CommandCompilerContext<Name, Target, Options>
  ) => Effect.Effect<Service, never, Requirements>
}

export const define: <...>(
  definition: Definition<...>
) => DefinedCommandCompiler<...>
```

There is no reflection over arbitrary service methods. The Effectful constructor
states its requirements.

### Portable profile declarations

```ts
// effect-build/Profile/SingleNodeProgram
export namespace SingleNodeProgram {
  export type Format = "esm" | "cjs"

  export interface Request {
    readonly entrypoint: string
    readonly cwd?: string
    readonly format: Format
  }

  export interface Borrowed {
    readonly format: Format
    readonly resolutionTarget: "node"
    readonly digest: Artifact.Digest
    readonly externalImportObservations: readonly string[]
    readonly steps: readonly BuildStepObservation[]

    readonly withFile: <A, E, R>(
      use: (
        file: TemporaryOutput.BorrowedFile
      ) => Effect.Effect<A, E, R>
    ) => Effect.Effect<A, BorrowedProgramExpired | E, R>
  }

  export class Failure extends Data.TaggedError(
    "SingleNodeProgramFailure"
  )<{
    readonly provider: string
    readonly kind:
      | "invalid-request"
      | "tool-unavailable"
      | "build-failed"
      | "invalid-output"
      | "host-io"
    readonly diagnostics: readonly Diagnostic[]
    readonly providerError: unknown
  }> {}

  export interface Service {
    readonly withProgram: <A, E, R>(
      request: Request,
      use: (
        program: Borrowed
      ) => Effect.Effect<A, E, R>
    ) => Effect.Effect<
      A,
      Failure | E,
      Exclude<R, Scope.Scope>
    >
  }

  export class Bundler extends Context.Service<
    Bundler,
    Service
  >()("effect-build/Profile/SingleNodeProgram/Bundler") {}

  export const withProgram: Service["withProgram"] = (
    request,
    use
  ) => Bundler.use((bundler) =>
    bundler.withProgram(request, use)
  )
}
```

### Provider-native Bun declarations

```ts
// effect-build-bun/Api
export interface Service {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunApiError>

  readonly compileExecutable: (
    options: Bun.CompileBuildOptions
  ) => Effect.Effect<
    Artifact.Executable,
    BunApiError | ExecutablePublicationError
  >
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

```ts
// effect-build-bun/Command
export interface Service {
  readonly build: (
    input: BuildInput
  ) => Effect.Effect<WrittenOutput, BuildError>

  readonly compileExecutable: (
    input: CompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, CompileError>

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    MatrixError
  >

  readonly withSingleNodeProgram: <A, E, R>(
    input: SingleNodeProgramInput,
    use: (
      program: SingleNodeProgram.Borrowed
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    BunSingleNodeProgramError | E,
    Exclude<R, Scope.Scope>
  >
}

export class BunCommand extends Context.Service<
  BunCommand,
  Service
>()("effect-build-bun/Command") {}
```

```ts
// effect-build-bun/Profile/SingleNodeProgram
export const layer: (
  options?: BunCommandLayerOptions
) => Layer.Layer<
  SingleNodeProgram.Bundler,
  BunToolNotFound | BunProbeFailed,
  CommandRequirements
>

export const isBunFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "bun"
  readonly providerError: BunSingleNodeProgramError
}
```

### Provider-native Deno declarations

```ts
// effect-build-deno/Api
export interface Service {
  readonly bundle: (
    options: Deno.bundle.Options
  ) => Effect.Effect<Deno.bundle.Result, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  Service
>()("effect-build-deno/Api") {}
```

```ts
// effect-build-deno/Command
export interface Service {
  readonly bundle: (
    input: BundleInput
  ) => Effect.Effect<WrittenOutput, BundleError>

  readonly compileExecutable: (
    input: CompileExecutableInput
  ) => Effect.Effect<Artifact.Executable, CompileError>

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    MatrixError
  >
}

export class DenoCommand extends Context.Service<
  DenoCommand,
  Service
>()("effect-build-deno/Command") {}
```

### Provider-native Esbuild declarations

```ts
// effect-build-esbuild/Api
export interface ContextHandle<
  Options extends esbuild.BuildOptions
> {
  readonly rebuild: Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >
  readonly watch: (
    options?: esbuild.WatchOptions
  ) => Effect.Effect<void, EsbuildBuildError>
  readonly serve: (
    options: esbuild.ServeOptions
  ) => Effect.Effect<esbuild.ServeResult, EsbuildBuildError>
}

export interface Service {
  readonly build: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >

  readonly transform: <Options extends esbuild.TransformOptions>(
    input: string | Uint8Array,
    options?: Options
  ) => Effect.Effect<
    esbuild.TransformResult<Options>,
    EsbuildTransformError
  >

  readonly context: <Options extends esbuild.BuildOptions>(
    options: Options
  ) => Effect.Effect<
    ContextHandle<Options>,
    EsbuildBuildError,
    Scope.Scope
  >

  readonly withSingleNodeProgram: <A, E, R>(
    input: SingleNodeProgramInput,
    use: (
      program: SingleNodeProgram.Borrowed
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    EsbuildSingleNodeProgramError | E,
    Exclude<R, Scope.Scope>
  >
}

export class EsbuildApi extends Context.Service<
  EsbuildApi,
  Service
>()("effect-build-esbuild/Api") {}
```

```ts
// effect-build-esbuild/Profile/SingleNodeProgram
export const layer: Layer.Layer<
  SingleNodeProgram.Bundler,
  EsbuildVersionMismatch,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>

export const isEsbuildFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "esbuild"
  readonly providerError: EsbuildSingleNodeProgramError
}
```

### Node SEA direct API and recipe

```ts
// effect-build-node-sea/Command
export interface MainFile {
  readonly path: string
  readonly format: "commonjs" | "module"
}

export interface CreateExecutableInput {
  readonly main: MainFile
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: Readonly<Record<string, string>>
  readonly executable?: string
  readonly useSnapshot?: boolean
  readonly useCodeCache?: boolean
  readonly execArgv?: readonly string[]
  readonly execArgvExtension?: "none" | "env" | "cli"
}

export interface Service {
  readonly createExecutable: (
    input: CreateExecutableInput
  ) => Effect.Effect<Artifact.Executable, NodeSeaError>
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  Service
>()("effect-build-node-sea/Command") {}
```

```ts
// effect-build-node-sea/Recipe/SingleNodeProgram
export interface RecipeInput {
  readonly program: SingleNodeProgram.Request
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly assets?: Readonly<Record<string, string>>
}

export const createExecutable: (
  input: RecipeInput
) => Effect.Effect<
  Artifact.Executable,
  SingleNodeProgram.Failure | NodeSeaError,
  SingleNodeProgram.Bundler | NodeSeaCommand
> =>
  SingleNodeProgram.withProgram(
    input.program,
    (program) =>
      program.withFile((file) =>
        NodeSeaCommand.use((nodeSea) =>
          nodeSea.createExecutable({
            main: {
              path: file.path,
              format:
                program.format === "esm"
                  ? "module"
                  : "commonjs"
            },
            outfile: input.outfile,
            cwd: input.cwd,
            digest: input.digest,
            assets: input.assets
          })
        )
      )
  )
```

The recipe chooses no producer. The application provides Bun or Esbuild's
profile Layer.

### Complete generic usage

```ts
import { Effect } from "effect"
import { NodeServices } from "@effect/platform-node"
import * as SingleNodeProgram from
  "effect-build/Profile/SingleNodeProgram"
import * as BunProfile from
  "effect-build-bun/Profile/SingleNodeProgram"
import * as EsbuildProfile from
  "effect-build-esbuild/Profile/SingleNodeProgram"
import * as NodeSea from
  "effect-build-node-sea/Recipe/SingleNodeProgram"
import * as NodeSeaCommand from
  "effect-build-node-sea/Command"

const build = NodeSea.createExecutable({
  program: {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  outfile: "dist/app",
  digest: true
})

const withBun = build.pipe(
  Effect.provide(BunProfile.layer()),
  Effect.provide(NodeSeaCommand.layer()),
  Effect.provide(NodeServices.layer)
)

const withEsbuild = build.pipe(
  Effect.provide(EsbuildProfile.layer),
  Effect.provide(NodeSeaCommand.layer()),
  Effect.provide(NodeServices.layer)
)
```

The `build` value is unchanged.

### Complete direct-provider usage

```ts
const bunBrowser = BunApi.use((bun) =>
  bun.build({
    entrypoints: ["src/client.tsx"],
    target: "browser",
    outdir: "dist/client",
    splitting: true,
    plugins: [frameworkPlugin]
  })
)

const esbuildWatch = Effect.scoped(
  EsbuildApi.use((esbuild) =>
    Effect.gen(function*() {
      const context = yield* esbuild.context({
        entryPoints: ["src/server.ts"],
        platform: "node",
        bundle: true,
        outdir: "dist/server"
      })
      yield* context.watch()
      return yield* Effect.never
    })
  )
)

const denoProject = DenoCommand.use((deno) =>
  deno.compileExecutable({
    entrypoint: ".",
    outfile: "dist/deno-app",
    target: "linux-x64-gnu",
    permissions: { all: false, read: true },
    include: ["public"],
    engine: "v8"
  })
)
```

### Host and lifetime

- Provider API services document and enforce host availability.
- Command services require Effect platform process/filesystem capabilities.
- Esbuild context and borrowed program resources require Scope.
- Portable profile implementations must meet the profile's stronger cleanup and
  interruption contract; a non-cancellable one-shot host API is not silently
  substituted.

### Provider extension

A provider:

1. exposes its direct `Api` and/or `Command` service;
2. reuses core author APIs for shared mechanics;
3. optionally implements a named profile in a separate subpath;
4. maps only its own failures into the profile failure;
5. retains provider-specific results, graphs, plugins, and errors on the direct
   path.

### 0.3 migration

One 0.4 hard cut:

```text
Integration -> Command + TemporaryOutput + Executable
Provider    -> CommandCompiler
withJavaScriptBundle -> provider withSingleNodeProgram
JavaScriptBundle.Artifact -> SingleNodeProgram.Borrowed
Compiler services -> explicit Api / Command services
compileExecutable -> provider Command module
Node SEA live-artifact-only input -> direct file input + profile recipe
```

No compatibility aliases are required pre-1.0.

### Supported and excluded capability

Supported:

- provider-native rich APIs;
- command-backed runtime independence;
- narrow Layer substitution;
- in-memory and written outputs where providers support them;
- incremental contexts;
- direct executable compilation and assembly;
- exact provider errors plus normalized profile failures.

Excluded:

- universal plugin API;
- universal output graph;
- universal executable builder;
- automatic fallback/provider registry;
- plans, CAS, remote execution, and caching.

### Public concepts

Introduces lane modules and one optional profile. Removes broad author names and
temporary-artifact terminology. It has the largest initial implementation cost
but the smallest semantic omission relative to the product goal.

### Verdict

Selected. It is the only candidate that preserves both provider capability and
truthful portable composition.

---

## Candidate D: structural protocols without application Context services

### Model

Provider packages expose direct services plus operation objects satisfying
shared structural interfaces. Generic libraries receive those objects as
ordinary values instead of asking Effect Context for a role.

### Declarations

```ts
export interface Operation<in I, out O, out E, out R> {
  readonly run: (
    input: I
  ) => Effect.Effect<O, E, R>
}

export interface ScopedOperation<
  in I,
  out O,
  out E,
  out R
> {
  readonly use: <A, E2, R2>(
    input: I,
    use: (
      output: O
    ) => Effect.Effect<A, E2, R2>
  ) => Effect.Effect<
    A,
    E | E2,
    R | Exclude<R2, Scope.Scope>
  >
}

export type SingleNodeProgramOperation<E, R> =
  ScopedOperation<
    SingleNodeProgram.Request,
    SingleNodeProgram.Borrowed,
    E,
    R
  >
```

Provider values:

```ts
export const bunSingleNodeProgram:
  SingleNodeProgramOperation<
    BunSingleNodeProgramError,
    BunCommand
  >

export const esbuildSingleNodeProgram:
  SingleNodeProgramOperation<
    EsbuildSingleNodeProgramError,
    EsbuildApi
  >
```

### Complete usage

```ts
const makeBuild = <E, R>(
  bundler: SingleNodeProgramOperation<E, R>
) =>
  bundler.use(
    {
      entrypoint: "src/main.ts",
      format: "esm"
    },
    (program) =>
      program.withFile((file) =>
        NodeSeaCommand.createExecutable({
          main: { path: file.path, format: "module" },
          outfile: "dist/app"
        })
      )
  )

const bunBuild = makeBuild(bunSingleNodeProgram)
const esbuildBuild = makeBuild(esbuildSingleNodeProgram)
```

### Direct provider escape hatch

The same direct `Api` and `Command` services as Candidate C remain.

### Host and lifetime

The protocol can preserve the borrowed continuation. Requirements and errors
become generic parameters on every helper. Provider services still need Layers.

### Provider extension

Export another structural operation object. Type compatibility alone does not
prove semantic profile compliance; tests and documentation must do so.

### 0.3 migration

Add structural operation types, export Bun/Esbuild operation values, and rename
the borrowed program. Do not add a generic Context tag.

### Supported and excluded capability

Supports integration-author abstraction and explicit value substitution.
Excludes the idiomatic Effect application pattern where the program depends on
a service and the Layer chooses the provider.

### Public concepts

Adds structural protocol objects in addition to direct provider services.
Provider requirements and error types spread through generic helper signatures.

### Verdict

Coherent but incomplete as the main generic API. Structural helpers may be
private implementation tools inside profile adapters.

---

## Candidate E: generalized transformation/capability algebra

### Model

Every build operation is a typed transformation from input to output, with
separate persistent and borrowing forms. Combinators build pipelines.

### Declarations

```ts
export interface Transformation<
  in I,
  out O,
  out E,
  out R
> {
  readonly name: string
  readonly execute: (
    input: I
  ) => Effect.Effect<O, E, R>
}

export interface BorrowingTransformation<
  in I,
  out O,
  out E,
  out R
> {
  readonly name: string
  readonly use: <A, E2, R2>(
    input: I,
    consume: (
      output: O
    ) => Effect.Effect<A, E2, R2>
  ) => Effect.Effect<
    A,
    E | E2,
    R | Exclude<R2, Scope.Scope>
  >
}

export const composeBorrowing = <
  I,
  M,
  O,
  E1,
  E2,
  R1,
  R2
>(
  first: BorrowingTransformation<I, M, E1, R1>,
  second: Transformation<M, O, E2, R2>
): Transformation<I, O, E1 | E2, R1 | R2> => ({
  name: `${first.name} -> ${second.name}`,
  execute: (input) =>
    first.use(input, (middle) =>
      second.execute(middle)
    )
})
```

Provider values:

```ts
export const bunCompile:
  Transformation<
    BunCompileInput,
    Artifact.Executable,
    BunCompileError,
    BunCommand
  >

export const denoCompile:
  Transformation<
    DenoCompileInput,
    Artifact.Executable,
    DenoCompileError,
    DenoCommand
  >

export const esbuildSingleNodeProgram:
  BorrowingTransformation<
    SingleNodeProgram.Request,
    SingleNodeProgram.Borrowed,
    EsbuildSingleNodeProgramError,
    EsbuildApi
  >

export const nodeSea:
  Transformation<
    SingleNodeProgram.Borrowed,
    Artifact.Executable,
    NodeSeaError,
    NodeSeaCommand
  >
```

### Complete usage

```ts
const build = composeBorrowing(
  esbuildSingleNodeProgram,
  nodeSea
).execute({
  entrypoint: "src/main.ts",
  format: "esm"
})
```

### Direct provider escape hatch

All direct services remain, so every operation has both a method and a
transformation-object representation.

### Host and lifetime

Type parameters can represent requirements and the borrowing callback can
preserve lifetime. The algebra does not itself select or provide Layers.

### Provider extension

Export another transformation object. Composition is allowed whenever TypeScript
input/output types line up, even if runtime target or completeness semantics do
not.

### 0.3 migration

Wrap every provider operation in transformation objects and add combinators.
Existing direct methods either remain duplicate representations or are deleted
in favor of less discoverable objects.

### Supported and excluded capability

The algebra can represent every topology syntactically. It does not supply a
truthful universal vocabulary for provider options, output graphs, targets, or
lifetime beyond the types already needed by direct operations.

### Public concepts

Adds transformation objects, borrowing variants, combinators, and pervasive
input/output/error/requirement parameters. It removes no underlying provider
branch and duplicates Effect's function/service/Layer composition.

### Verdict

Rejected because implementation and conceptual cost exceed the complexity it
removes.

## Cross-candidate summary

| Candidate | Provider-native coverage | Portable Layer substitution | Direct errors/options | Scoped incremental resources | Main defect |
|---|---|---|---|---|---|
| A. Provider-native only | Full | No | Full | Full | Omits valid generic composition |
| B. Narrow Node program | Narrow | Yes | Partial | Profile only | Treats one executable recipe as library ontology |
| C. Native plus profiles/recipes | Full | Yes, where truthful | Full | Full | More modules and implementation work |
| D. Structural protocols | Full | Value substitution, not Context | Full | Possible | Weak discoverability and pervasive generics |
| E. Transformation algebra | Syntactically full | Via objects/combinators | Duplicated | Possible | Second composition language with role erasure |

## Recommendation

Implement Candidate C.

The first production PR should not add the portable profile. It should first
split the shared author authorities and establish provider lane foundations
without changing behavior. Provider-native surfaces then land in independent
PRs. The portable profile is added only after the direct APIs exist, so it is
visibly an adapter instead of the provider's canonical model.

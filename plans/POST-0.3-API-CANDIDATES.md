# Post-0.3 public API candidates

Status: final architecture type study. These declarations are not production
source, but they are concrete enough to guide implementation and expose each
candidate's package, host, lifetime, error, and extension cost.

## Shared vocabulary used by the sketches

```ts
import {
  Context,
  Crypto,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
  Result,
  Schema,
  Scope,
  Stream
} from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

export const SystemTarget = Schema.Literals([
  "linux-x64-gnu",
  "linux-x64-musl",
  "linux-aarch64-gnu",
  "macos-x64",
  "macos-aarch64",
  "windows-x64",
  "windows-aarch64"
] as const)
export type SystemTarget = typeof SystemTarget.Type

export namespace HostPath {
  export type Absolute = string & {
    readonly "~effect-build/HostPath/Absolute": unique symbol
  }

  export class ObservationFailed extends Data.TaggedError(
    "HostPathObservationFailed"
  )<{
    readonly input: string
    readonly operation: "realpath" | "stat"
    readonly reason: string
  }> {}

  export const existing: (
    input: string
  ) => Effect.Effect<
    Absolute,
    ObservationFailed,
    FileSystem.FileSystem | Path.Path
  >
}

export interface BuildStepObservation {
  readonly operation: string
  readonly tool: {
    readonly name: string
    readonly version: string
    readonly path?: HostPath.Absolute
  }
}

export namespace Artifact {
  export const Digest: Schema.Schema<`sha256:${string}`>
  export type Digest = typeof Digest.Type

  export interface File {
    readonly path: HostPath.Absolute
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface Executable<
    Steps extends readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ] = readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ]
  > extends File {
    readonly systemTarget: SystemTarget
    readonly steps: Steps
  }
}

export interface Diagnostic {
  readonly severity: "error" | "warning"
  readonly message: string
  readonly code?: string
  readonly location?: {
    readonly file: string
    readonly line: number
    readonly column: number
  }
}
```

Repeated names such as `Service` and `layer` below belong to separate package
subpath modules. Every candidate preserves one-way provider dependencies,
provider direct errors/options unless explicitly excluded, interruption as
interruption, and no universal source-or-bundle executable union.

---

# Candidate A: provider-native Effect APIs only

## Model and ownership

Core publishes durable observations and author mechanics. Provider packages
publish direct `Api` and/or `Command` services. Applications choose providers
explicitly. No portable application service exists.

### `effect-build-bun/Api`

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

Host: Bun. The operation preserves provider output/log/plugin values and makes
no one-shot cancellation or rollback claim.

### `effect-build-bun/Command`

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
  ) => Effect.Effect<
    readonly Artifact.Executable[],
    BunMatrixError
  >
}

export class BunCommand extends Context.Service<
  BunCommand,
  Service
>()("effect-build-bun/Command") {}

export const layer: (
  options?: BunCommandLayerOptions
) => Layer.Layer<
  BunCommand,
  BunToolNotFound | BunProbeFailed,
  BunCommandRequirements
>
```

Host: any supported process-capable Effect platform plus selected Bun.
Command build has provider-written output-set semantics. Command compile uses
core single-file staging, native validation, and atomic publication.

### `effect-build-deno/Api`

The package owns an isolated structural declaration matching the pinned official
unstable API:

```ts
export interface DenoBundleOptions {
  entrypoints: string[]
  outputPath?: string
  outputDir?: string
  external?: string[]
  format?: "esm" | "cjs" | "iife"
  minify?: boolean
  keepNames?: boolean
  codeSplitting?: boolean
  inlineImports?: boolean
  packages?: "bundle" | "external"
  sourcemap?: "linked" | "inline" | "external"
  platform?: "browser" | "deno"
  write?: boolean
}

export interface DenoBundleMessageLocation {
  file: string
  namespace?: string
  line: number
  column: number
  length: number
  suggestion?: string
}

export interface DenoBundleMessage {
  text: string
  location?: DenoBundleMessageLocation
  notes?: Array<{
    text: string
    location?: DenoBundleMessageLocation
  }>
}

export interface DenoBundleOutputFile {
  path: string
  contents?: Uint8Array<ArrayBuffer>
  hash: string
  text(): string
}

export interface DenoBundleResult {
  errors: DenoBundleMessage[]
  warnings: DenoBundleMessage[]
  success: boolean
  outputFiles?: DenoBundleOutputFile[]
}

export interface Service {
  readonly bundle: (
    options: DenoBundleOptions
  ) => Effect.Effect<DenoBundleResult, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  Service
>()("effect-build-deno/Api") {}

export const layerCurrent: Layer.Layer<
  DenoApi,
  DenoApiUnavailable
>
```

Host: Deno with required unstable flag and permissions. The Layer checks
availability but grants no authority.

### `effect-build-deno/Command`

```ts
export interface Service {
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
  Service
>()("effect-build-deno/Command") {}
```

The bundle request includes declaration output. Compile remains provider-specific
for permissions, includes, workers, project/framework behavior, engine/runtime,
arguments, and target.

### `effect-build-esbuild/Api`

```ts
import type * as esbuild from "esbuild"

export interface ContextHandle<
  Options extends esbuild.BuildOptions
> {
  readonly rebuild: Effect.Effect<
    esbuild.BuildResult<Options>,
    EsbuildBuildError
  >

  readonly watch: (
    options?: esbuild.WatchOptions
  ) => Effect.Effect<void, EsbuildContextError>

  readonly serve: (
    options?: esbuild.ServeOptions
  ) => Effect.Effect<esbuild.ServeResult, EsbuildContextError>

  readonly cancel: Effect.Effect<void, EsbuildContextError>
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
    EsbuildContextError,
    Scope.Scope
  >
}

export class EsbuildApi extends Context.Service<
  EsbuildApi,
  Service
>()("effect-build-esbuild/Api") {}

export const layer: Layer.Layer<
  EsbuildApi,
  EsbuildVersionMismatch
>
```

`watch()`/`serve()` start provider state and return. Scope owns the context and
hidden `dispose()`; the finalizer calls cancel then dispose.

### `effect-build-node-sea/Command`

```ts
export type Main =
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
  readonly main: Main
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly targetNodeExecutable?: string
  readonly assets?: Readonly<Record<string, string>>
  readonly disableExperimentalSEAWarning?: boolean
  readonly useSnapshot?: boolean
  readonly useCodeCache?: boolean
  readonly execArgv?: readonly string[]
  readonly execArgvExtension?: "none" | "env" | "cli"
}

export interface Service {
  readonly createExecutable: (
    input: CreateExecutableInput
  ) => Effect.Effect<Artifact.Executable, NodeSeaCreateError>
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  Service
>()("effect-build-node-sea/Command") {}
```

## Complete usage

```ts
const client = BunApi.use((bun) =>
  bun.build({
    entrypoints: ["src/client.tsx"],
    outdir: "dist/client",
    target: "browser",
    splitting: true,
    plugins: [frameworkPlugin]
  })
)

const esbuildWatch = Effect.scoped(
  EsbuildApi.use((esbuild) =>
    Effect.gen(function* () {
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

const denoExecutable = DenoCommand.use((deno) =>
  deno.compileExecutable({
    entrypoint: ".",
    outfile: "dist/deno-app",
    target: "linux-x64-gnu",
    permissions: { read: true },
    include: ["public"]
  })
)
```

## Extension and migration

A new provider adds its direct Api/Command package modules and uses core author
mechanics only where those guarantees fit. Migration moves 0.3 Bun/Deno compile
under Command, replaces the fixed Esbuild profile with full Api, broadens Node
SEA input, and removes the live artifact. No portable service is added.

## Falsifier and verdict

Falsifier: two materially different providers satisfy one useful request,
borrowed result, lifetime, interruption, and application Layer contract. Bun
and Esbuild satisfy it for the released one-main Node profile.

**Verdict: coherent but incomplete. Strongest rejected alternative.**

---

# Candidate B: root `NodeProgramBundler` ontology

## Model and declaration

```ts
export namespace NodeProgram {
  export interface Borrowed {
    readonly format: "esm" | "cjs"
    readonly resolutionTarget: "node"
    readonly digest: Artifact.Digest
    readonly externalImportObservations: readonly string[]
    readonly steps: readonly BuildStepObservation[]

    readonly withFile: <A, E, R>(
      use: (file: {
        readonly path: HostPath.Absolute
        readonly bytes: number
        readonly digest: Artifact.Digest
      }) => Effect.Effect<A, E, R>
    ) => Effect.Effect<
      A,
      NodeProgramExpired | E,
      Exclude<R, Scope.Scope>
    >
  }
}

export namespace NodeProgramBundler {
  export interface Request {
    readonly entrypoint: string
    readonly cwd?: string
    readonly format: "esm" | "cjs"
  }

  export class Failure extends Data.TaggedError(
    "NodeProgramBundlingFailure"
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
        program: NodeProgram.Borrowed
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
  >()("effect-build/NodeProgramBundler") {}
}
```

Bun and Esbuild provide Layers. Node SEA consumes the borrowed value.

## Usage

```ts
const build = NodeProgramBundler.Bundler.use((bundler) =>
  bundler.withProgram(
    { entrypoint: "src/main.ts", format: "esm" },
    (main) =>
      main.withFile((file) =>
        NodeSeaCommand.use((nodeSea) =>
          nodeSea.createExecutable({
            main: {
              _tag: "File",
              path: file.path,
              format: "module"
            },
            outfile: "dist/app"
          })
        )
      )
  )
)
```

## Ownership, extension, migration, and exclusions

Core owns the root service and borrowed value; providers supply Layers. A new
provider must implement exactly the one-main Node profile. Migration makes the
profile the main public path.

It excludes multi-entry/output, browser/Bun/Deno targets, HTML/CSS/assets,
declarations, plugins/loaders, Esbuild transform/context/watch, Bun-runtime and
Deno-runtime executable breadth, and Rolldown output configurations.

**Verdict: the profile is semantically valid; the product-wide ontology is
rejected because it omits substantial provider capability.**

---

# Candidate C: provider-native APIs plus profiles and recipes

This is the selected architecture. It retains Candidate A's direct provider
services and adds precise core author modules plus one narrow portable profile.

## Core author APIs

### `effect-build/Author/Command`

```ts
export interface RunOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly extendEnv?: boolean
}

export interface Completion {
  readonly exitCode: number
  readonly stdout: { readonly text: string; readonly truncated: boolean }
  readonly stderr: { readonly text: string; readonly truncated: boolean }
}

export interface ToolSpecification<Name extends string> {
  readonly name: Name
  readonly executable?: string
  readonly probeArgv: readonly string[]
  readonly decodeProbe: (
    completion: Completion
  ) => Effect.Effect<
    { readonly version: string; readonly path: string },
    ToolProbeFailed
  >
}

export interface Running {
  readonly stdout: Stream.Stream<Uint8Array, CommandExecutionError>
  readonly stderr: Stream.Stream<Uint8Array, CommandExecutionError>
  readonly exitCode: Effect.Effect<number, CommandExecutionError>
}

export interface Selected<Name extends string> {
  readonly tool: {
    readonly name: Name
    readonly version: string
    readonly path: HostPath.Absolute
  }

  readonly run: (
    argv: readonly string[],
    options?: RunOptions
  ) => Effect.Effect<Completion, CommandExecutionError>

  readonly start: (
    argv: readonly string[],
    options?: RunOptions
  ) => Effect.Effect<
    Running,
    CommandExecutionError,
    Scope.Scope
  >
}

export const discover: <const Name extends string>(
  specification: ToolSpecification<Name>
) => Effect.Effect<
  Selected<Name>,
  ToolNotFound | ToolProbeFailed,
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
>
```

`discover` canonicalizes/verifies the returned probe path through
`HostPath.existing`; provider authors do not cast it.

### `effect-build/Author/TemporaryOutput`

```ts
export interface Directory {
  readonly path: HostPath.Absolute
}

export interface File {
  readonly path: HostPath.Absolute
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export const withDirectory: <A, E, R>(
  options: {
    readonly prefix: string
    readonly protectedDestinations?: readonly string[]
  },
  use: (directory: Directory) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  TemporaryOutputError | E,
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<R, Scope.Scope>
>

export const inspectFile: (
  owner: Directory,
  relativePath: string
) => Effect.Effect<
  File,
  TemporaryOutputError,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
>
```

### `effect-build/Author/Executable`

```ts
export interface NativeObservation {
  readonly format: "elf" | "macho" | "pe"
  readonly os: "linux" | "macos" | "windows"
  readonly architecture: "x64" | "aarch64"
  readonly abi?: "gnu" | "musl"
}

export interface Candidate {
  readonly path: HostPath.Absolute
}

export interface ProduceInput<
  Prepared,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  PrepareError,
  ProduceError,
  TargetError,
  PrepareRequirements,
  ProduceRequirements
> {
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly executableSuffix?: "" | ".exe"

  readonly prepare: () => Effect.Effect<
    Prepared,
    PrepareError,
    PrepareRequirements
  >

  readonly produce: (
    prepared: Prepared,
    candidate: Candidate
  ) => Effect.Effect<Steps, ProduceError, ProduceRequirements>

  readonly resolveSystemTarget: (
    observation: NativeObservation
  ) => Effect.Effect<SystemTarget, TargetError>
}

export const produce: <
  Prepared,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  PrepareError,
  ProduceError,
  TargetError,
  PrepareRequirements,
  ProduceRequirements
>(
  input: ProduceInput<
    Prepared,
    Steps,
    PrepareError,
    ProduceError,
    TargetError,
    PrepareRequirements,
    ProduceRequirements
  >
) => Effect.Effect<
  Artifact.Executable<Steps>,
  | PrepareError
  | ProduceError
  | TargetError
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed,
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | PrepareRequirements
  | ProduceRequirements
>
```

### `effect-build/Author/CommandCompiler`

```ts
export interface CompileExecutableInput<
  Options,
  Target extends SystemTarget
> {
  readonly entrypoint: string
  readonly outfile: string
  readonly cwd?: string
  readonly target?: Target
  readonly digest?: boolean
  readonly options?: Options
}

export interface CompileExecutableMatrixInput<
  Options,
  Target extends SystemTarget
> {
  readonly entrypoint: string
  readonly outdir: string
  readonly name: string
  readonly targets: readonly [Target, ...Target[]]
  readonly cwd?: string
  readonly digest?: boolean
  readonly concurrency?: number
  readonly options?: Options
}

export interface ServiceContext<
  Name extends string,
  Options,
  Target extends SystemTarget,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ]
> {
  readonly command: Command.Selected<Name>
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, Target>
  ) => Effect.Effect<Artifact.Executable<Steps>, CommandCompilerBuildError>
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<Options, Target>
  ) => Effect.Effect<
    readonly Artifact.Executable<Steps>[],
    CommandCompilerMatrixError
  >
}

export interface Definition<
  Self,
  Name extends string,
  Options,
  Validated,
  Target extends SystemTarget,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  Service,
  MakeError,
  MakeRequirements
> {
  readonly name: Name
  readonly tag: Context.Service<Self, Service>
  readonly tool: Command.ToolSpecification<Name>
  readonly targets: readonly [Target, ...Target[]]
  readonly defaultTarget?: Target
  readonly validateOptions: (
    input: unknown
  ) => Result.Result<Validated, InvalidCompilerOptions>
  readonly renderArgv: (
    input: {
      readonly entrypoint: string
      readonly target?: Target
      readonly options: Validated
    },
    stagedOutfile: HostPath.Absolute
  ) => readonly string[]
  readonly interpretFailure: (
    completion: Command.Completion
  ) => CommandCompilerToolFailed
  readonly steps: (
    tool: Command.Selected<Name>["tool"]
  ) => Steps
  readonly makeService: (
    context: ServiceContext<Name, Options, Target, Steps>
  ) => Effect.Effect<Service, MakeError, MakeRequirements>
}

export const define: <
  Self,
  const Name extends string,
  Options,
  Validated,
  Target extends SystemTarget,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  Service,
  MakeError,
  MakeRequirements
>(
  definition: Definition<
    Self,
    Name,
    Options,
    Validated,
    Target,
    Steps,
    Service,
    MakeError,
    MakeRequirements
  >
) => Defined<
  Self,
  Options,
  Target,
  Steps,
  ToolNotFound | ToolProbeFailed | MakeError,
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | MakeRequirements
>
```

There is no reflection over service methods. Pure option validation preserves
deterministic preflight before staging or child work.

## Portable profile

```ts
// effect-build/Profile/SingleNodeProgram
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}

export interface Borrowed<
  Steps extends readonly BuildStepObservation[] =
    readonly BuildStepObservation[]
> {
  readonly protocol: "effect-build/SingleNodeProgram@1"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly digest: Artifact.Digest
  readonly externalImportObservations: readonly string[]
  readonly steps: Steps

  readonly withFile: <A, E, R>(
    use: (file: {
      readonly path: HostPath.Absolute
      readonly bytes: number
      readonly digest: Artifact.Digest
    }) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    BorrowedProgramExpired | E,
    Exclude<R, Scope.Scope>
  >
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
) => Bundler.use((bundler) => bundler.withProgram(request, use))
```

## Provider profile modules

```ts
// effect-build-bun/Profile/SingleNodeProgram
export const withProgram: <A, E, R>(
  input: SingleNodeProgram.Request,
  use: (
    program: SingleNodeProgram.Borrowed
  ) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  BunSingleNodeProgramError | E,
  BunCommand | Exclude<R, Scope.Scope>
>

export const layer: (
  options?: BunCommandLayerOptions
) => Layer.Layer<
  SingleNodeProgram.Bundler,
  SingleNodeProgram.Failure,
  BunCommandLayerRequirements
>

export const isBunFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "bun"
  readonly providerError: BunSingleNodeProgramError
}
```

```ts
// effect-build-esbuild/Profile/SingleNodeProgram
export const withProgram: <A, E, R>(
  input: SingleNodeProgram.Request,
  use: (
    program: SingleNodeProgram.Borrowed
  ) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  EsbuildSingleNodeProgramError | E,
  | EsbuildApi
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | Exclude<R, Scope.Scope>
>

export const layer: Layer.Layer<
  SingleNodeProgram.Bundler,
  SingleNodeProgram.Failure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>

export const isEsbuildFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "esbuild"
  readonly providerError: EsbuildSingleNodeProgramError
}
```

Direct `withProgram` functions preserve exact provider errors. Generic Layers
normalize construction/probe and operation errors while retaining the exact
provider object.

## Node SEA recipe

```ts
// effect-build-node-sea/Recipe/SingleNodeProgram
export interface Input {
  readonly program: SingleNodeProgram.Request
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly targetNodeExecutable?: string
  readonly assets?: Readonly<Record<string, string>>
  readonly disableExperimentalSEAWarning?: boolean
  readonly useSnapshot?: boolean
  readonly useCodeCache?: boolean
  readonly execArgv?: readonly string[]
  readonly execArgvExtension?: "none" | "env" | "cli"
}

export const createExecutable = (
  input: Input
): Effect.Effect<
  Artifact.Executable,
  SingleNodeProgram.Failure | NodeSeaCreateError,
  SingleNodeProgram.Bundler | NodeSeaCommand
> =>
  SingleNodeProgram.withProgram(
    input.program,
    (program) =>
      program.withFile((file) =>
        NodeSeaCommand.use((nodeSea) =>
          nodeSea.createExecutable({
            main: {
              _tag: "File",
              path: file.path,
              format: program.format === "esm" ? "module" : "commonjs"
            },
            outfile: input.outfile,
            ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
            ...(input.digest === undefined ? {} : { digest: input.digest }),
            ...(input.targetNodeExecutable === undefined
              ? {}
              : { targetNodeExecutable: input.targetNodeExecutable }),
            ...(input.assets === undefined ? {} : { assets: input.assets }),
            ...(input.disableExperimentalSEAWarning === undefined
              ? {}
              : {
                  disableExperimentalSEAWarning:
                    input.disableExperimentalSEAWarning
                }),
            ...(input.useSnapshot === undefined
              ? {}
              : { useSnapshot: input.useSnapshot }),
            ...(input.useCodeCache === undefined
              ? {}
              : { useCodeCache: input.useCodeCache }),
            ...(input.execArgv === undefined
              ? {}
              : { execArgv: input.execArgv }),
            ...(input.execArgvExtension === undefined
              ? {}
              : { execArgvExtension: input.execArgvExtension })
          })
        )
      )
  )
```

## Complete substitution example

```ts
const build = NodeSeaRecipe.createExecutable({
  program: {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  outfile: "dist/app",
  digest: true
})

const withBun = build.pipe(
  Effect.provide(BunSingleNodeProgram.layer()),
  Effect.provide(NodeSeaCommand.layer()),
  Effect.provide(NodeServices.layer)
)

const withEsbuild = build.pipe(
  Effect.provide(EsbuildSingleNodeProgram.layer),
  Effect.provide(NodeSeaCommand.layer()),
  Effect.provide(NodeServices.layer)
)
```

The build program is unchanged; only the profile Layer changes.

## Direct provider escape hatches

```ts
const bunBrowser = BunApi.use((bun) =>
  bun.build({
    entrypoints: ["src/client.tsx"],
    outdir: "dist/client",
    target: "browser",
    splitting: true,
    plugins: [frameworkPlugin]
  })
)

const esbuildWatch = Effect.scoped(
  EsbuildApi.use((esbuild) =>
    Effect.gen(function* () {
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
    permissions: { read: true },
    include: ["public"],
    engine: "v8"
  })
)
```

## Package ownership, extension, migration, and exclusions

Core owns `Author/*`, durable observations, and the profile contract. Provider
packages own direct Api/Command services and profile adapters. Node SEA owns the
recipe. A new bundler exposes its direct API first and implements the profile
only if it can satisfy the exact one-main contract.

Migration:

```text
Integration               -> Author/Command + Author/TemporaryOutput
                             + Author/Executable
Provider                  -> Author/CommandCompiler
withJavaScriptBundle      -> provider profile withProgram
JavaScriptBundle.Artifact -> SingleNodeProgram.Borrowed
Compiler services         -> explicit Api / Command services
compileExecutable         -> provider Command module
Node SEA live input       -> direct file/bytes + optional recipe
```

Excluded: automatic provider fallback, universal plugin API, universal output
set, source locator, executable builder union, plans/CAS/cache/remote execution.

**Verdict: selected.**

---

# Candidate D: structural operations without application Context services

```ts
export interface Operation<in I, out O, out E, out R> {
  readonly run: (
    input: I
  ) => Effect.Effect<O, E, R>
}

export interface ScopedOperation<in I, out O, out E, out R> {
  readonly use: <A, E2, R2>(
    input: I,
    consume: (output: O) => Effect.Effect<A, E2, R2>
  ) => Effect.Effect<
    A,
    E | E2,
    R | Exclude<R2, Scope.Scope>
  >
}

export type SingleNodeProgramOperation<E, R> = ScopedOperation<
  SingleNodeProgram.Request,
  SingleNodeProgram.Borrowed,
  E,
  R
>

export const bunSingleNodeProgram:
  SingleNodeProgramOperation<BunSingleNodeProgramError, BunCommand>

export const esbuildSingleNodeProgram:
  SingleNodeProgramOperation<EsbuildSingleNodeProgramError, EsbuildApi>
```

Usage passes the operation value explicitly to a higher-order helper. Core owns
only the structural types; each provider exports a value. Migration adds a
second representation next to direct services. Extension is easy, but provider
errors/requirements become generic parameters throughout application helpers.

Falsifier: Layer selection is part of the intended reusable application model.
Plan 038 demonstrated unchanged application code under Bun/Esbuild Layers.

**Verdict: coherent but incomplete.** Structural forms may be private helpers,
but they do not replace the public service.

---

# Candidate E: generalized transformation algebra

```ts
export interface Transformation<in I, out O, out E, out R> {
  readonly name: string
  readonly execute: (
    input: I
  ) => Effect.Effect<O, E, R>
}

export interface BorrowingTransformation<in I, out O, out E, out R> {
  readonly name: string
  readonly use: <A, E2, R2>(
    input: I,
    consume: (output: O) => Effect.Effect<A, E2, R2>
  ) => Effect.Effect<
    A,
    E | E2,
    R | Exclude<R2, Scope.Scope>
  >
}

export const composeBorrowing = <
  I,
  Middle,
  Output,
  E1,
  E2,
  R1,
  R2
>(
  first: BorrowingTransformation<I, Middle, E1, R1>,
  second: Transformation<Middle, Output, E2, R2>
): Transformation<I, Output, E1 | E2, R1 | R2> => ({
  name: `${first.name} -> ${second.name}`,
  execute: (input) =>
    first.use(input, (middle) => second.execute(middle))
})
```

Every direct provider method gains a parallel transformation object. Core owns
the algebra and composition helpers. A new provider wraps each operation again.
Migration therefore creates a second representation for every current verb.

Falsifier: the algebra must remove semantic branches or invalid states that
Effect functions, services, Layers, Scope, Stream, and `Effect.gen` cannot
already express. It does not.

**Verdict: rejected because maintenance and conceptual cost exceed the
complexity removed.**

---

# Comparison and recommendation

| Candidate | Provider breadth | Layer substitution | Error/option fidelity | Scoped resources | Principal cost |
|---|---|---|---|---|---|
| A. Provider-native only | Full | No | Full | Full | Omits valid generic role |
| B. Root Node profile | Narrow | Yes | Direct escape only | Profile-focused | Excludes major capabilities |
| C. Native + profiles/recipes | Full | Yes where truthful | Full direct, normalized profile | Full | More modules/work |
| D. Structural operations | Full | Explicit values | Full | Possible | Weak discovery/pervasive generics |
| E. Transform algebra | Syntactically full | Via wrappers | Duplicated | Possible | Second build language/role erasure |

Implement Candidate C.

Plan 039 establishes `Author/*` and telemetry without changing 0.3 behavior.
Provider-native lanes then proceed independently. SingleNodeProgram and the Node
SEA recipe land only after Bun and Esbuild direct APIs exist, making the profile
visibly an adapter rather than either provider's canonical API.

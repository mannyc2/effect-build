# Post-0.3 public API candidates

Status: architecture type study. These declarations are not production source,
but they are written as complete TypeScript interfaces rather than placeholders.
They expose each candidate's type, package, lifetime, host, and error cost.

## Shared terms

The sketches use these common types:

```ts
import {
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
  Scope,
  Stream
} from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

export type SystemTarget =
  | "linux-x64-gnu"
  | "linux-x64-musl"
  | "linux-aarch64-gnu"
  | "macos-x64"
  | "macos-aarch64"
  | "windows-x64"
  | "windows-aarch64"

export interface BuildStepObservation {
  readonly operation: string
  readonly tool: {
    readonly name: string
    readonly version: string
    readonly path?: Artifact.LocalPath
  }
}

export namespace Artifact {
  export type Digest = `sha256:${string}`

  export type LocalPath = string & {
    readonly "~effect-build/Artifact/LocalPath": unique symbol
  }

  export interface File {
    readonly path: LocalPath
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

All candidates preserve:

- one-way integration dependencies on core;
- direct provider errors and options unless explicitly excluded;
- interruption as interruption;
- borrowed output cleanup after every callback Exit;
- no universal `ExecutableBuilder` union.

---

# Candidate A: provider-native Effect APIs only

## Model

Core publishes durable observations and integration-author mechanics. Provider
packages expose direct `Api` and/or `Command` services. Application code chooses
the provider explicitly. There is no portable application service.

## Declarations

### Bun

```ts
// effect-build-bun/Api
export interface BunApiService {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunBuildError>
}

export class BunApi extends Context.Service<
  BunApi,
  BunApiService
>()("effect-build-bun/Api") {}

export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>

// effect-build-bun/Command
export interface BunCommandBuildInput {
  readonly entrypoints: readonly [string, ...string[]]
  readonly cwd?: string
  readonly outdir: string
  readonly target?: "browser" | "bun" | "node"
  readonly format?: "esm" | "cjs" | "iife"
  readonly splitting?: boolean
  readonly minify?: boolean
  readonly sourcemap?: boolean | "linked" | "inline" | "external"
  readonly external?: readonly string[]
  readonly packages?: "bundle" | "external"
  readonly metafile?: boolean
}

export interface BunWrittenOutput {
  readonly root: Artifact.LocalPath
  readonly files: readonly Artifact.File[]
  readonly metafile?: Readonly<Record<string, unknown>>
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
```

### Deno

```ts
// effect-build-deno/Api
export interface DenoBundleOptions {
  readonly entrypoints: readonly string[]
  readonly outputPath?: string
  readonly outputDir?: string
  readonly external?: readonly string[]
  readonly format?: "esm" | "cjs" | "iife"
  readonly minify?: boolean
  readonly keepNames?: boolean
  readonly codeSplitting?: boolean
  readonly inlineImports?: boolean
  readonly packages?: "bundle" | "external"
  readonly sourcemap?: "linked" | "inline" | "external"
  readonly platform?: "browser" | "deno"
  readonly write?: boolean
}

export interface DenoBundleMessage {
  readonly text: string
  readonly location?: {
    readonly file: string
    readonly namespace?: string
    readonly line: number
    readonly column: number
    readonly length: number
    readonly suggestion?: string
  }
  readonly notes?: readonly {
    readonly text: string
    readonly location?: DenoBundleMessage["location"]
  }[]
}

export interface DenoBundleOutputFile {
  readonly path: string
  readonly contents?: Uint8Array
  readonly hash: string
  readonly text: () => string
}

export interface DenoBundleResult {
  readonly errors: readonly DenoBundleMessage[]
  readonly warnings: readonly DenoBundleMessage[]
  readonly success: boolean
  readonly outputFiles?: readonly DenoBundleOutputFile[]
}

export interface DenoApiService {
  readonly bundle: (
    options: DenoBundleOptions
  ) => Effect.Effect<DenoBundleResult, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  DenoApiService
>()("effect-build-deno/Api") {}

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

### Esbuild

```ts
// effect-build-esbuild/Api
import type * as esbuild from "esbuild"

export interface EsbuildContext<
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
    EsbuildContextError,
    Scope.Scope
  >
}

export class EsbuildApi extends Context.Service<
  EsbuildApi,
  EsbuildApiService
>()("effect-build-esbuild/Api") {}
```

`watch()` and `serve()` start provider state and return. The context Scope owns
their lifetime. `dispose()` is hidden and called by the finalizer.

### Node SEA

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

export interface NodeSeaCreateExecutableInput {
  readonly main: NodeSeaMain
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

export interface NodeSeaCommandService {
  readonly createExecutable: (
    input: NodeSeaCreateExecutableInput
  ) => Effect.Effect<
    Artifact.Executable,
    NodeSeaCreateError
  >
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  NodeSeaCommandService
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

const server = EsbuildApi.use((esbuild) =>
  esbuild.build({
    entryPoints: ["src/server.ts"],
    platform: "node",
    bundle: true,
    write: false,
    metafile: true
  })
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

## Migration from 0.3

- move Bun/Deno compile operations under `Command`;
- replace fixed Esbuild bundle service with full `Api`;
- broaden Node SEA direct main input;
- remove `JavaScriptBundle.Artifact`;
- add no portable profile.

## Falsifier and verdict

Falsifier: two materially different providers satisfy one useful request,
result, lifetime, interruption, and application substitution contract.

Bun and Esbuild satisfy that condition for the released one-main Node profile,
including the historical unchanged-Layer fixture.

**Verdict: coherent but incomplete.** It is the strongest rejected candidate.

---

# Candidate B: narrow root `NodeProgramBundler`

## Model

One portable source-to-Node-program service is the main library API. Bun and
Esbuild provide Layers. Node SEA consumes the borrowed program. Provider-native
breadth is secondary.

## Declarations

```ts
export namespace NodeProgram {
  export type Format = "esm" | "cjs"

  export interface Borrowed {
    readonly format: Format
    readonly resolutionTarget: "node"
    readonly digest: Artifact.Digest
    readonly externalImportObservations: readonly string[]
    readonly steps: readonly BuildStepObservation[]

    readonly withFile: <A, E, R>(
      use: (
        file: {
          readonly path: Artifact.LocalPath
          readonly bytes: number
          readonly digest: Artifact.Digest
        }
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

## Complete usage

```ts
const build = NodeProgramBundler.Bundler.use((bundler) =>
  bundler.withProgram(
    {
      entrypoint: "src/main.ts",
      format: "esm"
    },
    (main) =>
      NodeSeaCommand.use((nodeSea) =>
        main.withFile((file) =>
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

const withBun = build.pipe(
  Effect.provide(BunNodeProgramLayer),
  Effect.provide(NodeSeaCommandLayer),
  Effect.provide(NodeServices.layer)
)

const withEsbuild = build.pipe(
  Effect.provide(EsbuildNodeProgramLayer),
  Effect.provide(NodeSeaCommandLayer),
  Effect.provide(NodeServices.layer)
)
```

## Capabilities excluded

- Bun browser/Bun/HTML/CSS/assets/plugins/virtual files;
- Bun-runtime executable semantics as a primary product;
- Deno bundle, declarations, permissions, and project compile;
- Esbuild transform, multi-output build, plugins, loaders, context, watch,
  serve, and metafiles as direct APIs;
- Rolldown multiple output configurations.

## Verdict

The profile is semantically valid. Treating it as the library ontology is
**rejected because it excludes most provider capability**.

---

# Candidate C: provider-native APIs plus portable profiles and recipes

This is the selected architecture.

## Core author declarations

### `effect-build/Author/Command`

```ts
export interface RunOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly extendEnv?: boolean
}

export interface Output {
  readonly text: string
  readonly truncated: boolean
}

export interface Completion {
  readonly exitCode: number
  readonly stdout: Output
  readonly stderr: Output
}

export interface ToolSpecification<Name extends string> {
  readonly name: Name
  readonly executable?: string
  readonly probeArgv: readonly string[]
  readonly decodeProbe: (
    completion: Completion
  ) => Effect.Effect<
    {
      readonly name: Name
      readonly version: string
      readonly path: Artifact.LocalPath
    },
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
    readonly path: Artifact.LocalPath
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

export const discover = <const Name extends string>(
  specification: ToolSpecification<Name>
): Effect.Effect<
  Selected<Name>,
  ToolNotFound | ToolProbeFailed,
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
>
```

`run` provides bounded completion. `start` is an author-level scoped primitive
for provider watch lanes. Neither exposes the raw platform process handle.

### `effect-build/Author/TemporaryOutput`

```ts
export interface Directory {
  readonly path: Artifact.LocalPath
}

export interface File {
  readonly path: Artifact.LocalPath
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface DirectoryOptions {
  readonly prefix: string
  readonly protectedDestinations?: readonly string[]
}

export const withDirectory = <A, E, R>(
  options: DirectoryOptions,
  use: (
    directory: Directory
  ) => Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  TemporaryOutputError | E,
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<R, Scope.Scope>
>

export const inspectFile = (
  owner: Directory,
  relativePath: string
): Effect.Effect<
  File,
  TemporaryOutputError,
  FileSystem.FileSystem | Path.Path
>
```

`Directory` and `File` are author values valid only in the owning continuation.
Portable profiles do not expose them directly.

### `effect-build/Author/Executable`

```ts
export interface NativeObservation {
  readonly format: "elf" | "macho" | "pe"
  readonly os: "linux" | "macos" | "windows"
  readonly architecture: "x64" | "aarch64"
  readonly abi?: "gnu" | "musl"
}

export interface Candidate {
  readonly path: Artifact.LocalPath
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
  ) => Effect.Effect<
    Steps,
    ProduceError,
    ProduceRequirements
  >

  readonly resolveSystemTarget: (
    observation: NativeObservation
  ) => Effect.Effect<SystemTarget, TargetError>
}

export const produce = <
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
): Effect.Effect<
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
  | PrepareRequirements
  | ProduceRequirements
>
```

Candidate identity, destination claims, native parser internals, and rename
implementation remain package-private.

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

export interface Context<
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
  ) => Effect.Effect<
    Artifact.Executable<Steps>,
    CommandCompilerBuildError
  >

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
  ) => Effect.Effect<Validated, InvalidCompilerOptions>

  readonly renderArgv: (
    input: {
      readonly entrypoint: string
      readonly target?: Target
      readonly options: Validated
    },
    stagedOutfile: Artifact.LocalPath
  ) => readonly string[]

  readonly interpretFailure: (
    completion: Command.Completion
  ) => CommandCompilerToolFailed

  readonly steps: (
    tool: Command.Selected<Name>["tool"]
  ) => Steps

  readonly makeService: (
    context: CommandCompiler.Context<
      Name,
      Options,
      Target,
      Steps
    >
  ) => Effect.Effect<Service, MakeError, MakeRequirements>
}

export interface Defined<
  Self,
  Options,
  Target extends SystemTarget,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  LayerError,
  LayerRequirements
> {
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, Target>
  ) => Effect.Effect<
    Artifact.Executable<Steps>,
    CommandCompilerBuildError,
    Self
  >

  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<Options, Target>
  ) => Effect.Effect<
    readonly Artifact.Executable<Steps>[],
    CommandCompilerMatrixError,
    Self
  >

  readonly layer: (
    options?: { readonly executable?: string }
  ) => Layer.Layer<Self, LayerError, LayerRequirements>
}

export const define = <
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
): Defined<
  Self,
  Options,
  Target,
  Steps,
  ToolNotFound | ToolProbeFailed | MakeError,
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | MakeRequirements
>
```

There is no reflection over service methods. Requirements are explicit in the
constructor and returned Layer.

## Portable profile declarations

```ts
// effect-build/Profile/SingleNodeProgram
export type Format = "esm" | "cjs"

export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: Format
}

export interface BorrowedFile {
  readonly path: Artifact.LocalPath
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface Borrowed<
  Steps extends readonly BuildStepObservation[] =
    readonly BuildStepObservation[]
> {
  readonly protocol: "effect-build/SingleNodeProgram@1"
  readonly format: Format
  readonly resolutionTarget: "node"
  readonly digest: Artifact.Digest
  readonly externalImportObservations: readonly string[]
  readonly steps: Steps

  readonly withFile: <A, E, R>(
    use: (
      file: BorrowedFile
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
) =>
  Bundler.use((bundler) =>
    bundler.withProgram(request, use)
  )
```

## Provider declarations

### Bun API and command

```ts
// effect-build-bun/Api
export interface Service {
  readonly build: (
    options: Bun.BuildConfig
  ) => Effect.Effect<Bun.BuildOutput, BunBuildError>
}

export class BunApi extends Context.Service<
  BunApi,
  Service
>()("effect-build-bun/Api") {}

export const layerCurrent: Layer.Layer<
  BunApi,
  BunApiUnavailable
>

// effect-build-bun/Command
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

  readonly withSingleNodeProgram: <A, E, R>(
    input: SingleNodeProgram.Request,
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

// effect-build-bun/Profile/SingleNodeProgram
export const layer: (
  options?: BunCommandLayerOptions
) => Layer.Layer<
  SingleNodeProgram.Bundler,
  BunToolNotFound | BunProbeFailed,
  BunCommandLayerRequirements
>

export const isBunFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "bun"
  readonly providerError: BunSingleNodeProgramError
}
```

### Deno API and command

```ts
// effect-build-deno/Api
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

// effect-build-deno/Command
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

### Esbuild API and profile

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

  readonly withSingleNodeProgram: <A, E, R>(
    input: SingleNodeProgram.Request,
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

// effect-build-esbuild/Profile/SingleNodeProgram
export const layer: Layer.Layer<
  SingleNodeProgram.Bundler,
  EsbuildVersionMismatch,
  FileSystem.FileSystem | Path.Path
>

export const isEsbuildFailure: (
  error: SingleNodeProgram.Failure
) => error is SingleNodeProgram.Failure & {
  readonly provider: "esbuild"
  readonly providerError: EsbuildSingleNodeProgramError
}
```

### Node SEA command and recipe

```ts
// effect-build-node-sea/Command
export interface LayerOptions {
  readonly builderNodeExecutable?: string
}

export interface Service {
  readonly createExecutable: (
    input: NodeSeaCreateExecutableInput
  ) => Effect.Effect<
    Artifact.Executable,
    NodeSeaCreateError
  >
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  Service
>()("effect-build-node-sea/Command") {}

export const layer: (
  options?: LayerOptions
) => Layer.Layer<
  NodeSeaCommand,
  NodeSeaToolNotFound | NodeSeaProbeFailed,
  NodeSeaCommandRequirements
>

// effect-build-node-sea/Recipe/SingleNodeProgram
export interface RecipeInput {
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
  input: RecipeInput
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
              format:
                program.format === "esm"
                  ? "module"
                  : "commonjs"
            },
            outfile: input.outfile,
            cwd: input.cwd,
            digest: input.digest,
            targetNodeExecutable:
              input.targetNodeExecutable,
            assets: input.assets,
            disableExperimentalSEAWarning:
              input.disableExperimentalSEAWarning,
            useSnapshot: input.useSnapshot,
            useCodeCache: input.useCodeCache,
            execArgv: input.execArgv,
            execArgvExtension: input.execArgvExtension
          })
        )
      )
  )
```

## Complete generic usage

```ts
import { Effect } from "effect"
import { NodeServices } from "@effect/platform-node"
import * as BunProfile from
  "effect-build-bun/Profile/SingleNodeProgram"
import * as EsbuildProfile from
  "effect-build-esbuild/Profile/SingleNodeProgram"
import * as NodeSeaCommand from
  "effect-build-node-sea/Command"
import * as NodeSeaRecipe from
  "effect-build-node-sea/Recipe/SingleNodeProgram"

const build = NodeSeaRecipe.createExecutable({
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

The `build` value is unchanged. Only the profile Layer changes.

## Direct provider examples

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

## Migration from 0.3

```text
Integration                  -> Author/Command + Author/TemporaryOutput
                                + Author/Executable
Provider                     -> Author/CommandCompiler
withJavaScriptBundle         -> direct withSingleNodeProgram
JavaScriptBundle.Artifact    -> SingleNodeProgram.Borrowed
Compiler services            -> explicit Api / Command services
compileExecutable            -> provider Command module
Node SEA live-artifact input -> direct file/bytes input + profile recipe
```

## Verdict

**Selected.** It preserves provider breadth, host-lane truth, direct error
fidelity, Effect resource semantics, and one validated portable substitution
without adding a second build language.

---

# Candidate D: structural protocols without application Context services

## Declarations

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
    consume: (
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

## Complete usage

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

const withBun = makeBuild(bunSingleNodeProgram)
const withEsbuild = makeBuild(esbuildSingleNodeProgram)
```

## Falsifier and verdict

Falsifier: Layer selection is part of the intended reusable application model.

The historical Plan 038 fixture demonstrated unchanged application code under
two Layers. Structural values remain useful internally, but they do not replace
the public service.

**Verdict: coherent but incomplete.**

---

# Candidate E: generalized transformation algebra

## Declarations

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
  Middle,
  Output,
  E1,
  E2,
  R1,
  R2
>(
  first: BorrowingTransformation<
    I,
    Middle,
    E1,
    R1
  >,
  second: Transformation<
    Middle,
    Output,
    E2,
    R2
  >
): Transformation<
  I,
  Output,
  E1 | E2,
  R1 | R2
> => ({
  name: `${first.name} -> ${second.name}`,
  execute: (input) =>
    first.use(input, (middle) =>
      second.execute(middle)
    )
})
```

Provider values duplicate direct methods:

```ts
export const bunCompile:
  Transformation<
    BunCompileExecutableInput,
    Artifact.Executable,
    BunCompileError,
    BunCommand
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
    NodeSeaCreateError,
    NodeSeaCommand
  >
```

## Falsifier and verdict

Falsifier: the algebra removes semantic branches or invalid states that Effect
functions, services, Layers, Scope, and `Effect.gen` cannot already express.

It does not. It adds a second representation for every provider operation and
erases useful role names.

**Verdict: rejected because maintenance and conceptual cost exceed the
complexity removed.**

---

# Comparison

| Candidate | Native breadth | Portable Layer substitution | Provider errors/options | Scoped native resources | Main cost |
|---|---|---|---|---|---|
| A. Provider-native only | Full | No | Full | Full | Omits valid generic profile |
| B. Narrow root profile | Narrow | Yes | Partial/direct escape only | Profile-focused | Excludes major provider capabilities |
| C. Native + profiles/recipes | Full | Yes where truthful | Full direct, normalized profile | Full | More modules and implementation work |
| D. Structural operations | Full | Value substitution | Full | Possible | Weak discovery and pervasive generics |
| E. Transformation algebra | Syntactically full | Via objects | Duplicated | Possible | Second build language and role erasure |

# Recommendation

Implement Candidate C.

The first implementation PR establishes `Author/*` capabilities and telemetry
without changing 0.3 behavior. Provider-native lanes then proceed independently.
SingleNodeProgram and the Node SEA recipe land only after Bun and Esbuild direct
surfaces exist, so the profile is visibly an adapter rather than the provider's
canonical API.

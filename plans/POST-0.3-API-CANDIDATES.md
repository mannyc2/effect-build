# Post-0.3 public API candidates after executable research

Status: final type study for Candidate C2. These declarations are not production
source, but they are concrete enough to expose package ownership, host and tool
compatibility, lifecycle, failure, and migration consequences.

The research prototypes that informed these declarations live under
`research/post-0.3/`.

## Shared vocabulary

```ts
import {
  Context,
  Crypto,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
  Scope,
  Stream
} from "effect"
import { ChildProcess } from "effect/unstable/process"

export type SystemTarget =
  | "linux-x64-gnu"
  | "linux-x64-musl"
  | "linux-aarch64-gnu"
  | "macos-x64"
  | "macos-aarch64"
  | "windows-x64"
  | "windows-aarch64"

export namespace HostPath {
  export type Observed = string & {
    readonly "~effect-build/HostPath/Observed": unique symbol
  }

  export class ObservationFailed extends Data.TaggedError(
    "HostPathObservationFailed"
  )<{
    readonly input: string
    readonly operation: "realpath" | "stat"
    readonly reason: string
  }> {}

  export const observe: (
    input: string
  ) => Effect.Effect<
    Observed,
    ObservationFailed,
    FileSystem.FileSystem | Path.Path
  >
}

export type ToolCompatibility = "tested" | "untested-override"

export interface TestedRange {
  readonly minimum: string
  readonly maximum: string
}

export interface ToolObservation<Name extends string = string> {
  readonly name: Name
  readonly version: string
  readonly path?: HostPath.Observed
  readonly compatibility: ToolCompatibility
  readonly testedRange: TestedRange
}

export interface BuildStepObservation {
  readonly operation: string
  readonly tool: ToolObservation
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

export namespace Artifact {
  export type Digest = `sha256:${string}`

  export interface File {
    readonly path: HostPath.Observed
    readonly bytes: number
    readonly digest?: Digest
  }

  export interface RuntimeObservation {
    readonly name: "node" | "bun" | "deno" | string
    readonly version?: string
  }

  export interface Executable<
    Runtime extends RuntimeObservation = RuntimeObservation,
    Steps extends readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ] = readonly [
      BuildStepObservation,
      ...BuildStepObservation[]
    ]
  > extends File {
    readonly runtime: Runtime
    readonly systemTarget: SystemTarget
    readonly steps: Steps
  }
}
```

## Tool compatibility and selection

### Core errors and warnings

```ts
export class ToolVersionUnsupported extends Data.TaggedError(
  "ToolVersionUnsupported"
)<{
  readonly provider: string
  readonly lane: "api" | "command"
  readonly observed: string
  readonly testedRange: TestedRange
  readonly knownIncompatible: boolean
  readonly missingCapabilities: readonly string[]
  readonly remediation:
    | "select-supported-version"
    | "enable-untested-version-override"
}> {}

export interface ToolVersionUntestedOverride {
  readonly _tag: "ToolVersionUntestedOverride"
  readonly provider: string
  readonly lane: "api" | "command"
  readonly observed: string
  readonly testedRange: TestedRange
}
```

### `effect-build/Author/Tool`

```ts
export interface CapabilityProbe {
  readonly name: string
  readonly probe: (
    executable: HostPath.Observed
  ) => Effect.Effect<boolean, ToolProbeFailed>
}

export interface Specification<Name extends string> {
  readonly name: Name
  readonly executable?: string
  readonly versionArgv: readonly string[]
  readonly parseVersion: (
    stdout: string,
    stderr: string
  ) => Effect.Effect<string, ToolProbeFailed>
  readonly testedRange: TestedRange
  readonly knownIncompatible: readonly string[]
  readonly capabilities: readonly CapabilityProbe[]
}

export interface SelectOptions {
  readonly allowUntestedVersion?: boolean
  readonly requiredCapabilities?: readonly string[]
}

export interface Selected<Name extends string> {
  readonly observation: ToolObservation<Name>
  readonly command: (
    argv: readonly string[],
    options?: ChildProcess.CommandOptions
  ) => ChildProcess.Command
}

export const select: <const Name extends string>(
  specification: Specification<Name>,
  options?: SelectOptions
) => Effect.Effect<
  Selected<Name>,
  ToolNotFound | ToolProbeFailed | ToolVersionUnsupported,
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcess.ChildProcessSpawner
>
```

`Selected.command` delegates to official Effect `ChildProcess.make` using the
captured canonical executable. It does not wrap process handles, streams, Scope,
kill, or force-kill.

Known-incompatible versions and missing capabilities always fail. An untested
but capable version is permitted only through `allowUntestedVersion`; selection
emits a structured warning and records `untested-override`.

## Borrowed output author contract

### `effect-build/Author/BorrowedOutput`

```ts
export interface File {
  readonly path: HostPath.Observed
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface TreeEntry extends File {
  readonly relativePath: string
  readonly kind:
    | "html"
    | "javascript"
    | "css"
    | "asset"
    | "source-map"
    | "other"
}

export interface TreeManifest {
  readonly entries: readonly TreeEntry[]
}

export interface Directory {
  readonly path: HostPath.Observed
}

export const withDirectory: <A, E, R>(
  options: {
    readonly prefix: string
    readonly protectedDestinations?: readonly string[]
  },
  use: (directory: Directory) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  BorrowedOutputError | E,
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<R, Scope.Scope>
>

export const observeFile: (
  owner: Directory,
  relativePath: string
) => Effect.Effect<
  File,
  BorrowedOutputError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>

export const observeTree: (
  owner: Directory
) => Effect.Effect<
  TreeManifest,
  BorrowedOutputError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>
```

Raw liveness tokens, cleanup-root claims, and mutable registries remain private.
Profile adapters construct closure-owned Effects over these functions.

## Durable executable author contract

### `effect-build/Author/Executable`

```ts
export interface NativeObservation {
  readonly format: "elf" | "macho" | "pe"
  readonly os: "linux" | "macos" | "windows"
  readonly architecture: "x64" | "aarch64"
  readonly abi?: "gnu" | "musl"
}

export interface Candidate {
  readonly path: HostPath.Observed
}

export interface ProduceInput<
  Prepared,
  Runtime extends Artifact.RuntimeObservation,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  PrepareError,
  ProduceError,
  ResolveError,
  PrepareRequirements,
  ProduceRequirements
> {
  readonly outfile: string
  readonly cwd?: string
  readonly digest?: boolean
  readonly prepare: () => Effect.Effect<
    Prepared,
    PrepareError,
    PrepareRequirements
  >
  readonly produce: (
    prepared: Prepared,
    candidate: Candidate
  ) => Effect.Effect<Steps, ProduceError, ProduceRequirements>
  readonly resolve: (
    observation: NativeObservation
  ) => Effect.Effect<
    {
      readonly runtime: Runtime
      readonly systemTarget: SystemTarget
    },
    ResolveError
  >
}

export const produce: <
  Prepared,
  Runtime extends Artifact.RuntimeObservation,
  Steps extends readonly [
    BuildStepObservation,
    ...BuildStepObservation[]
  ],
  PrepareError,
  ProduceError,
  ResolveError,
  PrepareRequirements,
  ProduceRequirements
>(
  input: ProduceInput<
    Prepared,
    Runtime,
    Steps,
    PrepareError,
    ProduceError,
    ResolveError,
    PrepareRequirements,
    ProduceRequirements
  >
) => Effect.Effect<
  Artifact.Executable<Runtime, Steps>,
  | PrepareError
  | ProduceError
  | ResolveError
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

Preparation happens before staging allocation. Atomic rename is the only durable
commit. The API makes no multi-file transaction claim.

## Permanent provider-native services

Repeated names such as `Service` and `layer` below belong to separate package
subpath modules.

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

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}

export const layerCurrent: (
  options?: LayerOptions
) => Layer.Layer<
  BunApi,
  BunApiUnavailable | ToolVersionUnsupported
>
```

The service preserves `Bun.build()` compile mode. It does not add an API-only
`compileExecutable` wrapper until an implementation proves stronger durable
publication semantics without misrepresenting cancellation.

### `effect-build-bun/Command`

```ts
export interface BuildInput {
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
  readonly metafile?: boolean
}

export interface WrittenOutput {
  readonly files: readonly Artifact.File[]
  readonly providerMetafile?: unknown
  readonly tool: ToolObservation<"bun">
}

export interface Service {
  readonly build: (
    input: BuildInput
  ) => Effect.Effect<WrittenOutput, BunCommandBuildError>

  readonly compileExecutable: (
    input: BunCompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "bun"
      readonly version?: string
    }>,
    BunCompileError
  >

  readonly compileExecutableMatrix: (
    input: BunCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable<{
      readonly name: "bun"
      readonly version?: string
    }>[],
    BunMatrixError
  >
}

export class BunCommand extends Context.Service<
  BunCommand,
  Service
>()("effect-build-bun/Command") {}

export interface LayerOptions {
  readonly executable?: string
  readonly allowUntestedVersion?: boolean
}

export const layer: (
  options?: LayerOptions
) => Layer.Layer<
  BunCommand,
  BunToolNotFound | BunProbeFailed | ToolVersionUnsupported,
  BunCommandRequirements
>
```

No command-watch method is exported in 0.4.

### `effect-build-deno/Api`

The provider package owns an isolated structural declaration matching the
supported official unstable surface. Unrelated consumers do not load ambient
Deno globals.

```ts
export interface BundleOptions {
  readonly entrypoints: string[]
  readonly outputPath?: string
  readonly outputDir?: string
  readonly external?: string[]
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

export interface BundleMessageLocation {
  readonly file: string
  readonly namespace?: string
  readonly line: number
  readonly column: number
  readonly length: number
  readonly suggestion?: string
}

export interface BundleMessage {
  readonly text: string
  readonly location?: BundleMessageLocation
  readonly notes?: readonly {
    readonly text: string
    readonly location?: BundleMessageLocation
  }[]
}

export interface BundleOutputFile {
  readonly path: string
  readonly contents?: Uint8Array
  readonly hash: string
  readonly text: () => string
}

export interface BundleResult {
  readonly errors: readonly BundleMessage[]
  readonly warnings: readonly BundleMessage[]
  readonly success: boolean
  readonly outputFiles?: readonly BundleOutputFile[]
}

export interface Service {
  readonly bundle: (
    options: BundleOptions
  ) => Effect.Effect<BundleResult, DenoBundleApiError>
}

export class DenoApi extends Context.Service<
  DenoApi,
  Service
>()("effect-build-deno/Api") {}

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}

export const layerCurrent: (
  options?: LayerOptions
) => Layer.Layer<
  DenoApi,
  DenoApiUnavailable | ToolVersionUnsupported
>
```

The Layer checks host/API compatibility. It does not grant permissions, enable
unstable flags, or promise that the runtime enforces the permission behavior in
declaration comments.

### `effect-build-deno/Command`

```ts
export interface Service {
  readonly bundle: (
    input: DenoBundleCommandInput
  ) => Effect.Effect<DenoWrittenOutput, DenoBundleCommandError>

  readonly compileExecutable: (
    input: DenoCompileExecutableInput
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "deno"
      readonly version?: string
    }>,
    DenoCompileError
  >

  readonly compileExecutableMatrix: (
    input: DenoCompileExecutableMatrixInput
  ) => Effect.Effect<
    readonly Artifact.Executable<{
      readonly name: "deno"
      readonly version?: string
    }>[],
    DenoMatrixError
  >
}

export class DenoCommand extends Context.Service<
  DenoCommand,
  Service
>()("effect-build-deno/Command") {}

export interface LayerOptions {
  readonly executable?: string
  readonly allowUntestedVersion?: boolean
}

export const layer: (
  options?: LayerOptions
) => Layer.Layer<
  DenoCommand,
  DenoToolNotFound | DenoProbeFailed | ToolVersionUnsupported,
  DenoCommandRequirements
>
```

The command bundle request owns Deno declaration, HTML, package, platform,
watch-free one-shot, config, and type-check options. No command-watch method is
exported in 0.4.

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

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean
}

export const layer: (
  options?: LayerOptions
) => Layer.Layer<
  EsbuildApi,
  EsbuildVersionMismatch | ToolVersionUnsupported
>
```

`watch` and `serve` start provider state and return. The scoped context remains
the resource. Hidden release calls cancel then dispose exactly once.

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
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "node"
      readonly version?: string
    }>,
    NodeSeaCreateError
  >
}

export class NodeSeaCommand extends Context.Service<
  NodeSeaCommand,
  Service
>()("effect-build-node-sea/Command") {}

export interface LayerOptions {
  readonly builderExecutable?: string
  readonly targetExecutable?: string
  readonly allowUntestedVersion?: boolean
}

export const layer: (
  options?: LayerOptions
) => Layer.Layer<
  NodeSeaCommand,
  | NodeSeaToolNotFound
  | NodeSeaProbeFailed
  | NodeSeaVersionMismatch
  | ToolVersionUnsupported,
  NodeSeaRequirements
>
```

Builder and target/base Node are separately observed. Normal support requires
equal versions until the mismatched-output gate closes.

## Profile: `NodeMainProgram`

### Core module

```ts
// effect-build/Profile/NodeMainProgram
export interface Request {
  readonly entrypoint: string
  readonly cwd?: string
  readonly format: "esm" | "cjs"
}

export interface Borrowed {
  readonly protocol: "effect-build/NodeMainProgram@1"
  readonly executionRole: "main"
  readonly format: "esm" | "cjs"
  readonly resolutionTarget: "node"
  readonly externalImportObservations: readonly string[]
  readonly steps: readonly BuildStepObservation[]
  readonly file: Effect.Effect<
    BorrowedOutput.File,
    Expired | Changed
  >
}

export class Expired extends Data.TaggedError(
  "NodeMainProgramExpired"
)<{}> {}

export class Changed extends Data.TaggedError(
  "NodeMainProgramChanged"
)<{
  readonly reason:
    | "missing"
    | "not-file"
    | "byte-count-changed"
    | "digest-changed"
}> {}

export class Failure extends Data.TaggedError(
  "NodeMainProgramFailure"
)<{
  readonly provider: string
  readonly kind:
    | "invalid-request"
    | "tool-unavailable"
    | "tool-unsupported"
    | "build-failed"
    | "invalid-output"
    | "host-io"
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}> {}

export interface Service {
  readonly withProgram: <A, E, R>(
    request: Request,
    use: (program: Borrowed) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    Failure | E,
    Exclude<R, Scope.Scope>
  >
}

export class Bundler extends Context.Service<
  Bundler,
  Service
>()("effect-build/Profile/NodeMainProgram/Bundler") {}

export const withProgram: Service["withProgram"] = (
  request,
  use
) => Bundler.use((service) => service.withProgram(request, use))
```

There is one continuation. The closure-owned `file` Effect replaces the earlier
nested `withFile` callback.

### Bun adapter

```ts
// effect-build-bun/Profile/NodeMainProgram
export const withProgram: <A, E, R>(
  request: NodeMainProgram.Request,
  use: (program: NodeMainProgram.Borrowed) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  BunNodeMainError | E,
  BunCommand | Exclude<R, Scope.Scope>
>

export const layer: (
  options?: BunCommand.LayerOptions
) => Layer.Layer<
  NodeMainProgram.Bundler,
  NodeMainProgram.Failure,
  BunCommandRequirements
>
```

### Esbuild adapter

```ts
// effect-build-esbuild/Profile/NodeMainProgram
export const withProgram: <A, E, R>(
  request: NodeMainProgram.Request,
  use: (program: NodeMainProgram.Borrowed) => Effect.Effect<A, E, R>
) => Effect.Effect<
  A,
  EsbuildNodeMainError | E,
  | EsbuildApi
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | Exclude<R, Scope.Scope>
>

export const layer: Layer.Layer<
  NodeMainProgram.Bundler,
  NodeMainProgram.Failure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
>
```

Direct adapter functions retain exact provider errors. Profile Layers normalize
only provider-owned failures and retain exact provider error identity.

## Profile: `NodeMainExecutable`

### Core module

```ts
// effect-build/Profile/NodeMainExecutable
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

export interface Request {
  readonly main: Main
  readonly outfile: string
  readonly cwd?: string
  readonly systemTarget?: SystemTarget
  readonly digest?: boolean
}

export class Failure extends Data.TaggedError(
  "NodeMainExecutableFailure"
)<{
  readonly provider: string
  readonly kind:
    | "invalid-main"
    | "tool-unavailable"
    | "tool-unsupported"
    | "assembly-failed"
    | "invalid-output"
    | "target-mismatch"
    | "publication-failed"
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}> {}

export interface Service {
  readonly createExecutable: (
    request: Request
  ) => Effect.Effect<
    Artifact.Executable<{
      readonly name: "node"
      readonly version?: string
    }>,
    Failure
  >
}

export class Assembler extends Context.Service<
  Assembler,
  Service
>()("effect-build/Profile/NodeMainExecutable/Assembler") {}

export const createExecutable: Service["createExecutable"] = (
  request
) => Assembler.use((service) => service.createExecutable(request))
```

### Node SEA adapter

```ts
// effect-build-node-sea/Profile/NodeMainExecutable
export const layer: (
  options?: NodeSeaCommand.LayerOptions
) => Layer.Layer<
  NodeMainExecutable.Assembler,
  NodeMainExecutable.Failure,
  NodeSeaRequirements
>

export const isNodeSeaFailure: (
  error: NodeMainExecutable.Failure
) => error is NodeMainExecutable.Failure & {
  readonly provider: "node-sea"
  readonly providerError: NodeSeaCreateError
}
```

A research-only `pkg` adapter is retained as a conformance fixture and is not a
0.4 product export.

## Profile: `BrowserModuleApplication`

### Core module

```ts
// effect-build/Profile/BrowserModuleApplication
export interface Request {
  readonly entryHtml: string
  readonly cwd?: string
  readonly minify?: boolean
}

export interface ManifestEntry {
  readonly relativePath: string
  readonly kind: "html" | "javascript" | "css" | "asset" | "source-map" | "other"
  readonly bytes: number
  readonly digest: Artifact.Digest
}

export interface Borrowed {
  readonly protocol: "effect-build/BrowserModuleApplication@1"
  readonly target: "browser"
  readonly entryHtml: string
  readonly manifest: readonly ManifestEntry[]
  readonly steps: readonly BuildStepObservation[]
  readonly files: Effect.Effect<
    readonly BorrowedOutput.TreeEntry[],
    Expired | Changed
  >
}

export class Expired extends Data.TaggedError(
  "BrowserModuleApplicationExpired"
)<{}> {}

export class Changed extends Data.TaggedError(
  "BrowserModuleApplicationChanged"
)<{
  readonly relativePath: string
  readonly reason: "missing" | "outside-root" | "digest-changed"
}> {}

export class Failure extends Data.TaggedError(
  "BrowserModuleApplicationFailure"
)<{
  readonly provider: string
  readonly kind:
    | "invalid-request"
    | "tool-unavailable"
    | "tool-unsupported"
    | "build-failed"
    | "invalid-manifest"
    | "missing-reference"
    | "host-io"
  readonly diagnostics: readonly Diagnostic[]
  readonly providerError: unknown
}> {}

export interface Service {
  readonly withApplication: <A, E, R>(
    request: Request,
    use: (application: Borrowed) => Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A,
    Failure | E,
    Exclude<R, Scope.Scope>
  >
}

export class Builder extends Context.Service<
  Builder,
  Service
>()("effect-build/Profile/BrowserModuleApplication/Builder") {}
```

The profile requires every emitted local HTML reference to resolve inside the
manifest. It covers CSS/assets reachable through the script module graph, not
arbitrary top-level linked resources.

### Bun adapter

```ts
// effect-build-bun/Profile/BrowserModuleApplication
export const layer: (
  options?: BunCommand.LayerOptions
) => Layer.Layer<
  BrowserModuleApplication.Builder,
  BrowserModuleApplication.Failure,
  BunCommandRequirements
>
```

### Deno adapter

```ts
// effect-build-deno/Profile/BrowserModuleApplication
export const layer: (
  options?: DenoCommand.LayerOptions
) => Layer.Layer<
  BrowserModuleApplication.Builder,
  BrowserModuleApplication.Failure,
  DenoCommandRequirements
>
```

Both adapters use command lanes to preserve child termination.

## Core recipe: `NodeSourceExecutable`

```ts
// effect-build/Recipe/NodeSourceExecutable
export interface Request {
  readonly program: NodeMainProgram.Request
  readonly outfile: string
  readonly cwd?: string
  readonly systemTarget?: SystemTarget
  readonly digest?: boolean
}

export const createExecutable: (
  request: Request
) => Effect.Effect<
  Artifact.Executable<{
    readonly name: "node"
    readonly version?: string
  }>,
  NodeMainProgram.Failure | NodeMainExecutable.Failure,
  NodeMainProgram.Bundler | NodeMainExecutable.Assembler
> = (request) =>
  NodeMainProgram.withProgram(
    request.program,
    (program) =>
      Effect.flatMap(program.file, (file) =>
        NodeMainExecutable.createExecutable({
          main: {
            _tag: "File",
            path: file.path,
            format: program.format === "esm" ? "module" : "commonjs"
          },
          outfile: request.outfile,
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
          ...(request.systemTarget === undefined
            ? {}
            : { systemTarget: request.systemTarget }),
          ...(request.digest === undefined
            ? {}
            : { digest: request.digest })
        })
      )
  )
```

The recipe selects no producer and no assembler.

## Complete provider-neutral usage

### Node executable

```ts
import { Effect } from "effect"
import { NodeServices } from "@effect/platform-node"
import * as BunNodeMain from
  "effect-build-bun/Profile/NodeMainProgram"
import * as EsbuildNodeMain from
  "effect-build-esbuild/Profile/NodeMainProgram"
import * as NodeSeaAssembler from
  "effect-build-node-sea/Profile/NodeMainExecutable"
import * as NodeSourceExecutable from
  "effect-build/Recipe/NodeSourceExecutable"

const program = NodeSourceExecutable.createExecutable({
  program: {
    entrypoint: "src/main.ts",
    format: "esm"
  },
  outfile: "dist/app",
  digest: true
})

const withBun = program.pipe(
  Effect.provide(BunNodeMain.layer()),
  Effect.provide(NodeSeaAssembler.layer()),
  Effect.provide(NodeServices.layer)
)

const withEsbuild = program.pipe(
  Effect.provide(EsbuildNodeMain.layer),
  Effect.provide(NodeSeaAssembler.layer()),
  Effect.provide(NodeServices.layer)
)
```

### Browser application

```ts
import * as BrowserApplication from
  "effect-build/Profile/BrowserModuleApplication"
import * as BunBrowser from
  "effect-build-bun/Profile/BrowserModuleApplication"
import * as DenoBrowser from
  "effect-build-deno/Profile/BrowserModuleApplication"

const deploy = BrowserApplication.Builder.use((builder) =>
  builder.withApplication(
    {
      entryHtml: "src/index.html",
      minify: true
    },
    (application) =>
      Effect.flatMap(application.files, uploadTree)
  )
)

const withBun = deploy.pipe(Effect.provide(BunBrowser.layer()))
const withDeno = deploy.pipe(Effect.provide(DenoBrowser.layer()))
```

The application logic is unchanged. Only the profile Layer changes.

## Strict and override developer experience

### Strict default

```ts
const layer = BunCommand.layer({
  executable: "/opt/bun-1.4.0/bin/bun"
})
```

If 1.4.0 is outside the package's tested range, Layer construction fails before
build output is touched:

```ts
new ToolVersionUnsupported({
  provider: "bun",
  lane: "command",
  observed: "1.4.0",
  testedRange: {
    minimum: "1.3.9",
    maximum: "1.3.14"
  },
  knownIncompatible: false,
  missingCapabilities: [],
  remediation: "enable-untested-version-override"
})
```

The user sees the observed version, supported range, required capability, and
exact remediation. No older Bun is installed or selected automatically.

### Explicit untested override

```ts
const layer = BunCommand.layer({
  executable: "/opt/bun-1.4.0/bin/bun",
  allowUntestedVersion: true
})
```

The Layer:

- runs all required capability probes;
- rejects known-incompatible or missing-capability versions anyway;
- emits a structured `ToolVersionUntestedOverride` warning;
- records:

```ts
{
  name: "bun",
  version: "1.4.0",
  path: observedPath,
  compatibility: "untested-override",
  testedRange: {
    minimum: "1.3.9",
    maximum: "1.3.14"
  }
}
```

- retains ordinary command, cleanup, target, and publication validation.

## Lifecycle API prototypes and decisions

### Prototype 1: one `Effect`

Use for one-shot host APIs, one-shot commands, direct provider writes, durable
single-file publication, executable assembly, and matrix operations.

```ts
Effect.Effect<Result, Error>
```

This shape is rejected for long-lived contexts because it cannot represent
ready/rebuild/release ownership without returning a handle.

### Prototype 2: scoped handle

Use for provider contexts and future incremental roles.

```ts
Effect.Effect<Handle, Error, Scope.Scope>
```

The handle exposes only provider-stable operations. Scope owns release. Raw
manual `dispose` remains hidden when release must be exactly once.

### Prototype 3: `Stream<Event, E, Scope>`

Use only when the provider supplies stable event boundaries. It is rejected for
Bun/Deno command watch in 0.4 because the tested CLI surfaces exposed human
terminal output, not a machine event protocol.

### Prototype 4: continuation ownership

Use for borrowed files and trees.

```ts
withRole(request, (borrowed) => Effect<A, E, R>)
```

This is the only shape that makes producer-owned cleanup explicit without
pretending TypeScript values are linear.

### Prototype 5: opaque scoped process capability

```ts
interface OpaqueWatchSession {
  readonly logs: Stream.Stream<{
    readonly channel: "stdout" | "stderr"
    readonly bytes: Uint8Array
  }>
  readonly exit: Effect.Effect<{
    readonly exitCode: number
    readonly signal?: string
  }>
}
```

This is coherent but rejected as a 0.4 provider API because it adds no invariant
over official Effect process handles. A future provider-specific session must
add truthful readiness/rebuild/diagnostic semantics.

## Command-watch contract decision

The following cross-provider event union is rejected:

```ts
// Rejected
export type WatchEvent<Output> =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Rebuilt"; readonly output: Output }
  | { readonly _tag: "Diagnostics"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly _tag: "Exited"; readonly exitCode: number }
```

Bun and Deno did not expose stable parseable boundaries for these events.
Telemetry does not supply missing application semantics.

0.4 therefore specifies:

- no public Bun/Deno command watch method;
- direct one-shot command build/bundle only;
- integration authors may use `Author/Tool` plus official Effect
  `ChildProcess`;
- future watch support requires provider-specific real-tool conformance for
  readiness, rebuild sequence, diagnostics, unexpected exit, cancellation, and
  force-kill.

## Valid but deferred `IncrementalNodeMain`

The exact future profile can use:

```ts
export interface Session {
  readonly rebuild: Effect.Effect<
    NodeMainProgram.Borrowed,
    IncrementalNodeMainFailure
  >
}

export interface Service {
  readonly context: (
    request: NodeMainProgram.Request
  ) => Effect.Effect<
    Session,
    IncrementalNodeMainFailure,
    Scope.Scope
  >
}
```

Esbuild and Rolldown research adapters conformed. It is not exported in 0.4
because no Rolldown integration package ships in the cut. This is release
sequencing, not architectural invalidity.

## Public primitive falsification summary

### Rejected public `Author/Command`

Official Effect already defines:

- command/argv/cwd/env/shell policy;
- stdout/stderr as streams or sinks;
- scoped child handles;
- exit status;
- signals;
- force-kill timeout;
- platform-specific spawner Layers.

The only additional cross-provider invariant is selected-tool compatibility,
which is isolated in `Author/Tool`. Provider-specific bounded capture can remain
private.

### Rejected public `Author/CommandCompiler`

A prototype definition necessarily carried:

- provider option decoder;
- provider target table;
- provider argv renderer;
- provider failure interpreter;
- provider service tag and constructor;
- scalar/matrix policy.

It did not eliminate any state beyond Tool selection, provider validation, and
Executable publication. It also failed to describe provider build output sets,
watch, Esbuild contexts, or Node assembly. It is a package-private convenience,
not a public author law.

## Rejected API alternatives

### Earlier double continuation

```ts
// Rejected
withProgram(request, (program) =>
  program.withFile((file) => use(file))
)
```

Law tests showed that a raw path can still escape the inner callback and becomes
unusable only because the outer producer later deletes it. The inner callback
did not add lifetime ownership. A closure-owned file Effect preserves the
important re-observation and expiry laws with one callback.

### Universal executable producer

```ts
// Rejected
interface ExecutableProducer {
  readonly produce: (
    request: {
      readonly entrypoint: string
      readonly runtime: "node" | "bun" | "deno"
      readonly permissions?: unknown
    }
  ) => Effect.Effect<Artifact.Executable, Error>
}
```

The union hides incompatible authority and runtime products. Real Bun and Deno
executables ran different embedded runtimes. Node SEA consumes a bundled main,
not source/project authority.

### Generic declaration output set

Rejected because one rolled-up declaration and a module declaration tree are
not the same output topology. Deno's tested rollup also retained an unresolved
local import.

### Generic command-watch stream

Rejected because provider terminal prose did not provide stable events.

## 0.3 to C2 migration summary

```text
Integration               -> Author/Tool + Author/BorrowedOutput
                             + Author/Executable + official Effect process APIs
Provider                  -> no public replacement; provider-private helpers
withJavaScriptBundle      -> provider NodeMainProgram adapter
JavaScriptBundle.Artifact -> NodeMainProgram.Borrowed
SingleNodeProgram         -> NodeMainProgram
Compiler services         -> permanent explicit Api / Command services
compileExecutable         -> provider Command module
Node SEA live input       -> direct file/bytes + NodeMainExecutable profile
Node SEA recipe           -> core Recipe/NodeSourceExecutable
```

No compatibility aliases are proposed for the pre-1.0 hard cut.

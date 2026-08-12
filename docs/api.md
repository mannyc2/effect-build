# API

The package has exactly three entry points:

```ts
import { Artifact, BuildError, MatrixError, Target } from "effect-build";
import * as Bun from "effect-build/bun";
import * as Deno from "effect-build/deno";
```

The root runtime keys are `Artifact`, `BuildError`, `MatrixError`, and `Target`.
Each compiler module has exactly five runtime keys: `Compiler`, `Target`,
`compileExecutable`, `compileExecutableMatrix`, and `layer`. Provider Artifact,
input, options, and MatrixError aliases are type-only. There is no root compile
operation or provider argument.

## Scalar compile

Each provider exports a concrete `CompileExecutableInput` with this shape:

```ts
interface CompileExecutableInput {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Bun.Target; // Deno.Target in the Deno module
  readonly digest?: boolean;
  readonly options?: Bun.Options; // Deno.Options in the Deno module
}
```

`entrypoint` and `outfile` are the only required fields. Relative paths are
resolved using `cwd` when supplied. `target` is `Bun.Target` or `Deno.Target`,
never a broad string. `digest: true` reads the completed output and adds its
SHA-256 digest. Options remain provider-specific.

The scalar result is the provider Artifact and its error channel remains the
closed `BuildError.BuildError` union. The public type is equivalent to:

```ts
Effect.Effect<Bun.Artifact, BuildError.BuildError, Bun.Compiler>;
```

## Target matrix

Each provider also exports a concrete `CompileExecutableMatrixInput`. For Bun:

```ts
interface BunMatrixInput {
  readonly entrypoint: string;
  readonly outdir: string;
  readonly name: string;
  readonly targets: readonly [Bun.Target, ...Bun.Target[]];
  readonly cwd?: string;
  readonly digest?: boolean;
  readonly options?: Bun.Options;
  readonly concurrency?: number;
}
```

`targets` is non-empty and provider-homogeneous. `concurrency` defaults to 1;
an explicit value must be a positive safe integer. Every intended path is
`<resolved outdir>/<name>-<canonical target>[.exe]`. For example:

```ts
const artifacts = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "linux-x64-gnu", "windows-x64"],
  concurrency: 2,
  digest: true,
  options: { minify: true },
});
```

This effect is equivalent to:

```ts
Effect.Effect<readonly Bun.Artifact[], Bun.MatrixError, Bun.Compiler>;
```

The successful Artifact order is exactly the target input order, independent
of cell completion order. Before any output or staging filesystem operation,
compile argv rendering, or build-child spawn, total preflight validates all
fields, every target, the shared provider options, and all canonical output
paths. Provider discovery and its one probe happen earlier, when the compiler
Layer is acquired. `InvalidMatrixInput` contains every deterministic issue from
that pass.

Execution is bounded and collect-all. A `MatrixFailed` contains the successful,
already committed Artifacts and every typed cell failure, each in target input
order. Successful cells are not rolled back when another cell fails. If the
matrix is interrupted, active children are terminated and their staging is
cleaned, queued cells do not start, and already committed Artifacts remain.
Interruption stays in the Effect Cause and is not returned as `MatrixError`.

## Artifact

```ts
interface Artifact {
  readonly path: string;
  readonly bytes: number;
  readonly digest?: `sha256:${string}`;
  readonly target: Target.Target;
  readonly tool: {
    readonly name: "bun" | "deno";
    readonly version: string;
    readonly path: string;
  };
}
```

The root `Artifact.Artifact` runtime schema is a provider-correlated Bun/Deno
union. It accepts only target and tool pairs present in the provider target
tables. Provider Artifact aliases narrow both `target` and `tool.name` without
adding another runtime schema.

## Exhaustive scalar error handling

`BuildError.BuildError` applies only to `compileExecutable`. Existing exhaustive
scalar handlers do not need matrix cases:

```ts
const scalar: Effect.Effect<Bun.Artifact, never, Bun.Compiler> = Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
}).pipe(
  Effect.catchTags({
    ToolNotFound: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    ToolProbeFailed: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    ToolFailed: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    TargetUnsupported: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    InvalidDriverOptions: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    OutputMissing: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    OutputInvalid: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    OutputLocked: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    PublicationFailed: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
  }),
);
```

## Exhaustive matrix error handling

`Bun.MatrixError` and `Deno.MatrixError` are provider-narrowed type aliases of
the separate root `MatrixError.MatrixError` schema. Exhaustive matrix handling
has exactly two cases:

```ts
const matrix: Effect.Effect<readonly Bun.Artifact[], never, Bun.Compiler> = Bun.compileExecutableMatrix({
  entrypoint: "src/main.ts",
  outdir: "dist",
  name: "app",
  targets: ["macos-aarch64", "linux-x64-gnu"],
}).pipe(
  Effect.catchTags({
    InvalidMatrixInput: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
    MatrixFailed: (error) => Effect.logError(error).pipe(Effect.andThen(Effect.die(error))),
  }),
);
```

The unions are intentionally separate: matrix coordination does not add tags
to `BuildError.BuildError`, and interruption is a Cause for both operations.

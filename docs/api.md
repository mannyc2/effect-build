# API

The package exports exactly three entry points:

```ts
import { Artifact, BuildError, Target } from "effect-build";
import * as Bun from "effect-build/bun";
import * as Deno from "effect-build/deno";
```

The root exports schemas and types. Each compiler module has exactly three
runtime keys: `Compiler`, `compileExecutable`, and `layer`.

## Compile input

```ts
interface CompileExecutableInput<Options> {
  readonly entrypoint: string;
  readonly outfile: string;
  readonly cwd?: string;
  readonly target?: Target.Target;
  readonly digest?: boolean;
  readonly options?: Options;
}
```

`entrypoint` and `outfile` are the only required fields. Relative paths are
resolved using `cwd` when provided. `digest` opts into reading the completed
output and computing SHA-256.

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

The success type is `Artifact.Artifact`. The effect error type is the closed
`BuildError.BuildError` union, and compiler Layers capture their platform
requirements so a fully provided compile effect has no remaining context.

## Exhaustive tagged error handling

`Effect.catchTags` checks that every current tag is handled. This example turns
all build failures into defects after logging, leaving a typed Artifact success:

```ts
const program: Effect.Effect<Artifact.Artifact, never, Bun.Compiler> = Bun.compileExecutable({
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

Interruption remains an Effect interruption and is not a member of the build
error union.

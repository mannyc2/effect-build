# effect-build-deno

Compile, bundle, and transpile TypeScript into core `Artifact` values.

```ts
import * as Deno from "effect-build-deno";

const compiled = Deno.compile({
  entrypoint: "src/cli.ts",
  outfile: "dist/cli",
  options: { allowRead: true },
});
```

Provide `Deno.layer()` and platform services to run it. `target` accepts the core
platform names or Deno's native triples; Deno does not compile musl targets.
Windows outputs must end in `.exe`.
`bundle({ entrypoints, outdir })` and `transpile({ files, outdir })` return
`Artifact.Directory`. Native flags go in `options`. Each operation writes through
`Commit.atomic` by default; `atomic: false` writes directly. Staging preserves the
output basename because Deno uses it for the compiled program's identity.

`layer({ executable?, version?, runtime? })` resolves Deno once. The default tested
version is exactly 2.9.5; 2.9.6 removed supported flags. An explicit `runtime` sets
`DENORT_BIN` and adds its path and SHA-256 to the compiled artifact, without
execute-probing the runtime. Inputs accept `cwd` and `env` for process setup.

`watch({ entrypoint, outfile, options? })` is scoped and rebuilds directly into its
output file. `effect-build-deno/api` wraps `Deno.bundle` in the Deno runtime.

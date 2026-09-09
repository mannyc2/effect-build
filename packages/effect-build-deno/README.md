# effect-build-deno

```ts
import * as Deno from "effect-build-deno";
const executable = Deno.compile({ entrypoint: "src/cli.ts", outfile: "dist/cli" });
```

Provide `Deno.layer({ executable?, version?, runtime? })` and platform services.
`compile` returns an executable; `bundle({ entrypoints, outdir })` and
`transpile({ files, outdir })` return directories. Native flags belong in `options`.
Core targets and native triples are accepted; musl compilation is unsupported.
Windows output requires lowercase `.exe`; staging preserves the output basename.

`supported` is `>=2.9.5 <3.0.0` and `tested` is 2.9.5; flags removed in 2.9.6 are rejected by the operations that use them. An explicit `runtime`
sets `DENORT_BIN` and records its path/hash without executing it during resolution.
`watch` requires a scope and rebuilds directly. `effect-build-deno/api` exports
`Bundle` and `layer` for native `Deno.bundle`; **that subpath requires Deno**.

[Setup](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)

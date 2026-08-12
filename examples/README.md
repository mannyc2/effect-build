# Examples

- [`bun-compile.ts`](bun-compile.ts) uses PATH discovery by default and supports
  an explicit compiler path through `EFFECT_BUILD_BUN_BIN`.
- [`bun-matrix.ts`](bun-matrix.ts) compiles one Bun entry point for three targets
  with bounded concurrency, canonical output names, and optional digests.
- [`deno-compile.ts`](deno-compile.ts) demonstrates Deno-only bundle,
  minification, and permission options.

Every example provides one compiler Layer and the official Node services once.
The matrix is provider-homogeneous: it does not install a compiler, execute
foreign output, or promise rollback of artifacts committed by successful cells.
The examples are compiled against the packed package by `pnpm test:consumer`.

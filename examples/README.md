# Examples

- [`bun-compile.ts`](bun-compile.ts) uses PATH discovery by default and supports
  an explicit compiler path through `EFFECT_BUILD_BUN_BIN`.
- [`deno-compile.ts`](deno-compile.ts) demonstrates Deno-only bundle,
  minification, and permission options.

Both examples provide official Node services once and receive a typed Artifact.
They are compiled against the packed package by `pnpm test:consumer`.

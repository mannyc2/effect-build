# Examples

- [`bun/src/compile.ts`](bun/src/compile.ts) uses PATH discovery by default and
  supports an explicit compiler path through `EFFECT_BUILD_BUN_BIN`.
- [`bun/src/matrix.ts`](bun/src/matrix.ts) compiles one Bun entry point for
  three targets with bounded concurrency, canonical output names, and optional
  digests.
- [`deno/src/compile.ts`](deno/src/compile.ts) demonstrates Deno-only bundle,
  minification, and permission options.

The Bun and Deno directories are private Bun workspaces and declare only the
public provider package they consume. Every example provides one compiler Layer
and the official Node services once. The matrix is provider-homogeneous: it
does not install a compiler, execute foreign output, or promise rollback of
Artifacts committed by successful cells.

`bun run test:consumer` typechecks equivalent public calls against each packed
provider in clean npm and Bun installations.

# Examples

- [`bun/src/compile.ts`](bun/src/compile.ts) demonstrates scalar Bun compilation.
- [`bun/src/matrix.ts`](bun/src/matrix.ts) demonstrates bounded homogeneous Bun targets.
- [`deno/src/compile.ts`](deno/src/compile.ts) demonstrates Deno bundle, minify, and permissions.
- [`esbuild/src/bundle.ts`](esbuild/src/bundle.ts) uses the independent scoped Esbuild producer.
- [`node-sea/src/compile.ts`](node-sea/src/compile.ts) composes public Esbuild and Node SEA operations.

Each workspace declares every public integration it imports directly and
provides one official Node platform Layer. The Node SEA example uses exact
Esbuild 0.28.2 bundle production and an already-installed exact Node 26.7.0
Linux x64 GNU producer. It does not use an integration sibling dependency.

`bun run test:consumer` packs all five packages once and checks isolated npm
and Bun consumers plus explicit Esbuild-to-Node-SEA applications.

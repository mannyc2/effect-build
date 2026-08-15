# effect-build

Provider-neutral Effect-native file, executable, target, error, scoped bundle,
and publication semantics.

The root runtime namespaces are `Artifact`, `BuildError`, `JavaScriptBundle`,
`MatrixError`, and `Target`. `JavaScriptBundle.Artifact` is a nominal live
capability usable only inside its continuation, not a durable serializable
record.

`effect-build/Integration` exposes only bounded command execution, live bundle
inspection, owned bundle production, and executable production for integration
authors. `effect-build/Provider` exposes only the command-provider `define`
factory used by Bun and Deno. Neither is a registry, generic builder, bundler,
packager, executor, candidate, cache, or publication API.

Applications import operations from `effect-build-bun`, `effect-build-deno`,
`effect-build-esbuild`, or `effect-build-node-sea`. Stage observations are not
receipts, provenance, or reproducibility claims.

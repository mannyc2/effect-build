# effect-build

Portable Effect-native executable schemas, errors, operation contracts, and
shared lifecycle. Install it with exactly one provider:
`effect-build-bun` or `effect-build-deno`.

The root export contains `Artifact`, `BuildError`, `JavaScriptBundle`,
`MatrixError`, and `Target`. `JavaScriptBundle.Artifact` is a nominal capability
that is live only inside its continuation; it is not a serializable durable
file record.

The `effect-build/Integration` author subpath exposes exactly
`executeCommand`, `inspectLiveJavaScriptBundle`, `produceExecutable`, and
`withOwnedJavaScriptBundle`. These are narrow integration-author foundations;
they expose no generic builder, bundler, executor, registry, candidate, or
rename authority. The `effect-build/Provider` authoring path exposes only the
closed `define` runtime factory. Applications normally import their unchanged
scalar and matrix operations from a provider package. Plan 024 owns the atomic
five-package Esbuild/Node SEA split.

Stage observations record tools seen doing work. They are not receipts,
provenance, or reproducibility claims. Exactly one core operation validates,
optionally hashes, and atomically renames executable candidates.

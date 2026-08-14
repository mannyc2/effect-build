# effect-build

Portable Effect-native executable schemas, errors, operation contracts, and
shared lifecycle. Install it with exactly one provider:
`effect-build-bun` or `effect-build-deno`.

The root export contains `Artifact`, `BuildError`, `MatrixError`, and
`Target`. The `effect-build/Provider` authoring path exposes only the closed
`define` runtime factory. Applications normally import their build operations
from a provider package.

# Integrations

`effect-build-bun/CompileExecutable` and
`effect-build-deno/CompileExecutable` compile a selected executable. Their
`layer` constructors discover and probe only their respective compiler; they
never fall back to another tool or install one.

`effect-build-esbuild/Build` contains the selected build operation and layer.
`effect-build-esbuild/Context` contains the separate incremental-context
operation and layer. Both use the package's exact raw Esbuild dependency.

`effect-build-node-sea/AssembleExecutable` assembles one Node SEA executable
from its declared input. It owns Node SEA validation and diagnostics, and it
does not compile application source or import an Esbuild/Bun sibling.

Provide an official platform layer at the application boundary. A compiler
layer chooses a tool only; it does not choose the Effect runtime or artifact
target.

# Examples

Each example imports the 0.4 candidate from its exact public subpath:

- `bun` uses `effect-build-bun/CompileExecutable`.
- `deno` uses `effect-build-deno/CompileExecutable`.
- `esbuild` uses `effect-build-esbuild/Build`.
- `node-sea` uses `effect-build-node-sea/AssembleExecutable`.

They demonstrate application composition with an official Effect platform
layer. They do not use removed root operations or legacy subpaths.

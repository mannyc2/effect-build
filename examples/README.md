# Examples

Each example imports the research-complete hard cut from its exact provider
lane:

- `bun` uses `effect-build-bun/Command` for build and executable compilation.
- `deno` uses `effect-build-deno/Command` for transpilation and executable compilation.
- `esbuild` uses `effect-build-esbuild/Api`.
- `node-sea` uses `effect-build-node-sea/Command`.
- Rolldown has no public example because its package and conditional operations
  remain private until R6 and their named gates close.

They demonstrate application composition with an official Effect platform
layer. They do not use removed root operations or legacy subpaths.

# effect-build-bun

`Bun` is an Effect service for Bun's native `build` and `compile` commands. Import the service from
`effect-build-bun`; input schemas and types are also available at `effect-build-bun/Bun`.

`Bun.layer` resolves Bun once from an explicit executable or PATH, and warns when its one version probe is outside
1.3.x/1.4.x. Methods capture their platform dependencies and return absolute output paths.

| Method | Input | Result |
| --- | --- | --- |
| `build` | Entrypoints, outdir, Bun's bundle target | Output directory |
| `compile` | Entrypoints, outfile, Bun's native target spelling | Executable path |

Inputs expose minification, externals and `extraArgs`. Native cwd/env options are preserved. `atomic: true` stages
outputs beside their destination; compile also checks the four-byte native header. Directory publication replaces
produced files individually and preserves unrelated files. Windows compile targets append `.exe` when needed.
`extraArgs` retains native tool behavior and can change where the tool writes.

Applications supply an Effect platform layer. `Bun.layerConfig` reads options through Config. Native failures are
`ToolError` values with Bun's diagnostics. See the repository examples for layer composition and executable builds.

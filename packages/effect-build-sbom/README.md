# effect-build-sbom

`Sbom` runs Syft as an Effect service. Import it from `effect-build-sbom`; inputs and native format choices are
available at `effect-build-sbom/Sbom`.

`Sbom.layer` resolves Syft once. `generate` accepts a native source, output format and outfile, and returns its absolute
path. Formats are `syft-json`, `spdx-json@2.3` and `cyclonedx-json@1.6`. `report` returns Syft's decoded native JSON
structure, bounded to 16 MiB. Package discovery does not establish inventory completeness.

Native source spellings, cwd/env and `extraArgs` remain available. `atomic: true` stages a generated file before its
rename; report collection does no filesystem publication or digest work. Applications provide the Effect platform
layer. `Sbom.layerConfig` reads layer options through Config.

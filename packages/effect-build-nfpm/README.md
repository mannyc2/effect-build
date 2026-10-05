# effect-build-nfpm

`Nfpm` packages native nFPM configuration through an Effect service. Import it from `effect-build-nfpm`; schemas and
options are available at `effect-build-nfpm/Nfpm`.

`Nfpm.layer` resolves nFPM once. `package` accepts a YAML/JSON config path, native packager format and outfile, and
returns the absolute output path. nFPM owns configuration validation, contents, scripts, architecture and metadata.
The binding forwards cwd/env and supports `extraArgs`.

Choose `atomic: true` to stage and rename the resulting package. Configuration expansion and any other writes performed
by nFPM remain native behavior. Methods capture their platform dependencies; applications provide the Effect platform
layer and can configure layer options through `Nfpm.layerConfig`.

# effect-build-deno

`Deno` is an Effect service for native `compile` and `bundle` commands. Import it from `effect-build-deno`;
input types and Deno's native `Target` are available at `effect-build-deno/Deno`.

`Deno.layer` resolves one executable from an explicit path or PATH. Its methods capture the platform and return
absolute output paths. `compile` accepts an entrypoint, outfile, native target, an allow-all option and script arguments.
`bundle` accepts entrypoints, outdir, native platform/format and minification. Further flags use `extraArgs`.

Atomic publication is chosen with `atomic: true`. Compilation checks the native header and keeps the final basename
while staging, because Deno embeds that name. Windows outputs append `.exe`. Bundle files commit individually,
leaving unrelated destination files intact. Native cwd/env options are forwarded; an optional layer `runtime` supplies
`DENORT_BIN` without probing or recording that runtime.

Configuration and tool capabilities remain Deno's responsibility. No JavaScript API wrapper, host check or version
admission gate runs. `Deno.layerConfig` reads configuration, and applications supply the Effect platform layer.

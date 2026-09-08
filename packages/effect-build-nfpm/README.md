# effect-build-nfpm

`import * as Nfpm from "effect-build-nfpm"` to build Debian, RPM, Alpine, Arch Linux,
and MSIX packages with `Nfpm.package`, returning `Artifact.File`.
Provide `Nfpm.layer({ executable?, version? })` and platform services; the layer
resolves nFPM once. `tested` is `>=2.47.0 <3.0.0`.

Inputs name `format`, `outfile`, `contents`, and package metadata: `name`, `version`,
`architecture`, `maintainer`, `description`, `release`, and `mtime`.
Each content entry has a regular `artifact` and absolute package destination `dst`;
verified bytes are copied privately. Modes default to `0755` for executables and
`0644` for files, with a `mode` override. Metadata is literal, without environment
expansions. MSIX also requires `msix` metadata. `cwd` resolves relative output paths.

[Pipeline example](../../examples/artifact-pipeline) · [Setup and atomic output](../../docs/getting-started.md) · [Errors](../../docs/errors.md)

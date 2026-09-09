# effect-build-nfpm

`import * as Nfpm from "effect-build-nfpm"` to build Debian, RPM, Alpine, Arch Linux,
and MSIX packages with `Nfpm.package`, returning `Artifact.File`.
Provide `Nfpm.layer({ executable?, version? })` and platform services; the layer
resolves nFPM once. `supported` is `>=2.47.0 <3.0.0`; CI tests 2.47.0.

Pass `{ format, config, contents, outfile, cwd?, atomic? }`. `config` uses
[nFPM's native configuration](https://nfpm.goreleaser.com/configuration/), including
`arch`, `depends`, format-specific settings, lifecycle `scripts`, overrides, and
native environment expansion. JSON-compatible fields are preserved and nFPM
validates its own options. Relative configuration paths resolve against `cwd`.

```ts
const result = yield* Nfpm.package({
  format: "deb",
  config: {
    name: "hello", version: "1.0.0", arch: "amd64", maintainer: "Your team",
    description: "Hello CLI", scripts: { postinstall: "packaging/postinstall.sh" },
  },
  contents: [{ artifact: executable, dst: "/usr/bin/hello" }],
  outfile: "dist/hello.deb",
});
```

Each content has a regular `artifact` and absolute package destination `dst`;
verified bytes are copied privately. Modes default to `0755` for executables and
`0644` for files, with a `mode` override. Executable OS and architecture must match
the package format and `config.arch`; MSIX requires Windows executables. An `all`
or `noarch` package cannot contain an executable artifact. ABI/minimum OS policy
is still supplied by the project. MSIX also requires native `config.msix` metadata.

The operation owns `contents` and `disable_globbing`; these cannot appear in
`config` or format overrides. Overrides also cannot change `arch` or `platform`.
This keeps every packaged artifact tied to its verified bytes and target.

[Pipeline example](../../examples/artifact-pipeline) · [Setup and atomic output](../../docs/getting-started.md) · [Errors](../../docs/errors.md)

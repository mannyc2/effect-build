# effect-build-nfpm

Build Debian, RPM, Alpine, Arch Linux, and MSIX packages from artifacts with
[nFPM](https://nfpm.goreleaser.com), as Effect programs. Each package comes back as an
`Artifact.File`.

```sh
npm install --save-dev --save-exact effect-build-nfpm@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

nFPM 2.47 or newer must be installed.

## Usage

```ts
import { Effect } from "effect";
import * as Nfpm from "effect-build-nfpm";

const deb = (executable: Artifact.Executable) =>
  Nfpm.package({
    format: "deb",
    config: {
      name: "hello",
      version: "1.0.0",
      arch: "amd64",
      maintainer: "Release Team <release@example.com>",
      description: "Hello CLI",
      depends: ["ca-certificates"],
      scripts: { postinstall: "packaging/postinstall.sh" },
    },
    contents: [{ artifact: executable, dst: "/usr/bin/hello" }],
    outfile: "dist/hello_1.0.0_amd64.deb",
  }).pipe(Effect.provide(Nfpm.layer()));
```

`package({ format, config, contents, outfile, cwd?, atomic?, onExists?, prefix? })` takes:

- `format`: `deb`, `rpm`, `apk`, `archlinux`, or `msix`.
- `config`: [nFPM's native configuration](https://nfpm.goreleaser.com/configuration/) as JSON,
  with `name`, `version`, and `arch` required. `depends`, `platform`, format-specific sections,
  lifecycle `scripts`, `overrides`, and environment expansion pass through, and nFPM validates
  them. Relative paths in the configuration resolve against `cwd`. MSIX needs its native
  `config.msix` metadata.
- `contents`: `{ artifact, dst, mode? }` for each regular artifact and its absolute destination.
  Verified bytes are copied privately before nFPM runs. Modes default to `0755` for executables
  and `0644` for files.

The operation owns `contents` and `disable_globbing`, which cannot appear in `config` or in
format overrides, and overrides cannot change `arch` or `platform`. Every executable's OS and
architecture must match the format and `config.arch`: MSIX requires Windows executables, and an
`all` or `noarch` package cannot contain an executable. ABI and minimum OS policy stay with the
project.

## Versions

`Nfpm.layer({ executable?, version? })` resolves nFPM once. `Nfpm.supported` is `>=2.47.0 <3.0.0`,
the versions accepting the JSON configuration, `disable_globbing`, and the MSIX packager used
here; `Nfpm.tested` is 2.47.0, exercised with every format. See
[tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md).

## Errors

`Nfpm.PackageError` is `InputInvalid` (tag `NfpmInputInvalid`), `Artifact.ArtifactError`,
`Tool.Failed`, `Tool.SpawnFailed`, or `Commit.CommitError`. `Nfpm.Format`, `Nfpm.Content`,
`Nfpm.Configuration`, and `Nfpm.PackageInput` are exported as schemas.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Artifact pipeline example](https://github.com/mannyc2/effect-build/tree/main/examples/artifact-pipeline) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)

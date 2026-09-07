# effect-build-nfpm

Build Debian, RPM, Alpine, Arch Linux, and MSIX packages with nFPM and return an
`Artifact.File`.

```ts
import * as Nfpm from "effect-build-nfpm";

const deb = yield* Nfpm.package({
  format: "deb",
  name: "hello",
  version: "1.0.0",
  architecture: "amd64",
  maintainer: "Example <build@example.test>",
  description: "A compiled TypeScript application",
  release: "1",
  mtime: "2026-01-01T00:00:00Z",
  contents: [{ artifact: executable, dst: "/usr/bin/hello" }],
  outfile: "dist/hello.deb",
});
```

Provide `Nfpm.layer()` and platform services. The layer resolves nFPM once; set
`executable` to select a binary and `version` to override the tested range
`>=2.47.0 <3.0.0`.

`contents` accepts regular files and executables directly. Their bytes are verified
and copied into private temporary files before packaging. Package destinations are
absolute paths. Modes default to `0755` for executables and `0644` for files; use
`mode` to override them. Metadata is literal and cannot contain environment-variable
expansions. MSIX packages also require native `msix` metadata.

`outfile` is resolved against `cwd` when supplied. Output is staged and renamed by
default; `atomic: false` writes directly. Failures include `InputInvalid` and the
shared artifact, tool, and commit errors.

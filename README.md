# effect-build

Compile TypeScript into things you can ship, as composable Effect programs.

```ts
import * as Bun from "effect-build-bun";
Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
```

The result is an Effect that builds an executable and records its path, numeric byte
count, SHA-256, target, and compiler. [Run this example](docs/getting-started.md) with
Bun 1.3.14 or 1.4.2 and platform services. Windows outputs require `dist/cli.exe`.

Every file-producing package returns the same `Artifact.File`, `Artifact.Executable`,
or `Artifact.Directory`. Pass a compiled executable straight into an archive, an OS
package, or a Python wheel. Native memory APIs retain their tool's result types.

| Package | What you can build |
| --- | --- |
| [effect-build](packages/effect-build) | Artifacts, targets, tools, commits, checksums |
| [effect-build-bun](packages/effect-build-bun) | Executables, bundles, scoped watch; native Bun API |
| [effect-build-deno](packages/effect-build-deno) | Executables, bundles, transpilation, scoped watch; native Deno API |
| [effect-build-esbuild](packages/effect-build-esbuild) | Bundles, transforms, scoped rebuild/watch/serve |
| [effect-build-rolldown](packages/effect-build-rolldown) | Bundles, transforms, scoped builders and watch |
| [effect-build-node-sea](packages/effect-build-node-sea) | Node single executables with assets |
| [effect-build-archives](packages/effect-build-archives) | Deterministic ZIP, tar.gz, Git source archives |
| [effect-build-python](packages/effect-build-python) | uv builds and wheels written directly from artifacts |
| [effect-build-nfpm](packages/effect-build-nfpm) | Debian, RPM, Alpine, Arch Linux, MSIX packages |
| [effect-build-sbom](packages/effect-build-sbom) | SPDX and CycloneDX JSON |
| [effect-build-windows](packages/effect-build-windows) | MSIX signing (experimental) |
| [effect-build-apple](packages/effect-build-apple) | Apps, DMGs, installers, signing and notarization (experimental) |

Checks are combinators: `Executable.expectTarget`, `Tool.requireVersion`, and
`Artifact.verify`. Producers stage and check output before committing by default;
`atomic: false` writes directly. `Commit.atomic(..., { onExists: "fail" })` rejects
an existing destination; replacement is the default. See [errors](docs/errors.md).

The [CLI example](examples/cli) compiles four targets, writes a JSON manifest, and
passes `sha256sum -c dist/SHA256SUMS`. The [artifact pipeline](examples/artifact-pipeline)
composes all producers. Read [providers](docs/providers.md) for tested tool versions
and [DESIGN.md](DESIGN.md) for decisions. Release systems own publishing.

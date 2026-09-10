# effect-build

[![CI](https://github.com/mannyc2/effect-build/actions/workflows/ci.yml/badge.svg)](https://github.com/mannyc2/effect-build/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/effect-build)](https://www.npmjs.com/package/effect-build)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Compile TypeScript into things you can ship, as composable [Effect](https://effect.website) programs.

effect-build turns a TypeScript program into native executables, bundles, archives, OS packages,
Python wheels, signed macOS and Windows products, and SBOMs. Every operation is an Effect, every
result is the same small record of what was made, and the records compose: the executable Bun
compiled is the artifact the archive, the installer, the signer, and the SBOM scanner accept.

```ts
const release = Effect.gen(function*() {
  const executable = yield* Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli", target: "linux-x64" });
  const archive = yield* Archive.tarGz({
    entries: [{ artifact: executable, path: "cli" }],
    outfile: "dist/cli.tar.gz",
  });
  return yield* Checksums.write({ artifacts: [archive], outfile: "dist/SHA256SUMS" });
});
```

Publishing is not effect-build's job. It hands you files on disk and a JSON manifest; a release
tool, a CI workflow, or your own script takes it from there.

## Highlights

- **One artifact type.** Every producer returns an `Artifact.File`, `Artifact.Executable`, or
  `Artifact.Directory`: path, byte count, SHA-256, and what produced it. An executable's target
  is read from its ELF, Mach-O, or PE header, never assumed.
- **Producers compose.** A compiled executable goes straight into a ZIP, a tar.gz, a deb, an
  RPM, an MSIX, a Python wheel, a DMG, a PKG, a code signer, or a Syft scan. A bundle directory
  archives the same way. Effect supplies concurrency, scoping, interruption, and typed errors.
- **Output is staged, checked, then committed.** Producers write to a staging directory, verify
  what they wrote, and rename it into place. A failed build never leaves a truncated file, and a
  release directory replaces the previous one as a unit.
- **Archives are reproducible.** ZIP and tar.gz bytes depend only on their inputs: fixed
  timestamps, fixed ordering, fixed compression. No external archiver is needed.
- **Tools are resolved once.** A provider layer locates a compiler, records its path, version,
  and hash, and every operation runs against that record. Version policy is an option.
- **Errors are values.** Every failure is a tagged error with useful fields, and an unhandled one
  prints as `Tag: message`, such as `ToolNotFound: bun not found (searched: PATH)`.

## Quick start

You need Node 22.19 or newer and [Bun](https://bun.sh) 1.3.14 or newer on `PATH`. Install the
Bun provider with Effect and its Node platform, pinned to one release candidate:

```sh
npm install --save-dev --save-exact effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

Save this as `build.mjs` next to a `src/cli.ts`:

```js
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
    Effect.tap((artifact) => Effect.log(artifact)),
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Run `node build.mjs`. It compiles `dist/cli` (`dist/cli.exe` is required on Windows) and logs
the artifact record:

```
kind: 'executable',
path: '/home/you/app/dist/cli',
bytes: 63446114,
sha256: 'd6f24411b71792aa84488e109dccc74ba6816b03af0647b1f065f0117ff7a73c',
producedBy: { name: 'bun', version: '1.3.14', path: '/usr/local/bin/bun', sha256: 'e0c90ec1…' },
target: 'darwin-arm64',
format: 'mach-o'
```

Add `target: "linux-arm64"` to cross-compile, or `options: { minify: true }` to minify. The
[getting started guide](docs/getting-started.md) explains each line and what to do when the
compiler is not on `PATH`.

## Ship a release

A release is a matrix of targets, one archive per target, and a checksum file, committed as a
whole. This is the [CLI example](examples/cli), abridged:

```ts
const release = Commit.atomic("dist", (staged) =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const build = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
    const archives = yield* Effect.forEach(targets, (target) =>
      Effect.gen(function*() {
        const { os, executableSuffix } = Target.parts(target);
        const executable = yield* Bun.compile({
          entrypoints: ["src/cli.ts"],
          outfile: path.join(build, target, `hello${executableSuffix}`),
          target,
        });
        const entries = [{ artifact: executable, path: `hello${executableSuffix}` }];
        const outfile = path.join(staged, `hello_0.7.0_${target}`);
        return yield* os === "windows"
          ? Archive.zip({ entries, outfile: `${outfile}.zip` })
          : Archive.tarGz({ entries, outfile: `${outfile}.tar.gz` });
      }), { concurrency: 2 });
    yield* Checksums.write({ artifacts: archives, outfile: path.join(staged, "SHA256SUMS") });
    return yield* Artifact.directory(staged, { name: "hello", version: "0.7.0" });
  }), { staging: "sibling" });
```

The result is a directory that `sha256sum -c` accepts from anywhere the tree is moved to,
recorded as one `Artifact.Directory` with an entry per file:

```
dist/
├── SHA256SUMS
├── hello_0.7.0_darwin-arm64.tar.gz
├── hello_0.7.0_linux-arm64.tar.gz
├── hello_0.7.0_linux-x64-musl.tar.gz
├── hello_0.7.0_linux-x64.tar.gz
└── hello_0.7.0_windows-x64.zip
```

If any target fails, `dist/` is left exactly as it was. The [recipes](docs/recipes.md) cover the
rest of a release: OS packages, wheels that install a native command, signing and notarization,
SBOMs, and handing the manifest to whatever publishes.

## Packages

| Package                                                 | What it builds                                                                        | Needs                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| [effect-build](packages/effect-build)                   | Artifacts, targets, executable inspection, tool resolution, atomic commits, checksums | Effect                          |
| [effect-build-bun](packages/effect-build-bun)           | Native executables and bundles with Bun; scoped watch; Bun's in-process API           | Bun 1.3.14+                     |
| [effect-build-deno](packages/effect-build-deno)         | Executables, bundles, and transpiled trees with Deno; scoped watch; Deno's bundle API | Deno 2.9.5+                     |
| [effect-build-esbuild](packages/effect-build-esbuild)   | Bundles and transforms with esbuild; scoped rebuild, watch, and serve                 | esbuild 0.28 (peer)             |
| [effect-build-rolldown](packages/effect-build-rolldown) | Bundles and transforms with Rolldown; scoped builders and watch streams               | Nothing (Rolldown is bundled)   |
| [effect-build-node-sea](packages/effect-build-node-sea) | Node single executable applications with embedded assets                              | Node 22 to 26                   |
| [effect-build-archives](packages/effect-build-archives) | Reproducible ZIP and tar.gz archives; exact Git source archives                       | Nothing (Git for `source`)      |
| [effect-build-python](packages/effect-build-python)     | Wheels written directly from artifacts; sdists and wheels of Python projects with uv  | Nothing (uv for `build`)        |
| [effect-build-nfpm](packages/effect-build-nfpm)         | Debian, RPM, Alpine, Arch Linux, and MSIX packages with nFPM                          | nFPM 2.47+                      |
| [effect-build-sbom](packages/effect-build-sbom)         | SPDX and CycloneDX JSON with Syft                                                     | Syft 1.50+                      |
| [effect-build-windows](packages/effect-build-windows)   | Authenticode signing of executables and MSIX files (experimental)                     | Windows SDK SignTool            |
| [effect-build-apple](packages/effect-build-apple)       | App bundles, DMGs, PKGs, signing, notarization, and assessment (experimental)         | macOS, Xcode command-line tools |

Every package is ESM, depends on `effect-build` for its types, and accepts Effect
`>=4.0.0-rc.108 <4.1.0-0` as a peer. The exact versions each tool is tested with are in
[tools and providers](docs/providers.md).

## How it fits together

- **Artifacts** are records of files on disk: `kind`, `path`, `bytes`, `sha256`, `producedBy`,
  plus `target` and `format` for executables and a sorted entry manifest for directories.
  `Artifact.verify` re-reads one against its record; `Artifact.encode` and `decode` turn a list
  into JSON and back.
- **Targets** are eight strings: `linux-x64`, `linux-x64-musl`, `linux-arm64`,
  `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`. Linux without
  a suffix means glibc.
- **Providers** wrap one tool each. `Bun.layer({ executable?, version? })` resolves the tool
  once; `Bun.compile`, `Bun.bundle`, and the rest run against it. In-process tools (esbuild,
  Rolldown, the archive and wheel writers) need no layer, only the platform services.
- **Commits** make output atomic. Producers stage, verify, and rename by default; `atomic: false`
  writes in place, `onExists: "fail"` refuses to replace a file, and `Commit.atomic` gives a
  whole directory of your own output the same guarantee.
- **Checks** are combinators you add where you want them: `Artifact.verify`,
  `Executable.expectTarget`, `Tool.requireVersion`.

## Documentation

- [Getting started](docs/getting-started.md): the first build, line by line, and what to do next.
- [Recipes](docs/recipes.md): target matrices, archives, packages, wheels, signing, SBOMs,
  manifests, and wrapping your own tools.
- [Tools and providers](docs/providers.md): how tool layers work, and the versions each provider
  accepts and is tested with.
- [Compatibility](docs/compatibility.md): Node, TypeScript, and Effect requirements, plus the
  host and target support matrix.
- [Errors and checks](docs/errors.md): every error type, atomic output, and recovery.
- [Design](DESIGN.md): what effect-build is, what it refuses to be, and the decisions behind it.
- [Changelog](CHANGELOG.md), including how to upgrade from 0.6.

## Examples

- [CLI](examples/cli): five targets, one archive each, a checksum file, and one atomic `dist/`.
- [Artifact pipeline](examples/artifact-pipeline): every producer in one program, from a compiled
  executable to archives, wheels, bundles, Node SEA, Deno, deb packages, uv builds, and an SBOM.
  Its [signing module](examples/artifact-pipeline/src/signing.ts) shows Windows Authenticode and
  macOS Developer ID flows for both bare executables and app bundles.

## Requirements

Node 22.19 or newer runs the build program (Node 24 also runs `build.ts` directly). Packages are
ESM-only and typecheck from TypeScript 5.9. Effect 4.0.0-rc.108 is the tested version; every
release candidate from it installs. Compilers and packagers are separate installs, resolved from
`PATH` or an explicit path. Details are in [compatibility](docs/compatibility.md).

## Contributing

`bun install --frozen-lockfile` then `bun run verify` builds, typechecks, lints, and runs the
unit tests and both examples. [CONTRIBUTING.md](CONTRIBUTING.md) lists the real-tool test
commands and how releases are cut; [AGENTS.md](AGENTS.md) holds the rules every change follows.

## License

[MIT](LICENSE)

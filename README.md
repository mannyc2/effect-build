# effect-build

[![CI](https://github.com/mannyc2/effect-build/actions/workflows/ci.yml/badge.svg)](https://github.com/mannyc2/effect-build/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/effect-build)](https://www.npmjs.com/package/effect-build)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Run build tools as [Effect](https://effect.website) programs. Producers return a hashed record
of what they wrote; records compose; output is staged, checked, then committed.

## Quick start

You need Node 22.19 or newer and [Bun](https://bun.sh) 1.3.14 or newer on `PATH`. Install the
Bun provider with Effect and its Node platform, pinned to one release candidate:

```sh
npm install --save-dev --save-exact effect-build-bun@0.8.0 effect@4.0.0-rc.115 @effect/platform-node@4.0.0-rc.115 @effect/platform-node-shared@4.0.0-rc.115
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

## Any tool is a producer

A provider wraps a tool once; its operations use the same artifact and commit primitives as
our compilers. Here is a UPX provider (imports: `Context`, `Effect` from `effect`; `Artifact`,
`Commit`, `Tool` from `effect-build`):

```ts
class Upx extends Context.Service<Upx, Tool.Service>()("example/Upx") {}
const upx = Tool.provider(Upx, {
  name: "upx",
  version: { parse: Tool.versionPattern(/^upx (\d+\.\d+\.\d+)/u), supported: ">=4 <5", tested: ["4.2.0"] },
});
const compress = (executable: Artifact.Executable, outfile: string) => Effect.gen(function*() {
  const tool = yield* upx.resolved;
  return yield* Commit.output(outfile, (staged) =>
    Tool.run(tool, ["--best", "-o", staged, executable.path]).pipe(
      Effect.andThen(Artifact.executable(staged, Tool.producedBy(tool), executable.target)),
    ));
});
// Provide upx.layer() and your platform services, just like Bun.layer().
```

[The full recipe](docs/recipes.md#wrap-a-tool-that-has-no-provider) adds input validation and
the public [provider test kit](docs/recipes.md#test-a-provider).

## Compose

An executable feeds an archive, installer, signer, or SBOM scanner directly. A bundle directory
archives the same way; Effect supplies concurrency, scopes, interruption, and typed errors.
The [artifact pipeline](examples/artifact-pipeline) runs those compositions end to end.

## Build a matrix

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
        const outfile = path.join(staged, `hello_0.8.0_${target}`);
        return yield* os === "windows"
          ? Archive.zip({ entries, outfile: `${outfile}.zip` })
          : Archive.tarGz({ entries, outfile: `${outfile}.tar.gz` });
      }), { concurrency: 2 });
    yield* Checksums.write({ artifacts: archives, outfile: path.join(staged, "SHA256SUMS") });
    return yield* Artifact.directory(staged, { name: "hello", version: "0.8.0" });
  }), { staging: "sibling" });
```

The result is a directory that `sha256sum -c` accepts from anywhere the tree is moved to,
recorded as one `Artifact.Directory` with an entry per file:

```
dist/
├── SHA256SUMS
├── hello_0.8.0_darwin-arm64.tar.gz
├── hello_0.8.0_linux-arm64.tar.gz
├── hello_0.8.0_linux-x64-musl.tar.gz
├── hello_0.8.0_linux-x64.tar.gz
└── hello_0.8.0_windows-x64.zip
```

If any target fails, `dist/` is left exactly as it was. The [recipes](docs/recipes.md) cover the
rest of a release: OS packages, wheels that install a native command, signing and notarization,
SBOMs, and handing the manifest to whatever publishes.

## Compose application directories

`Directory.assemble` combines separately built programs, dependency trees and runtime assets
into one verified `Artifact.Directory`. It preserves directory members' modes and symlinks,
rejects conflicting shipping paths, and commits the complete output once. Omit a directory
entry's path to merge its contents at root; file entries require a shipping path.
`Archive.tarGz({ directory, outfile })` archives that tree without an extra directory prefix.
See the [Node and Bun application recipe](docs/recipes.md#assemble-node-and-bun-applications-with-runtime-assets).

## Cache

Declare every input that affects the output, then wrap a producer with `Cache.cached`.
A hit restores verified bytes at the requested path through `Commit.output`. The index and
object directory are services you provide; cache corruption rebuilds and failed ingest logs a
warning. The [CLI example](examples/cli) caches its five-target matrix. See [cache semantics](docs/cache.md)
for environment inputs, provider schemas, and failure behavior.

```ts
const source = yield* Artifact.directory("src", { name: "source", version: "1" });
const tool = yield* Bun.resolved;
const executable = yield* Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli", target }).pipe(
  Cache.cached({
    key: { operation: "Bun.compile", tool, inputs: [source], options: { entrypoints: ["src/cli.ts"], target } },
    outfile: "dist/cli",
    schema: Artifact.Executable,
  }),
  Effect.provide(Cache.objects(".effect-build/cache/objects")),
  Effect.provide(KeyValueStore.layerFileSystem(".effect-build/cache/keys")),
);
```

Import `Cache` from `effect-build` and `KeyValueStore` from `effect/unstable/persistence`.
This example assumes the source tree is the entire build input; add lockfiles, configuration,
assets, dependencies and environment values whenever the program uses them.

## Providers we ship

| Package                                                 | Produces                                                                        | Needs                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| [effect-build](packages/effect-build)                   | Artifacts, targets, executable inspection, providers, atomic commits, checksums, cache, testing | Effect                          |
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
`>=4.0.0-rc.113 <4.1.0-0` as a peer. The exact versions each tool is tested with are in
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
ESM-only and typecheck from TypeScript 5.9. The workspace tests Effect 4.0.0-rc.115, with a separate
rc.113 consumer for The Show. The Effect peer range starts at rc.113. Compilers and packagers are separate installs, resolved from
`PATH` or an explicit path. Details are in [compatibility](docs/compatibility.md).

## Contributing

`bun install --frozen-lockfile` then `bun run verify` builds, typechecks, lints, and runs the
unit tests and both examples. [CONTRIBUTING.md](CONTRIBUTING.md) lists the real-tool test
commands and how releases are cut; [AGENTS.md](AGENTS.md) holds the rules every change follows.

## License

[MIT](LICENSE)

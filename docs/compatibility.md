# Compatibility

What effect-build 0.7 runs on, what it typechecks with, which Effect it accepts, and what the
repository actually exercises for each operation.

## Runtime

- **ESM only.** Use `import` from a `.mjs` file, a `"type": "module"` package, or a TypeScript
  project configured for `NodeNext` or `Bundler`. CommonJS `require("effect-build")` and
  unlisted subpaths are unsupported.
- **Node 22.19.0** is the floor for the process that runs the build. Node 24 also runs a `build.ts`
  directly with its built-in type stripping. Bun runs the packages with `BunServices.layer`.
- The compiler a build selects is independent of the Node that runs it. Bun 1.3.14 can drive a
  build from Node 22, and Node SEA can embed a Node 26 while running under Node 24.

## TypeScript

**TypeScript 5.9.3** is the declaration floor. Installed tarballs are checked with `strict: true`
and `skipLibCheck: false` using TypeScript 5.9.3 with Node types 24.3.0, and TypeScript 6.0.3 with
Node types 24.13.3, the pairing that accounts for the `URLPattern` declarations TypeScript 6
changed. Every public export, including `effect-build-bun/api`, is imported and typechecked.
JavaScript source maps embed their sources; declaration maps resolve to the `src` files shipped
in each package.

## Effect

Effect 4 is a prerelease. Every package accepts `>=4.0.0-rc.108 <4.1.0-0` as its Effect peer
range, the shape Effect's own platform packages use, and **4.0.0-rc.108** is the tested version:
the workspace pins it and every installed-consumer check installs it. A newer release candidate
installs, and a non-gating CI consumer tracks the `rc` dist-tag to observe it, but nothing newer
is promised until it becomes the tested version. Effect 3 is unsupported.

Install `effect`, `@effect/platform-node`, and `@effect/platform-node-shared` at one version.
The platform packages' caret dependency can otherwise select a newer shared candidate with a
newer Effect peer. Stable Effect 4 support follows its release and verification.

## Support matrix

The matrix describes what the repository checks and where support ends. It is not a claim that
every host and target combination, or production signing, has been certified.

| Operation                                        | Host and tool                                                                                | Targets and evidence                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core artifacts, commits, archives, direct wheels | Node 22.19+ with `NodeServices`; Bun with `BunServices`                                      | Portable filesystem tests run on Linux, macOS, and Windows. Payloads stream; ZIP32 and ustar field widths are the only archive and wheel size limits.                                                                                                                                                                                                                                       |
| Bun compile and bundle                           | Bun CLI on a host Bun supports; the build may run on Node                                    | All eight core targets are accepted. Linux real-tool CI runs Bun 1.3.14 and 1.4.2 and builds Linux x64 glibc and musl, Linux arm64, and Windows x64. Building a target does not establish that every cross-compiled binary was executed.                                                                                                                                                    |
| Bun native API                                   | Bun runtime                                                                                  | Native build and transpiler results; these operations do not run on Node. Installed imports and declarations typecheck on Node.                                                                                                                                                                                                                                                             |
| Deno compile, bundle, transpile                  | Deno CLI on a host Deno supports                                                             | Native Deno targets, excluding musl. Linux real-tool CI uses 2.9.5. Flags Deno removed are rejected by the operations that used them.                                                                                                                                                                                                                                                       |
| Deno native API                                  | Deno runtime                                                                                 | Native lifecycle and results, separate from CLI version compatibility.                                                                                                                                                                                                                                                                                                                      |
| esbuild and Rolldown                             | esbuild from the consumer's install (peer `>=0.28.2 <0.29.0`); Rolldown's pinned npm package | Bundles and scoped native APIs. Portable unit tests and installed imports run on three OSes with esbuild 0.28.2.                                                                                                                                                                                                                                                                            |
| Node SEA                                         | Builder and base Node at the same version, 22 to 26; Mach-O bases need `xcrun`               | The target is read from the base executable's header. Linux real-tool CI uses Node 22.0.0 and 26.7.0. The compiler version does not change the orchestration floor.                                                                                                                                                                                                                         |
| uv, nFPM, Syft                                   | Their CLI plus the native packaging tools each needs                                         | Linux real-tool CI pins uv 0.12.0, nFPM 2.47.0, and Syft 1.50.0. A Syft scan inventories discoverable packages; source or lockfile context is needed for source dependencies.                                                                                                                                                                                                               |
| Windows signing                                  | Windows host with the Windows SDK SignTool                                                   | Native CI signs, timestamps, verifies, and runs a PE executable with a temporary self-signed certificate. PFX, store, and Trusted Signing credentials pass scripted tests. Production certificates and native MSIX signing are experimental and unverified: the on-demand [signing workflow](../.github/workflows/signing.yml) exercises Trusted Signing and has not yet been run.          |
| Apple products, signing, notarization            | macOS with Xcode command-line tools and the caller's credentials                             | Unsigned app construction is checked with native tools. Standalone executables sign, notarize as ZIPs, ship in PKGs, and are assessed through scripted processes. Credentialed distribution is experimental until the on-demand signing workflow, which signs, notarizes, and assesses a compiled CLI with Developer ID credentials, has been run. Universal Mach-O inputs are unsupported. |

## What experimental means

`effect-build-windows` and `effect-build-apple` are marked experimental because the repository
has not yet run their credentialed paths against production identities. The code paths are
tested with a temporary certificate (Windows) and scripted tool processes (both), and the
[signing workflow](../.github/workflows/signing.yml) exists to run them for real. When it passes,
its run is recorded here and the label comes off.

See [tools and providers](providers.md) for accepted version ranges and the capability
restrictions of specific tool versions.

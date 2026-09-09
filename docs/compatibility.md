# Compatibility

0.7 is ESM-only. Use `import` in `.mjs`, a `"type": "module"` package, or a TypeScript
project configured for `NodeNext`/`Bundler`. CommonJS `require("effect-build")` and
unlisted subpaths are unsupported. The Node orchestration floor is **22.19.0**;
the runnable TypeScript example uses Node 24's built-in type stripping.
A selected compiler's version is independent of the Node process running Effect.

TypeScript **5.9.3** is the declaration floor. Installed tarballs are checked with
`strict: true` and `skipLibCheck: false`, using TypeScript 5.9.3 / Node types 24.3.0
and TypeScript 6.0.3 / Node types 24.13.3. The latter pairing accounts for Node/DOM
`URLPattern` declarations changed in TypeScript 6. All public exports, including
`effect-build-bun/api`, are imported and typechecked. JavaScript maps embed sources;
declaration maps resolve to the `src` files shipped in each package.

Effect is a prerelease dependency. Every package accepts `>=4.0.0-rc.108 <4.1.0-0`
as its Effect peer range, the shape Effect's own platform packages use, and
**4.0.0-rc.108** is the tested version: the workspace pins it and every
installed-consumer check installs it. A newer release candidate installs, and a
non-gating CI consumer tracks the `rc` dist-tag to observe it, but nothing newer is
promised until it becomes the tested version. Effect 3 is unsupported. Install
`effect`, `@effect/platform-node`, and `@effect/platform-node-shared` at one version:
platform packages' caret dependency can otherwise select a newer shared RC with a
newer Effect peer. Stable Effect 4 support follows its release and verification.

| Operation                                        | Host / tool                                                       | Target and current evidence                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core artifacts, commits, archives, direct wheels | Node 22.19+ with NodeServices; Bun with BunServices               | Portable filesystem tests run on Linux, macOS and Windows. Payloads stream; ZIP32 and ustar field widths are the only archive and wheel size limits.                                                                        |
| Bun compile/bundle                               | Bun CLI on a host supported by Bun; orchestration may use Node    | Eight core targets accepted. Linux real-tool CI runs Bun 1.3.14 and 1.4.2 and builds Linux x64 glibc/musl, Linux arm64 and Windows x64. This does not establish execution of every cross-target binary. |
| Bun native API                                   | Bun runtime                                                       | Native Build/Transpiler types and results; no Node execution of these operations. Installed imports and declarations work on Node.                                                                      |
| Deno compile/bundle/transpile                    | Deno CLI on a host supported by Deno                              | Native Deno targets, excluding musl. Linux real-tool CI uses 2.9.5. Removed flags are checked at their operations.                                                                                      |
| Deno native API                                  | Deno runtime                                                      | Native API lifecycle and results; separate from CLI version compatibility.                                                                                                                              |
| esbuild / Rolldown                               | esbuild from the consumer's install (peer `>=0.28.2 <0.29.0`); Rolldown's pinned npm package | Bundles and scoped native APIs. Portable unit tests and installed imports run on three OSes with esbuild 0.28.2.                                                                                        |
| Node SEA                                         | Matching builder/base Node versions 22–26; macOS also needs xcrun | Target follows the base executable; Linux real-tool CI uses Node 22.0.0 and 26.7.0. Compiler versions do not change the orchestration floor.                                                            |
| uv / nFPM / Syft                                 | Their CLI plus required native packaging tools                    | Linux real-tool CI pins uv 0.12.0, nFPM 2.47.0, Syft 1.50.0. A Syft scan inventories discoverable packages; source/lockfile context is needed for source dependencies.                                  |
| Windows signing                                  | Windows SDK SignTool, Windows host                                | Native CI signs, timestamps, verifies and runs a PE executable with a temporary self-signed certificate. PFX, store, and Trusted Signing credentials pass through scripted tests. Production certificates and native MSIX signing remain experimental and unverified: the on-demand [signing workflow](../.github/workflows/signing.yml) exercises Trusted Signing and has not yet been run. |
| Apple products / signing / notarization          | macOS, Xcode command-line tools, appropriate credentials          | Native unsigned app construction checked locally. Standalone executables sign, notarize as ZIPs, ship in PKGs, and are assessed through scripted processes; credentialed distribution remains experimental until the on-demand signing workflow, which signs, notarizes, and assesses a compiled CLI with Developer ID credentials, has been run. Universal/fat Mach-O inputs are unsupported. |

The matrix describes repository checks and support boundaries, not a claim that
production signing or all host/target combinations have been certified. See the
[tool policy](providers.md) for accepted ranges and known capability restrictions.

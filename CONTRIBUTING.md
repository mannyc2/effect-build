# Contributing

Read [AGENTS.md](AGENTS.md) for the rules every change follows and [DESIGN.md](DESIGN.md) for the
decisions behind the public API. Both are short.

## Setup

Use Bun 1.3.14 (the workspace's `packageManager`) and Node 24.14.1.

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` builds every package, typechecks source, tests, and examples, lints, runs the release
script tests, runs the unit tests, and executes both examples. It must be green before you push.
Imports resolve to built `dist` files, so run `bun run build` after changing a package before
running anything that imports it.

Tests use real files: they compile real programs, read real headers, and rename real files.
Native tools are used where available, and executable headers come from byte fixtures where they
are not. Do not add tests that assert the shape of an API or the contents of a workflow file.

## Real-tool tests

Integration tests need the tool installed. CI runs them on Linux with exact fixtures; locally,
point the variable at a binary or leave it unset to use `PATH`.

| Command                             | Tool selection                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:integration:bun`      | `EFFECT_BUILD_BUN`; CI uses 1.3.14 and 1.4.2                                                                                          |
| `bun run test:integration:deno`     | `EFFECT_BUILD_DENO`; 2.9.5                                                                                                            |
| `bun run test:integration:node-sea` | `EFFECT_BUILD_NODE`; CI uses 22.0.0 and 26.7.0                                                                                        |
| `bun run test:integration:nfpm`     | `EFFECT_BUILD_NFPM_BIN`; 2.47.0, plus a C compiler and archive tools                                                                  |
| `bun run test:integration:python`   | `EFFECT_BUILD_UV_BIN`; 0.12.0, plus Python                                                                                            |
| `bun run test:integration:sbom`     | `EFFECT_BUILD_SYFT_BIN`; 1.50.0                                                                                                       |
| `bun run test:integration:windows`  | Elevated administrator Windows shell, SDK SignTool (or `EFFECT_BUILD_SIGNTOOL`), Bun, access to DigiCert's RFC 3161 timestamp service |

The Windows test compiles, signs, timestamps, and runs an executable with a temporary self-signed
certificate. It needs administrator elevation because it temporarily trusts the public certificate
in `LocalMachine\Root` and keeps the signing key in `CurrentUser\My`, then removes those exact
certificate entries and the private key. Use a disposable Windows environment, as CI does. Keep
Bun's Windows extraction cache on the checkout volume (`BUN_INSTALL_CACHE_DIR`).

Apple and Windows signing examples are typechecked; their portable tests use scripted processes
standing in for the native tools.

## Installed consumers

`bun run test:consumer` packs every public package, installs the tarballs in a clean temporary
project with strict peers, typechecks every export with `skipLibCheck: false` (a Node consumer
without `bun-types`, then the Bun API consumer with them), checks that source-map targets exist,
runs a program against the installed packages, and executes the first build from the getting
started guide. It defaults to TypeScript 5.9.3 with Node types 24.3.0, the workspace's Effect
release candidate, and the tested esbuild.

| Variable                                     | Selects                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `CONSUMER_TYPESCRIPT`, `CONSUMER_NODE_TYPES` | The declaration pair; CI also runs 6.0.3 with 24.13.3.                       |
| `CONSUMER_EFFECT`                            | The Effect version; `rc` observes the newest release candidate (non-gating). |
| `CONSUMER_BUN_TYPES`                         | The `bun-types` version for the API consumer; CI's Bun 1.4.2 job uses 1.4.2. |
| `CONSUMER_ESBUILD`                           | The esbuild peer to install.                                                 |

## Continuous integration

[ci.yml](.github/workflows/ci.yml) runs `verify` and the consumer check on Ubuntu, macOS, and
Windows (where it also runs the native signing test), two Linux tool matrices with exact Bun,
Node, Git, Deno, uv, nFPM, and Syft fixtures that also run the artifact pipeline and the CLI
release with a native checksum check, an installed consumer on Node 22.19 with TypeScript 6, and
a non-gating consumer against Effect's `rc` tag.

[signing.yml](.github/workflows/signing.yml) is dispatched by hand and runs
`examples/artifact-pipeline/src/sign.ts` with real identities. On macOS it needs the
`APPLE_CERTIFICATE_P12` (base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`,
`APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` secrets; on Windows it needs `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TRUSTED_SIGNING_ENDPOINT`, `TRUSTED_SIGNING_ACCOUNT`,
and `TRUSTED_SIGNING_PROFILE`. It has not been run yet. When it passes, record the run in
[compatibility](docs/compatibility.md) and remove the experimental labels.

## Style

Format with `bun run format` (dprint) and lint with `bun run lint` (oxlint). Follow the vocabulary
in AGENTS.md: artifact, target, tool, build, compile, bundle, package, sign, commit, verify.
Delete rather than deprecate; there are no aliases or compatibility exports. A change is described
by its commit message and, if it is a durable decision, one line under "Decided" in DESIGN.md.
Documentation stays shorter than the code it describes.

## Releasing

Release tags trigger the [release workflow](.github/workflows/release.yml). It builds and verifies
once, retains the exact tarballs and their SHA-512 manifest in a 90-day Actions artifact, runs
installed-consumer acceptance against those tarballs, then publishes with npm provenance.

Rerun the same workflow to resume: already-published versions are downloaded and compared
byte-for-byte by SHA-512, identical versions are skipped, and mismatches stop publication. A retry
never repacks, and an expired or missing candidate artifact stops recovery, so keep the artifact
if recovery may extend beyond its retention.

The registry has no atomic multi-package publication, so a failure can temporarily leave a partial
release. An unconfirmed upload stops for a later exact-candidate resume. The job requests npm
provenance but does not certify production signing paths or provide a transaction across the
package collection. `bun run test:release` exercises resumption against a local HTTP registry.

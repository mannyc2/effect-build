# Contributing

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md). Use Bun 1.3.14 and Node 24.14.1.

```sh
bun install --frozen-lockfile
bun run verify
```

The gate builds packages, typechecks source and examples, runs lint and unit tests,
and executes both examples. Imports resolve built `dist` files. Tests use real files,
native tools where available, and byte fixtures for executable headers.

| Integration command | Tool selection |
| --- | --- |
| `bun run test:integration:bun` | `EFFECT_BUILD_BUN`; CI uses 1.3.14 and 1.4.2 |
| `bun run test:integration:deno` | `EFFECT_BUILD_DENO`; 2.9.5 |
| `bun run test:integration:node-sea` | `EFFECT_BUILD_NODE`; CI uses 22.0.0 and 26.7.0 |
| `bun run test:integration:nfpm` | `EFFECT_BUILD_NFPM_BIN`; 2.47.0, C compiler, archive tools |
| `bun run test:integration:python` | `EFFECT_BUILD_UV_BIN`; 0.12.0, Python |
| `bun run test:integration:sbom` | `EFFECT_BUILD_SYFT_BIN`; 1.50.0 |
| `bun run test:integration:windows` | Windows SDK SignTool (or `EFFECT_BUILD_SIGNTOOL`), Bun, access to DigiCert's RFC3161 timestamp service |

[CI](.github/workflows/ci.yml) installs exact fixtures and runs the real pipeline on Linux.
Windows CI also compiles, signs, timestamps, and runs an executable with a temporary self-signed certificate; the test removes its certificate, trust entry, and private key afterward.
Apple/Windows signing examples are typechecked; portable tests use scripted processes.
Keep Bun's Windows extraction cache on the checkout volume. Format with `bun run format`.
Release tags trigger [one npm publishing job](.github/workflows/release.yml).

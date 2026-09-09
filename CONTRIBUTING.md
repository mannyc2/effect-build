# Contributing

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md). Use Bun 1.3.14 and Node 24.14.1.

```sh
bun install --frozen-lockfile
bun run verify
```

The gate builds packages, typechecks source and examples, runs lint and unit tests,
and executes both examples. Imports resolve built `dist` files. Tests use real files,
native tools where available, and byte fixtures for executable headers.

| Integration command                 | Tool selection                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run test:integration:bun`      | `EFFECT_BUILD_BUN`; CI uses 1.3.14 and 1.4.2                                                                                         |
| `bun run test:integration:deno`     | `EFFECT_BUILD_DENO`; 2.9.5                                                                                                           |
| `bun run test:integration:node-sea` | `EFFECT_BUILD_NODE`; CI uses 22.0.0 and 26.7.0                                                                                       |
| `bun run test:integration:nfpm`     | `EFFECT_BUILD_NFPM_BIN`; 2.47.0, C compiler, archive tools                                                                           |
| `bun run test:integration:python`   | `EFFECT_BUILD_UV_BIN`; 0.12.0, Python                                                                                                |
| `bun run test:integration:sbom`     | `EFFECT_BUILD_SYFT_BIN`; 1.50.0                                                                                                      |
| `bun run test:integration:windows`  | Elevated administrator Windows shell, SDK SignTool (or `EFFECT_BUILD_SIGNTOOL`), Bun, access to DigiCert's RFC3161 timestamp service |

[CI](.github/workflows/ci.yml) installs exact fixtures and runs the real pipeline on Linux.
Windows CI also compiles, signs, timestamps, and runs an executable with a temporary self-signed certificate. This test requires administrator elevation: it temporarily trusts the public certificate in `LocalMachine\Root` and keeps the signing key in `CurrentUser\My`, then removes those exact certificate entries and the private key afterward. Use a disposable Windows environment, as CI does.
Apple/Windows signing examples are typechecked; portable tests use scripted processes.
Keep Bun's Windows extraction cache on the checkout volume. Format with `bun run format`.
Run `bun run test:consumer` after building to pack all public packages, install
them in a clean temporary project with strict peers, typecheck every export with
`skipLibCheck: false`, check source-map targets, and execute the first build.
Use `CONSUMER_TYPESCRIPT=6.0.3 CONSUMER_NODE_TYPES=24.13.3` for the second declaration
pair. CI also checks Node 22.19.0 and installed consumers on all three OSes.

Release tags trigger the [release workflow](.github/workflows/release.yml). It builds
and verifies once, retains the exact tarballs and SHA-512 manifest in a 90-day Actions
artifact, runs installed consumer acceptance against those tarballs, then publishes.
Rerun the same workflow to resume: already-published versions are downloaded and
compared byte-for-byte by SHA-512, identical versions are skipped, and mismatches
stop publication. A retry never repacks; an expired or missing candidate artifact
stops recovery. Keep the artifact if recovery may extend beyond its retention.

The registry has no atomic multi-package publication: failures can temporarily
leave a partial release. An unconfirmed upload stops for a later exact-candidate
resume. The job requests npm provenance but does not independently certify
production signing paths or provide a transaction across the package collection.
`bun run test:release` exercises resumption against a local HTTP registry.

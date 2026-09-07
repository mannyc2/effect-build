# Contributing to effect-build

Read [AGENTS.md](AGENTS.md) for the rules and [DESIGN.md](DESIGN.md) for the 0.7 design.

## Set up

Use **Bun 1.3.14** and **Node.js 24.14.1**, matching CI. From the repository root:

```sh
bun install --frozen-lockfile
bun run build
```

Bun manages workspace dependencies and `bun.lock`. Build before running examples because their imports resolve to the
packages' `dist` files. Example commands and prerequisites are in [examples/README.md](examples/README.md).

## Verify a change

```sh
bun run verify
```

This gate runs build, source and example typechecks, lint, unit tests, and example tests, in that order. Use focused
checks while editing; run the complete gate on the final change. Reuse passing results until relevant source,
dependencies, toolchain, or test conditions change.

Format edited files with `bun x --no-install dprint fmt <paths>`. For prose-only changes, check formatting, links, API
names, and commands; run any example whose behavior you change.

Tests should exercise real files and outputs: compile and execute a program, inspect its header, extract an archive,
or check a failed rename. Keep inputs, commands, expected results, and useful failure cases beside each example.

## Run real tools

| Command                             | Requires                            |
| ----------------------------------- | ----------------------------------- |
| `bun run test:integration:bun`      | Bun 1.3.14                          |
| `bun run test:integration:deno`     | Deno 2.9.5                          |
| `bun run test:integration:node-sea` | Node 26.7.0 on Linux x64 with glibc |
| `bun run acceptance:archives`       | Git, tar, unzip, and zipinfo        |
| `bun run acceptance:python`         | uv and Python                       |
| `bun run acceptance:nfpm:linux`     | nFPM 2.47.0 and Bun 1.3.14 on Linux |
| `bun run acceptance:sbom`           | Syft                                |

See [CI](.github/workflows/ci.yml) and each integration test for tool selection and environment variables. Apple and
Windows signing need the appropriate host and credentials; unit tests do not establish that real signing works.

Release tags trigger [the release workflow](.github/workflows/release.yml), which publishes packages to npm with provenance.

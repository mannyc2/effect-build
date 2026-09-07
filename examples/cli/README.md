# Four-target CLI

Run `bun run test` here with Bun 1.3.14 or 1.4.2 on PATH (or set
`EFFECT_BUILD_BUN` to its executable). The Node script compiles Linux x64, Linux
x64 musl, Linux arm64, and Windows x64, checks a deliberate target mismatch and
an existing destination, then writes `dist/manifest.json` and `dist/SHA256SUMS`.

Run `sha256sum -c dist/SHA256SUMS` from this directory. On macOS use
`shasum -a 256 -c dist/SHA256SUMS`.

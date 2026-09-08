# Four-target CLI

Run `bun run test` here after the workspace build, with Node 24 and Bun 1.3.14 or 1.4.2 on PATH; `EFFECT_BUILD_BUN` selects a specific Bun executable.
The program compiles Linux x64, Linux x64 musl, Linux arm64, and Windows x64.
It checks a deliberate target mismatch and an existing destination, verifies an executable, and writes `dist/manifest.json` and `dist/SHA256SUMS`.

Run `sha256sum -c dist/SHA256SUMS` here; on macOS use `shasum -a 256 -c dist/SHA256SUMS`.

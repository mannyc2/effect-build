# Four-target CLI

Run `bun run test` here after the workspace build, with Node 24 and Bun 1.3.14 or 1.4.2 on PATH; `EFFECT_BUILD_BUN` selects a specific Bun executable.
The program compiles Linux x64, Linux x64 musl, Linux arm64, and Windows x64 into one staged directory, then writes `SHA256SUMS` and commits the complete tree to `dist`.
A failed build leaves the previous release untouched. Replacing an existing directory removes it before the final rename, so that replacement is not one atomic operation.
The result is a verified `Artifact.Directory`, printed as JSON after the commit; its relative entries and checksums remain usable when the tree moves.

Run `(cd dist && sha256sum -c SHA256SUMS)` here; on macOS use `(cd dist && shasum -a 256 -c SHA256SUMS)`.

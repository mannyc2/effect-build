# CLI release

Compiles `src/cli.ts` for five targets, archives each one, writes `SHA256SUMS`, and commits the
result to `dist/` as a whole: the layout a release tool produces, from one Effect program.

## Run it

From the repository root, `bun install --frozen-lockfile` and `bun run build` once. Then, with
Node 24 and Bun 1.3.14 or newer on `PATH` (`EFFECT_BUILD_BUN` selects a specific Bun):

```sh
cd examples/cli
node index.ts
(cd dist && sha256sum -c SHA256SUMS)   # on macOS: shasum -a 256 -c SHA256SUMS
```

The first run downloads a Bun runtime per target. The program prints the committed release as one
`Artifact.Directory` record, and `dist/` holds:

```
dist/
├── SHA256SUMS
├── hello_0.7.0_darwin-arm64.tar.gz
├── hello_0.7.0_linux-arm64.tar.gz
├── hello_0.7.0_linux-x64-musl.tar.gz
├── hello_0.7.0_linux-x64.tar.gz
└── hello_0.7.0_windows-x64.zip
```

## How it works

- `Commit.atomic("dist", produce, { staging: "sibling" })` stages the tree next to `dist/` at its
  final depth and renames it into place. A failed target leaves the previous `dist/` untouched;
  replacing an existing `dist/` moves the old tree aside and restores it if the rename fails.
- `Effect.forEach(targets, ..., { concurrency: 2 })` compiles the targets two at a time into a
  scratch directory that is removed when the program ends. `Target.parts` supplies each target's
  executable suffix, and `Bun.compile` checks every output's header against the target it asked
  for.
- Windows gets a ZIP and everything else a tar.gz. Archive bytes depend only on their inputs.
- `Checksums.write` records paths relative to `SHA256SUMS`, so the check keeps passing after the
  tree is moved or uploaded somewhere else.
- `Artifact.directory` records the finished tree; `Artifact.encode` prints it as the JSON a
  release system consumes.

## Make it yours

Change `name`, `version`, and `targets` at the top of `index.ts`; any of the eight core targets
works. Pass `options: { minify: true }` to `Bun.compile` for smaller binaries. To add a checksum
signature, an SBOM, or OS packages, see the [recipes](../../docs/recipes.md).

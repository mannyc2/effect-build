# Artifact pipeline

Every producer in one program. `src/main.ts` compiles an executable with Bun, then feeds that one
artifact into a ZIP, a tar.gz, a Python wheel, a deb package, and an SBOM, bundles with esbuild
and Rolldown, archives a whole bundle directory, assembles a Node single executable, compiles with
Deno, writes checksums, and prints the manifest. Output goes to a temporary directory that is
removed when the program finishes.

## Run it

From the repository root, `bun install --frozen-lockfile` and `bun run build` once. Then, with
Node 24 and Bun 1.3.14 or newer on `PATH`:

```sh
cd examples/artifact-pipeline
node src/main.ts
```

Bun, esbuild, Rolldown, the archive writers, and the wheel writer always run. A step that needs
another tool runs when its variable names one:

| Variable                | Adds                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `EFFECT_BUILD_BUN`      | Selects a Bun executable instead of the first `PATH` match.                          |
| `EFFECT_BUILD_NODE`     | A Node 22 to 26 single executable assembled from the esbuild bundle.                 |
| `EFFECT_BUILD_DENO`     | A Deno 2.9.5 compiled executable.                                                    |
| `EFFECT_BUILD_NFPM_BIN` | A deb package of the Bun executable.                                                 |
| `EFFECT_BUILD_UV_BIN`   | An sdist and wheel of a small Python project; uv needs Python and its build backend. |
| `EFFECT_BUILD_SYFT_BIN` | An SPDX JSON SBOM of the executable.                                                 |

CI runs the program with every tool on Linux. The Python integration tests install the wheel with
uv and run its native command; ordinary example verification needs no Python.

## What to look at

The steps are numbered in `src/main.ts`:

1. **Compile** with Bun and `Artifact.verify` the result: the record matches the file.
2. **Archive and wheel** from the same executable. The wheel entry under `.data/scripts` puts
   `hello` (`hello.exe` on Windows) on the installing environment's command path with no Python
   wrapper. The platform tag describes the build host here; a real release picks the minimum
   macOS version and the manylinux or musllinux floor it supports.
3. **Bundle** with esbuild and Rolldown. Bundles are directory artifacts, and the whole esbuild
   directory goes into a tar.gz the same way a single file does.
4. **Optional tools**: Node SEA from the esbuild bundle, Deno, nFPM, uv, and Syft.
5. **Checksums and manifest**: `Checksums.write` covers every regular file, and
   `Artifact.encode` produces the JSON handoff, which `Artifact.decode` validates.

## Signing

[`src/signing.ts`](src/signing.ts) has the credentialed flows: a Windows executable signed with
Authenticode and archived, an MSIX signed with a PFX, a macOS CLI signed with the hardened
runtime, notarized as a ZIP, and assessed, and a full app bundle with a signed DMG and PKG,
notarized and stapled. CI typechecks this module and separately signs a native Windows executable
with a temporary certificate. [`src/sign.ts`](src/sign.ts) is the program the
[signing workflow](../../.github/workflows/signing.yml) runs on macOS and Windows with real
identities; the secrets it needs are listed in [CONTRIBUTING.md](../../CONTRIBUTING.md).

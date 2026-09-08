# Artifact pipeline

Run `bun run test` here after the workspace build, with Node 24 and Bun 1.3.14 or 1.4.2 installed. The program compiles with Bun and puts that executable into ZIP, tar.gz, and a Python wheel. The wheel places it in `.data/scripts`, so installation adds `hello` (`hello.exe` on Windows) to the Python environment's command directory without a Python wrapper.
Esbuild and Rolldown add bundles, and the complete esbuild directory goes directly into a tar.gz. The program prints an artifact manifest, writes checksums, and removes its temporary outputs on completion.

Wheel platform tags are explicit compatibility promises; choose minimum OS and libc versions for the binary you actually build. The Python integration tests install wheels with uv and run their native commands; ordinary example verification needs no Python installation.

Select tools and optional operations with executable paths:

- `EFFECT_BUILD_BUN`: select Bun instead of the first PATH match.
- `EFFECT_BUILD_DENO`: add Deno 2.9.5 compilation.
- `EFFECT_BUILD_NODE`: add Node 22–26 SEA assembly of the esbuild bundle.
- `EFFECT_BUILD_UV_BIN`: build a Python project into a wheel and sdist; uv needs Python and access to its build backend.
- `EFFECT_BUILD_NFPM_BIN`: package the same Bun executable as a deb.
- `EFFECT_BUILD_SYFT_BIN`: scan the wheel into an SPDX JSON SBOM.

[`src/signing.ts`](src/signing.ts) signs a compiled Windows executable and archives it directly, signs MSIX packages, and builds signed Apple products. CI typechecks these examples and separately tests native Windows executable signing with a temporary certificate. Running the examples requires native tools and the caller's credentials.

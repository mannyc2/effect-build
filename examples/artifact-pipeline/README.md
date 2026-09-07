# Artifact pipeline

Run `bun run test` here after the workspace build. The example creates a real file,
packages it as deterministic ZIP and tar.gz, then writes checksums and round-trips
an artifact manifest. Its temporary outputs are removed when the Effect scope ends.
Esbuild and Rolldown bundles are recorded as directories in the same manifest.

Set `EFFECT_BUILD_DENO` to a Deno 2.9.5 executable to include native compilation.
Set `EFFECT_BUILD_NODE` to Node 22–26 to assemble the esbuild bundle as a single executable.

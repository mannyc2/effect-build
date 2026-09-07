# Artifact pipeline

Run `bun run test` here after the workspace build. The example creates a real file,
packages it as deterministic ZIP and tar.gz, then writes checksums and round-trips
an artifact manifest. Its temporary outputs are removed when the Effect scope ends.

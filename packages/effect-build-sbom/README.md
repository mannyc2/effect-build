# effect-build-sbom

Generates SPDX JSON 2.3 and CycloneDX JSON 1.6 with one selected Syft executable.

A directory subject must be a canonical hashed tree and is lent through `Tree.withVerifiedSnapshot`. A file subject must be a canonical hashed file and is lent through `File.withVerifiedBytes`. Syft never guesses an image source, contacts a daemon, pulls a registry reference, or falls back to another subject kind.

The selected Syft bytes are reauthenticated before launch. Fatal UTF-8 decoding and the selected versioned document schema validate the exact held output bytes before one atomic core file commit.

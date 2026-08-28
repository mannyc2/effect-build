# effect-build-archives

Deterministic ZIP/tar.gz producers using the canonical core file identity and finalizer.

`Archive.archive` reads each hashed input through `File.withVerifiedBytes`, rejects unsafe/traversing/colliding layouts, normalizes order, timestamps, ownership, modes, headers, and compression, then returns one atomically finalized `Artifact.HashedFile`.

`SourceArchive.sourceArchive` accepts one exact SHA-1 or SHA-256 Git tree. It selects and observes one Git executable, reauthenticates it before each launch, applies the tree's export rules, excludes Git links and build-output roots, and deterministically re-encodes the result. There is no symbolic revision lookup, installation, candidate retry, or fallback.

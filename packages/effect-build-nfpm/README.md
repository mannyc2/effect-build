# effect-build-nfpm

Produces Debian, RPM, Alpine, Arch Linux, and unsigned MSIX packages with one selected nFPM executable.

Every payload is a canonical hashed file or executable and is revalidated before private materialization. Package metadata, absolute destinations, timestamps, modes, format-specific fields, and filename extensions use closed schemas; arbitrary native configuration, scripts, globs, environment expansion, signing, and format overrides cannot enter the rendered configuration.

The selected nFPM bytes are reauthenticated immediately before launch. Each operation returns one atomically finalized `Artifact.HashedFile`; there is no installation, substitution, candidate retry, or fallback.

# effect-build-windows

`SignMsix` revalidates one unsigned canonical MSIX file, copies its held bytes into private same-parent staging, Authenticode-signs it with SHA-256, requests an RFC 3161 SHA-256 timestamp, verifies Authenticode and timestamp policy, and atomically returns one canonical hashed file.

One SignTool executable is selected and observed; it is reauthenticated immediately before signing and verification launches. PFX material or exact certificate-store coordinates are acquired from the process-local credential service immediately before launch, scrubbed from provider-owned typed diagnostics, and never returned or persisted.

The integration never installs, retries, falls back, returns credentials, or owns release continuation/publication state.

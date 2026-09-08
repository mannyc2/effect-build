# effect-build-python

`build({ project, outdir })` returns `{ wheel: Artifact.File, sdist: Artifact.File }`.
Provide platform services and `Python.layer({ executable?, version? })` for uv.
`tested` is `>=0.12.0 <1.0.0`. uv builds the sdist, then its wheel using the project backend.
Exactly one wheel and one `.tar.gz` sdist must exist; clean stale distributions
before changing versions with `atomic: false`.

`wheel({ metadata, tags, entries, outdir })` writes a wheel from regular artifacts
using platform services, **without Python, uv, or a tool layer**. It verifies inputs
and creates METADATA, WHEEL, and SHA-256 RECORD files plus optional entry points.

[Setup and atomic output](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)

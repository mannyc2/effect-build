# effect-build-python

`build({ project, outdir })` returns `{ wheel: Artifact.File, sdist: Artifact.File }`.
Provide platform services and `Python.layer({ executable?, version? })` for uv.
`tested` is `>=0.12.0 <1.0.0`. uv builds the sdist, then its wheel using the project backend.
Exactly one wheel and one `.tar.gz` sdist must exist; clean stale distributions
before changing versions with `atomic: false`.

`wheel({ metadata, tags, entries, outdir })` writes a wheel from regular artifacts
using platform services, **without Python, uv, or a tool layer**. It verifies inputs
and creates METADATA, WHEEL, and SHA-256 RECORD files plus optional entry points.

Put a native executable at `<normalized-name>-<normalized-version>.data/scripts/<command>`
to install it into the Python environment's command directory. For example,
`effect_build_hello-0.7.0.data/scripts/hello` needs no Python wrapper; use `hello.exe`
on Windows. Keep wheel platform tags explicit: the binary's target alone does not
establish its minimum macOS version or manylinux compatibility.

[Setup and atomic output](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Errors](../../docs/errors.md)

# effect-build-python

Builds exactly one wheel and one source distribution from a canonical hashed source tree using one selected uv frontend.

The source snapshot is revalidated and lent as a private tree. `uv lock --check` verifies `pyproject.toml` and `uv.lock`; the build runs without Python downloads or frontend substitution. uv is reauthenticated immediately before every launch. Exactly two regular outputs with native backend filenames are accepted, staged, revalidated, and committed together by one canonical tree rename.

The returned wheel and sdist are canonical `Artifact.HashedFile` projections of that committed generation. They share its selected uv observation and publication fact; an existing output directory is never overlaid.

# effect-build-archives

`zip` and `tarGz` verify regular artifacts and produce deterministic `Artifact.File`
outputs using platform services; neither needs an external tool or tool layer.
Pass `{ entries: [{ artifact, path, executable? }], outfile }` to either operation.
Entry paths must be safe and distinct. Modes default to executable/file conventions.

`source({ repository, tree, project, version, format, outfile })` packages a Git tree
under `project-version/`; get `tree` with `git rev-parse HEAD^{tree}` and provide
`Archive.layer({ executable?, version? })` for Git. Export-ignore rules apply;
symlinks, executable modes, and LFS pointers remain. Gitlinks and build directories
are omitted; `additionalExcludes` adds repository-relative exclusions.

[Setup and atomic output](../../docs/getting-started.md) · [Tool versions](../../docs/providers.md) · [Errors](../../docs/errors.md)

# effect-build

Effect programs for files, executables, directories, tools, targets, atomic commits, and checksums.

Use `Artifact.file`, `Artifact.executable`, or `Artifact.directory` to describe existing output.
Compose `Commit.atomic`, `Artifact.verify`, and `Executable.expectTarget` when those checks are useful.
See the [repository README](https://github.com/mannyc2/effect-build#readme) for a complete build.

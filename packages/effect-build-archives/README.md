# effect-build-archives

Create deterministic ZIP and tar.gz files from `Artifact.File` or
`Artifact.Executable` values. Each input is verified before packaging.

```ts
import * as Archive from "effect-build-archives";

const packaged = Archive.tarGz({
  entries: [{ artifact: executable, path: "bin/cli", executable: true }],
  outfile: "dist/cli.tar.gz",
});
```

Provide platform services to run `zip` or `tarGz`; neither needs a tool layer.
Outputs use `Commit.atomic` by default; `atomic: false` writes directly.
Entry order, timestamps, owner IDs, and modes are deterministic. ZIP uses stored
entries and tar.gz uses stored deflate blocks. Invalid paths and collisions fail.

`source({ repository, tree, project, version, format, outfile })` packages one Git
tree under `project-version/`. Provide `Archive.layer({ executable?, version? })`;
the default Git range is `>=2.40.0 <3.0.0`. Obtain `tree` with
`git rev-parse HEAD^{tree}`. Git export-ignore rules apply; symlinks, executable
modes, and LFS pointers are preserved. Gitlinks and build directories (`dist`,
`build`, `out`, `target`, `.output`, `.next`) are omitted. `additionalExcludes`
adds repository-relative paths, and `cwd` resolves relative input/output paths.

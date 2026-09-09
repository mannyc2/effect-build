# effect-build-archives

`zip` and `tarGz` verify artifacts and produce deterministic `Artifact.File`
outputs using platform services; neither needs an external tool or tool layer.
ZIP uses DEFLATE and tar.gz uses gzip at fixed compression level 6. Timestamps and
entry ordering are fixed, so identical inputs produce identical compressed bytes.
Pass `{ entries: [{ artifact, path, executable? }], outfile }` to either operation.
Entry paths must be safe and distinct. Regular files use executable/file modes;
`executable` overrides those modes. Directories expand beneath `path`, preserving
descendant modes, empty directories, and symlinks without following them. Each directory
prefix has mode `0755`; directory inputs do not accept an `executable` override.

```ts
const bundle = yield* Esbuild.buildToDirectory({
  entryPoints: ["src/main.ts"], bundle: true, outdir: "dist/app",
});
const archive = yield* Archive.tarGz({
  entries: [{ artifact: bundle, path: "app" }], outfile: "dist/app.tar.gz",
});
```

`source({ repository, tree, project, version, format, outfile })` packages a Git tree
under `project-version/`; get `tree` with `git rev-parse HEAD^{tree}` and provide
`Archive.layer({ executable?, version? })` for Git. Export-ignore rules apply;
symlinks, executable modes, and LFS pointers remain. Gitlinks are omitted;
`excludes` lists repository-relative paths to leave out. Tracked directories
such as `build/`, `target/`, and `out/` are included unless the project excludes them.

Inputs stream: each file is read once in 64 KiB chunks, verified against its artifact
record as it passes, and compressed straight into the staged output, so memory does
not grow with archive size. ZIP entries record their CRC and sizes in data descriptors.
The only size limits are the formats' own: ZIP32 holds 65,535 entries and 4 GiB per
entry and per archive, and ustar holds 8 GiB per entry. These fail with
`Archive.FormatLimit` before any output is staged; switch to `tarGz` when a ZIP32
field is the problem. ZIP64 and PAX size records are not written. `source` streams
file payloads out of the temporary Git tar rather than reading it whole.

[Setup and atomic output](../../docs/getting-started.md) · [Tool versions](../../docs/providers.md) · [Errors](../../docs/errors.md)

# effect-build-archives

`zip` and `tarGz` verify artifacts and produce deterministic `Artifact.File`
outputs using platform services; neither needs an external tool or tool layer.
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
symlinks, executable modes, and LFS pointers remain. Gitlinks and build directories
are omitted; `additionalExcludes` adds repository-relative exclusions.

[Setup and atomic output](../../docs/getting-started.md) · [Tool versions](../../docs/providers.md) · [Errors](../../docs/errors.md)

# effect-build-esbuild

Use `effect-build-esbuild/Build` for the selected build operation and
`effect-build-esbuild/Context` for the selected incremental-context operation.

```ts
import * as Build from "effect-build-esbuild/Build";

const program = Build.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outdir: "dist",
  write: false,
});
```

Each subpath owns its own layer. The package exposes no legacy bundle callback
or a generic raw Esbuild escape hatch.

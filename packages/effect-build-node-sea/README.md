# effect-build-node-sea

Package a bundled CommonJS script and optional assets as a native executable.

```ts
import * as NodeSea from "effect-build-node-sea";

const executable = NodeSea.assemble({
  main: bundledScript,
  assets: { "license.txt": licenseFile },
  outfile: "dist/cli",
});
```

`main` and each asset are core `Artifact.File` or `Artifact.Executable` values;
their bytes are verified before packaging. Provide `NodeSea.layer()` and platform
services to run the effect. The layer defaults to the host's `process.execPath`;
pass `executable` when the host is not Node. `baseExecutable` optionally selects a
different copy of the same Node version. The tested range is `>=22.0.0 <27.0.0`.

The provider uses Node's preparation blob and pinned postject injection workflow,
then checks the executable header. macOS outputs receive an ad hoc signature using
`xcrun codesign`; Windows outputs must end in `.exe`. Inputs and intermediate files
always use a private temporary directory. Output uses `Commit.atomic` by default;
set `atomic: false` to write directly. `cwd` resolves relative output paths.
SEA `require()` loads built-ins; bundle other dependencies into the main script.

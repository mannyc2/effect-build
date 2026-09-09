# effect-build-node-sea

```ts
import * as NodeSea from "effect-build-node-sea";
const executable = NodeSea.assemble({ main: bundledScript, assets: { "license.txt": license }, outfile: "dist/cli" });
```

`main` must be bundled CommonJS; it and each asset are regular core artifacts.
SEA `require()` loads built-ins, so bundle other dependencies into the script.
Provide `NodeSea.layer({ executable?, baseExecutable?, version? })` and platform services.
The builder defaults to `process.execPath`; select Node explicitly when running
under another host. Builder and base must report the same Node version.

`supported` covers Node 22–26; `tested` records 22.0.0 and 26.7.0. Assembly uses a preparation blob and postject injection,
then checks the executable header. macOS needs `xcrun codesign` for an ad hoc signature;
Windows output must end in `.exe`. Inputs and intermediates always use private
temporary files, including with `atomic: false`.

[Setup](../../docs/getting-started.md) · [Tool versions](../../docs/providers.md) · [Errors](../../docs/errors.md)

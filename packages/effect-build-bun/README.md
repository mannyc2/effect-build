# effect-build-bun

```ts
import * as Bun from "effect-build-bun";
const executable = Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
```

Provide `Bun.layer({ executable?, version? })` and platform services. The CLI provider
also runs from Node. `compile` returns `Artifact.Executable`, `bundle` returns
`Artifact.Directory`, and `build` returns stdout bytes. `watch` requires an Effect scope.
Targets accept core names and Bun variants; Windows output requires lowercase `.exe`.

`tested` is `>=1.3.14 <1.4.0 || >=1.4.2 <1.5.0`: 1.4.0 is unreviewed and 1.4.1 has a
reproduced variable-collision bug. `version` overrides this guard.
`effect-build-bun/api` exports `Build`, `Transpiler`, and their combined `layer`;
**that subpath requires the Bun runtime** and preserves native API results.

[Setup](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Four-target example](../../examples/cli)

# effect-build-bun

```ts
import * as Bun from "effect-build-bun";
const executable = Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
```

Provide `Bun.layer({ executable?, version? })` and platform services. The CLI provider
also runs from Node. `compile` returns `Artifact.Executable`, `bundle` returns
`Artifact.Directory`, and `build` returns stdout bytes. `watch` requires an Effect scope.
Targets accept core names and Bun variants; Windows output requires lowercase `.exe`.

`supported` is `>=1.3.14 <2.0.0`; `tested` records CI fixtures 1.3.14 and 1.4.2.
Emitted builds reject 1.4.1 for a reproduced variable-collision bug; native API
capabilities are checked independently. `version` accepts npm semver or a predicate.
`effect-build-bun/api` exports `Build`, `Transpiler`, and their combined `layer`;
**that subpath requires the Bun runtime** and `bun-types` (an optional peer,
`>=1.3.14 <2.0.0`) and preserves native API results. The package root needs neither.

[Setup](../../docs/getting-started.md) · [Providers](../../docs/providers.md) · [Four-target example](../../examples/cli)

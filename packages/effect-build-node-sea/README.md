# effect-build-node-sea

Exact Node 26.7.0 direct single-executable assembly through the selected-command
lane.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-node-sea";

await Effect.runPromise(
  Command.AssembleExecutable.assembleDirect({
    main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
    outfile: "dist/app",
    observation: "hashed",
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`Command.AssembleExecutable` is the only public operation. It accepts CommonJS
or ESM mains and file-backed assets, delegates publication to core
`Author/Executable`, and makes no caller-authored target-evidence claim. The
legacy preparation-blob/injector path and former `Raw` and
`NodeMainExecutable` subpaths are absent.

The research-complete implementation also carries package-private candidates
for provider-native CJS/ESM code cache, CJS startup snapshots, and explicit
`execArgvExtension` policies (`none`, `env`, and `cli`). They run in the exact
Node 26.7 evidence suite but are intentionally unreachable from package exports
until their invalidation, relation, injection-resistance, and exact-host gates
are certified.

Cross-target Node-main work is a private five-construction-host repository
matrix with authenticated builder/base distributions, independent native
inspection, exact-target finalization, and receipts. Its control plane does not
advertise any unexecuted target. macOS ad-hoc, no-timestamp signing repairs
runnable Mach-O bytes only; Developer ID distribution belongs to
`effect-build-apple`.

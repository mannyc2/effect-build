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
advertise any unexecuted target. The complete 180-coordinate universe is
accounted as 150 applicable positive coordinates and 30 explicit rejections for
Node 26.7.0 direct SEA on macOS x64; rejected coordinates are never scheduled or
counted as passes. That rejection is upstream-blocked rather than a rejection
on the merits: the contract separates first-hand exact-target `SIGSEGV` job
observations from coordinates with no recorded execution outcome that remain
inferred from upstream evidence; failed jobs are not formal finalizer receipts.
The rejection must be re-adjudicated before the Node assembler cell changes.
macOS ad-hoc, no-timestamp signing repairs
runnable Mach-O bytes only; Developer ID distribution belongs to
`effect-build-apple`.

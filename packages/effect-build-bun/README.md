# effect-build-bun

Effect-native Bun operations: native executables from
`effect-build-bun/CompileExecutable` and directory bundles from
`effect-build-bun/Bundle`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    minify: true,
  }).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
// { _tag: "Executable", path, bytes, target, tool, sha256 }
```

`Bundle.bundle` currently runs `bun build` with `target` (browser/bun/node),
`format`, `minify`, `sourcemap`, `splitting`, `packages`, and `external`,
and returns an incremental `Artifact.Bundle` observation. A failed publication
can leave mixed destination files, and `target: "browser"` is not the portable
static-browser-application profile.

Each layer selects and probes Bun once — an explicit `executable` path
wins, otherwise one deterministic PATH walk — and never installs or
substitutes. Bun 1.3.14 is the required v0.5 evidence point; Stage 0 does not
claim that promotion evidence is complete. See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.

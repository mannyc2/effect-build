# effect-build-deno

Effect-native Deno operations: native executables from
`effect-build-deno/CompileExecutable` and directory bundles from
`effect-build-deno/Bundle`.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-deno/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    bundle: true,
    minify: true,
    permissions: { read: true, net: ["example.com"] },
  }).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`permissions` renders to `--allow-*` flags, and `minify` requires `bundle`
at the type level. `Bundle.bundle` currently runs `deno bundle` with
`platform` (browser/deno), `minify`, `codeSplitting`, `sourcemap`, and
`external`, returning an incremental `Artifact.Bundle` observation. A failed
publication can leave mixed destination files, and `platform: "browser"` is not
the portable static-browser-application profile.

Each layer selects and probes Deno once — an explicit `executable` path
wins, otherwise one deterministic PATH walk — and never installs or
substitutes. Deno 2.9.5 is the required v0.5 evidence point; Stage 0 does not
claim that promotion evidence is complete. See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.

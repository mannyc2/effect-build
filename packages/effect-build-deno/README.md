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
    target: "linux-x64-gnu",
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
at the type level. `Bundle.directWrite` runs `deno bundle` with
`platform` (browser/deno), `minify`, `codeSplitting`, `sourcemap`, and
`external`, returning a provider-local `DirectWriteOutcome` with mandatory file
digests. Failure can leave a partially changed caller destination, and
`platform: "browser"` is not the portable static-browser profile.

Each layer resolves Deno once, authenticates its executable bytes before and
after the version probe, and revalidates them around every invocation. Deno
2.9.5 is the required v0.5 evidence point; promotion evidence is incomplete. See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.

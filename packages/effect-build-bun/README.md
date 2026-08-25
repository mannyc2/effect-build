# effect-build-bun

Effect-native Bun operations: native executables from
`effect-build-bun/CompileExecutable` and directory bundles from
`effect-build-bun/Bundle`, plus one `effect-build-bun/Profile` Layer providing
both closed portable authoring services.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    target: "linux-x64-gnu",
    minify: true,
  }).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
// { _tag: "Executable", path, bytes, target, tool, digest, sha256 }
```

`Bundle.directWrite` runs `bun build` with `target` (browser/bun/node),
`format`, `minify`, `sourcemap`, `splitting`, `packages`, and `external`,
and returns a provider-local `DirectWriteOutcome` with mandatory file digests.
It makes no atomic-publication claim: failure can leave a partially changed
caller destination. `target: "browser"` is not the portable browser profile.

Each layer resolves Bun once, authenticates its executable bytes before and
after the version probe, and revalidates them around every invocation. Bun
profiles hard-require exact 1.3.14 and reject any other selected version before
authoring. Full cross-host promotion evidence is incomplete.
See the
[repository](https://github.com/mannyc2/effect-build) for the full toolkit.

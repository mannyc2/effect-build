# effect-build

Compile TypeScript into things you can ship, as composable Effect programs.

```ts
import * as Bun from "effect-build-bun";
Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
```

The call returns an Effect that builds an executable and records its path, byte count,
SHA-256, target, and compiler. Run it with a compiler layer and platform services:

```sh
bun add effect-build-bun@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

Create `src/cli.ts` containing `console.log("Hello!")`, then save this as `build.ts`:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
    Effect.tap((artifact) => Effect.log(artifact)),
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

With Node 24 and Bun 1.3.14 or 1.4.2 installed, run `node build.ts`, then `./dist/cli`.
Windows outputs must use an `.exe` suffix: change `outfile` to `dist/cli.exe` and run
`.\dist\cli.exe`. Existing outputs are replaced by default.

The [CLI example](examples/cli) compiles four targets, writes `dist/manifest.json`,
and writes checksums checked from the same working directory with
`sha256sum -c dist/SHA256SUMS`. The [artifact pipeline](examples/artifact-pipeline)
shows how producers consume the same artifacts.

Every output is an `Artifact.File`, `Artifact.Executable`, or `Artifact.Directory`.
Add `Executable.expectTarget`, `Tool.requireVersion`, or `Artifact.verify` when you
need an explicit check. Producing operations stage and commit by default;
`atomic: false` writes directly and `Commit.atomic(..., { onExists: "fail" })`
rejects an existing destination. Native in-memory APIs return their tool's values.

See [DESIGN.md](DESIGN.md) for the API and decisions. Downstream release systems own
publishing.

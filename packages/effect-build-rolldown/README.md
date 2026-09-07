# effect-build-rolldown

Bundle with the pinned Rolldown npm API; no external executable or layer is needed.

```ts
import * as Rolldown from "effect-build-rolldown";

const bundled = Rolldown.buildToDirectory({
  input: "src/cli.ts",
  outdir: "dist",
  output: { format: "esm" },
});
```

`buildToDirectory` returns `Artifact.Directory` and uses `Commit.atomic` unless
`atomic: false` is set. Provide platform services to run it. Native `build(options)`
returns Rolldown's result and respects `write`; use `write: false` for memory output.
`make(input)` acquires a scoped reusable builder with `generate` and `write` methods.
Active native operations finish before the scope closes the builder.

`watch(options)` streams completed builds and errors, closing each result before
delivery and the watcher when consumption ends. Slow consumers receive the latest
pending event with its `superseded` count. Native `watch.skipWrite` disables writes.
`transform` wraps the native transform utility. `DevEngine.make` acquires a scoped
experimental engine with native options for callbacks and writes. Parse, minify, resolve, scan, config,
and isolated declaration helpers are available directly from Rolldown.

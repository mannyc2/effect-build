# effect-build-bun

The Bun compiler is available only from
`effect-build-bun/CompileExecutable`.

```ts
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const program = CompileExecutable.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  observation: "hashed",
});
```

Provide `CompileExecutable.layer(...)` and an official Effect platform layer in
the application. The layer selects and probes Bun; it does not install it or
fall back to a different compiler.

# effect-build-deno

The Deno compiler is available only from
`effect-build-deno/CompileExecutable`.

```ts
import * as CompileExecutable from "effect-build-deno/CompileExecutable";

const program = CompileExecutable.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  observation: "unhashed",
  options: { bundle: true },
});
```

Provide `CompileExecutable.layer(...)` and an official Effect platform layer in
the application. The layer owns Deno discovery and probing only.

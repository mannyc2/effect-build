# effect-build-node-sea

Use `effect-build-node-sea/AssembleExecutable` to assemble a Node SEA
executable from a declared core file observation.

```ts
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";

const program = AssembleExecutable.assembleExecutable({
  main: { _tag: "File", path: "src/main.cjs", format: "commonjs" },
  outfile: "dist/app",
  observation: "hashed",
});
```

The package owns Node SEA validation and does not compile source or depend on
Esbuild or Bun packages.

# API

The 0.4 candidate publishes exactly five packages. Every root is namespace-only;
operations and data contracts live at exact subpaths.

```ts
import * as Core from "effect-build";
import * as Bun from "effect-build-bun/CompileExecutable";
import * as Deno from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as NodeSea from "effect-build-node-sea/AssembleExecutable";
import * as Artifact from "effect-build/Artifact";
import * as Tool from "effect-build/Author/Tool";
```

`Core` contains only the `Artifact`, `BorrowedOutput`, `Executable`, `Matrix`,
`SystemTarget`, and `Tool` namespaces. The exact members of each subpath are
frozen in `research/post-0.3/freeze/SURFACE.json`; package export maps and
declarations are tested directly against that file.

`Bun.compileExecutable` and `Deno.compileExecutable` accept one compiler
request with `entrypoint`, `outfile`, and `observation`; their matrix forms
accept an ordered `inputs` list and a bounded `concurrency`. Each requires the
corresponding `layer` and an application-provided Effect platform layer.

`Build.build` and `Context.make` expose the selected Esbuild operations through
their own layers. `NodeSea.assembleExecutable` accepts a core file observation,
an output path, and an observation mode. None of these packages re-export a
removed convenience operation from a root entry point.

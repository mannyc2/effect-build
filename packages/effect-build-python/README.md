# effect-build-python

`effect-build-python/Build` builds exactly one wheel and one source
distribution from a materialized exact source snapshot. The package owns one
frontend: uv. Its Layer resolves uv once (explicit path first, otherwise one
PATH walk), probes it once, and warns outside the coordinated `0.12.x` line.
It never installs, retries, substitutes, or falls back to Poetry's CLI or the
legacy `python -m build` frontend.

Both `uv_build` and `poetry-core` are backend fixtures behind this same
operation. The source must contain `pyproject.toml` and an up-to-date
`uv.lock`; `uv lock --check` validates that relationship without rewriting it,
then `uv build --wheel --sdist --force-pep517 --clear --no-create-gitignore --no-python-downloads` supplies the
backend-native filenames without provisioning another Python. Both commands
use one private scoped cache. Exactly two regular, non-symlink outputs are
accepted. They are committed together through one atomic
`Toolchain.publishBundle`; the returned wheel and sdist `FileArtifact` values
are exact projections of that committed bundle manifest.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as PythonBuild from "effect-build-python/Build";
import type * as Artifact from "effect-build/Artifact";

declare const sourceSnapshot: Artifact.Bundle; // finalized by an earlier producer

const outputs = await Effect.runPromise(
  PythonBuild.build(new PythonBuild.BuildInput({ source: sourceSnapshot, outdir: "dist/python" })).pipe(
    Effect.provide(PythonBuild.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
// { wheel: FileArtifact, sdist: FileArtifact, tool: { name: "uv", version } }
```

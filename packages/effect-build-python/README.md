# effect-build-python

Build exactly one Python wheel and one source distribution through a selected uv frontend. Both files come from one
atomically committed output generation and keep their native backend filenames.

## Install

```sh
npm install --save-exact effect-build-python@0.7.0 effect-build@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Install **uv 0.12.x** and the Python interpreter required by your project separately. The finalized source tree must
contain `pyproject.toml` and `uv.lock`. The operation checks the lock and disables Python downloads; your backend's
build dependencies still need to be available to uv.

## Build a finalized source snapshot

Use a `HashedTree` returned by core's tree finalizer. This helper returns an Effect; compose it with your snapshot
producer and run the combined program at the application entry point.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Build from "effect-build-python/Build";
import type * as Artifact from "effect-build/Artifact";

const builder = Build.layer();

export const buildDistributions = (source: Artifact.HashedTree) =>
  Build.build(
    new Build.BuildInput({
      source,
      outdir: "dist/python",
    }),
  ).pipe(
    Effect.provide(builder),
    Effect.provide(NodeServices.layer),
  );
```

The result has `wheel` and `sdist` fields, each an `Artifact.HashedFile`. Their publication records identify the
same committed tree. `outdir` must not already exist; existing files are never overlaid.

`Build.layer({ executable })` can select an explicit uv path. Otherwise selection uses one deterministic PATH walk.
The selected bytes are checked before `uv lock --check` and `uv build`. The source is revalidated and lent as a private
snapshot, and only exactly two regular distribution outputs are admitted before finalization.

Import `effect-build-python/PythonBuildError` for the exported build and uv error classes. The package does not own
Python package upload or a release workflow.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)

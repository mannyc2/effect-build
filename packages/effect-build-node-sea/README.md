# effect-build-node-sea

An Effect service for native Node
[single executable application assembly](https://nodejs.org/api/single-executable-applications.html#generating-single-executable-applications-with---build-sea).
The 0.9.0 source API is currently unreleased and uses Effect 4.0.0.

`NodeSea` runs `node --check` and `node --build-sea` against already-bundled JavaScript.
Bundling and signing belong to the application. The native assembly command was
[added in Node 25.5.0](https://nodejs.org/api/single-executable-applications.html);
the binding's one-time probe warns outside 26.7.x and allows native failures to surface.

## Usage

This [typechecked example](../../examples/tool-runs/src/NodeSea.ts) takes plain input and
output paths. The application's entry point supplies `NodeSea.layer()` and its platform
services.

```ts
import { Effect } from "effect";
import { NodeSea } from "effect-build-node-sea";

/** The entry point supplies NodeSea.layer and its chosen platform services. */
export const assemble = Effect.fn("Example.assemble")(function*(main: string, outfile: string) {
  const sea = yield* NodeSea;
  return yield* sea.assemble({ main, outfile, atomic: true });
});
```

The service's `assemble` method accepts:

| Input                            | Meaning                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `main`                           | Path to already-bundled JavaScript                                                          |
| `outfile`                        | Requested output path; Windows appends `.exe` when needed                                   |
| `mainFormat?`                    | `"commonjs"` by default, or `"module"`                                                      |
| `assets?`                        | Native asset names mapped to file paths                                                     |
| `cwd?`                           | Base for relative input, asset, and output paths                                            |
| `atomic?`                        | Default false; true stages beside the destination and checks native magic before one rename |
| `disableExperimentalSEAWarning?` | Native configuration option; default false                                                  |

Success returns the absolute final path. Configuration files live in a private temporary
directory and are cleaned after assembly. Snapshot and code-cache generation are disabled.

## Construction

`NodeSea.make(options?)`, `NodeSea.layer(options?)`, and `NodeSea.layerConfig(config)`
accept `executable?` and `baseExecutable?`. The builder is resolved once from PATH unless
explicitly supplied. The base defaults to that builder; an explicit base is passed to Node's
native configuration. Choose a base compatible with the builder's native SEA requirements.

The service captures its process spawner, filesystem, and path services at construction.
Version probing is warn-only. An older Node without `--build-sea` reports a native
`ToolError` when assembly runs. No fallback or injection library is selected.

macOS applications compose their required signing step, for example through the
[Codesign service](../effect-build-apple/README.md), after assembly. The Node SEA integration
job exercises native Node 26.7 on Linux; it does not establish credentialed signing behavior.

## Errors

Native command failures use `ToolError`. `NodeSeaError` carries `step: "prepare" | "cleanup"`
and a cause for configuration filesystem failures. With `atomic: true`, publication can also
fail with `AtomicError` or `ExecutableError`; a native-magic read failure remains
`PlatformError`. See [errors and publication](../../docs/errors.md) for commit and cleanup semantics.

[Getting started](../../docs/getting-started.md) ·
[Tools and bindings](../../docs/providers.md) ·
[Compatibility](../../docs/compatibility.md)

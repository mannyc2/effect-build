# Tools and bindings

Each binding is a `Context.Service` whose `make` resolves its tool with `Tool.make` and
returns traced methods. Call methods on the service obtained with `yield* Service`.

## Construction and resolution

Services expose `make(options?)`, `layer(options?)`, and `layerConfig(config)`.
`layerConfig` obtains options through Effect `Config`; applications supply their platform
layer once. The [Bun example](../examples/bun-build/src/main.ts) shows this construction:

```ts
const services = Bun.layer().pipe(Layer.provideMerge(NodeServices.layer));
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
```

An explicit `executable` is used exactly as supplied. Otherwise the kernel reads PATH once
and walks its directories in order, skipping missing files, directories, and non-executable
files. Windows lookup also considers `.exe` and `.cmd`. Operations use the chosen path without
another search, installation, fallback, or identity check.

A binding can add a one-time version probe. Its tested range is warning policy: an untested
version, probe failure, or ten-second timeout logs one warning, then construction succeeds.
Bun probes against 1.3.x/1.4.x and Node SEA against 26.7.x. Other bindings currently omit a
probe. The native operation reports unsupported flags or capabilities through `ToolError`.

## Shipped bindings

| Package                                                 | Service                             | Native operations and results                                                          |
| ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| [Bun](../packages/effect-build-bun/README.md)           | `Bun`                               | `build` returns a bundle directory; `compile` returns an executable path               |
| [Deno](../packages/effect-build-deno/README.md)         | `Deno`                              | `compile` returns an executable path; `bundle` returns a directory                     |
| [Node SEA](../packages/effect-build-node-sea/README.md) | `NodeSea`                           | `assemble` runs native `node --build-sea` on already-bundled source and returns a path |
| [Python](../packages/effect-build-python/README.md)     | `Python`                            | `build` runs uv and returns its output directory                                       |
| [nFPM](../packages/effect-build-nfpm/README.md)         | `Nfpm`                              | `package` consumes a native config file and returns the package path                   |
| [Syft](../packages/effect-build-sbom/README.md)         | `Sbom`                              | `generate` writes a selected format; `report` returns native JSON                      |
| [Apple](../packages/effect-build-apple/README.md)       | `Codesign`, `Notarytool`, `Stapler` | Sign/verify, submit/wait/info/log, and staple/validate                                 |
| [Windows](../packages/effect-build-windows/README.md)   | `SignTool`                          | Sign an existing file in place or verify it                                            |

Inputs and flags stay native to the tool. Bun compile uses native `bun-...` target strings.
Deno exposes its six native target triples; omitting the target lets Deno choose its host.
The bindings append `.exe` where their native Windows output rules require it. No core target
or artifact record is inferred.

Node SEA delegates assembly to Node's native command and lets the caller bundle source first.
Signing mutates the selected file in place. Notarytool returns native statuses for the caller
to interpret. Keychain profiles and API key files are available for notarization; native
password flags and SignTool PFX passwords are materialized only at the command boundary
and included in stderr redaction.

## Publication

Producing bindings default to native direct output. Set `atomic: true` where supported to stage
beside the destination, retaining its basename. Executable publication checks four native-magic
bytes before one rename. Bundle and uv output directories commit each leaf separately;
unrelated destination files remain.

Applications choose digest verification, portable layout checks, signing order, and release
publication. See [errors and publication](errors.md) and [recipes](recipes.md).

## Environment and diagnostics

Binding input types expose native `cwd`, `env`, `extendEnv`, and `extraArgs` where relevant.
The platform's normal inherited environment remains the default. To submit a caller-supplied
allowlist at the command level, use `Environment.scrub`; it sets `extendEnv: false` on every
command leaf. Obtain allowlist values through `Config`. Native backends can supplement
system variables, and the child retains normal filesystem and network access.

`Tool.run` and `Tool.stream` keep a bounded stderr tail for failed exits, defaulting to
8192 bytes. Exact values supplied through `redact` are removed before trimming, including
matches split between chunks. stdout belongs to the selected sink or event decoder.
`ToolError` contains no argv, environment, or stdout; a trusted spawner or caller-owned
logging code can still observe the raw command and output.

## Write another binding

Use `Tool.make` inside a service's `make`, materialize native `ChildProcess.Command` values
inside its methods, and return paths or decoded native reports. Choose `run` for finite
commands, `stream` for events, and `session` when the caller owns pipe writers and process
lifecycle.

The [Ffprobe](../examples/ffmpeg-session/src/Ffprobe.ts) and
[Ffmpeg](../examples/ffmpeg-session/src/Ffmpeg.ts) examples demonstrate finite protocol
decoding and scoped multi-input encoding. They remain examples rather than published packages.

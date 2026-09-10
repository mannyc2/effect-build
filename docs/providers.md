# Tools and providers

Every package other than the core wraps one external toolchain or one domain. This page explains
how a provider finds and checks its tool, which versions each one accepts and is tested with, and
what each compiler accepts as a target.

## How a provider works

A tool provider exports a service, a `layer`, and operations:

```ts
import * as Bun from "effect-build-bun";

const layer = Bun.layer({ executable: process.env.EFFECT_BUILD_BUN, version: "^1.4.2" });
```

- `layer({ executable?, version? })` chooses the binary: an explicit path, or the first runnable
  match on `PATH`. It resolves symlinks, hashes the file, runs its version probe once, and checks
  the version against `version`, which defaults to the package's `supported` range. Later
  operations use the recorded path without checking it again. `executable: undefined` means
  `PATH`, so forwarding an unset environment variable needs no branch.
- `supported` is the npm semver range the layer accepts by default. `tested` is the exact
  version or versions real-tool CI runs. A version inside `supported` but outside `tested` has not
  been exercised; the range says the package's flags exist there.
- `version` accepts any npm semver range (`^1.4.2`, `>=1.3.14 <2`, `1.3.14 || 1.4.2`) or a
  predicate on the version string. Prereleases match only a range that names a prerelease. An
  invalid range fails through `ToolVersionUnsupported` rather than throwing.
- Operations take `outfile` or `outdir`, run the tool against the resolved record, verify their
  output, and commit it through the [atomic output](errors.md#atomic-output) options every
  producer shares.
- Layers need platform services: `NodeServices.layer` from `@effect/platform-node`, or
  `BunServices.layer` from `@effect/platform-bun`.

Tool errors name their tool: `ToolNotFound`, `ToolProbeFailed`, and `ToolVersionUnsupported` come
from the layer, `ToolFailed` and `ToolSpawnFailed` from operations. Every operation's error type
lists exactly what it can raise.

## Tool versions

| Provider              | Tool                 | `supported`            | `tested`       | Notes                                                                                                                       |
| --------------------- | -------------------- | ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| effect-build-bun      | `bun`                | `>=1.3.14 <2.0.0`      | 1.3.14, 1.4.2  | `compile` and `bundle` reject 1.4.1, which reproduces a variable-collision defect. The native API is checked independently. |
| effect-build-deno     | `deno`               | `>=2.9.5 <3.0.0`       | 2.9.5          | On 2.9.6 and later, `transpile` rejects `conditions` and `compile`/`watch` reject `allowScripts`: Deno removed those flags. |
| effect-build-node-sea | `node`               | `>=22.0.0 <27.0.0`     | 22.0.0, 26.7.0 | The builder and the base executable must report the same version.                                                           |
| effect-build-archives | `git` (for `source`) | `>=2.40.0 <3.0.0`      | 2.40.0, 2.55.0 | `zip` and `tarGz` need no tool.                                                                                             |
| effect-build-python   | `uv` (for `build`)   | `>=0.12.0 <1.0.0`      | 0.12.0         | `wheel` needs no tool.                                                                                                      |
| effect-build-nfpm     | `nfpm`               | `>=2.47.0 <3.0.0`      | 2.47.0         | Native nFPM configuration passes through, including lifecycle scripts.                                                      |
| effect-build-sbom     | `syft`               | `>=1.50.0 <2.0.0`      | 1.50.0         | A scan inventories what Syft can discover; it is not proof of completeness.                                                 |
| effect-build-windows  | `signtool`           | `>=10.0.26100 <11.0.0` | 10.0.26100     | Experimental. Versions are read from the binary's resource; string ranges compare three components, predicates see four.    |
| effect-build-apple    | `xcrun`              | `>=70.0.0 <71.0.0`     | 70.0.0         | Experimental. Resolved once; native commands come from the active Xcode tools.                                              |

Two providers run in process and have no layer:

| Provider              | Dependency                        | Notes                                                                                                              |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| effect-build-esbuild  | peer `esbuild` `>=0.28.2 <0.29.0` | Your install's esbuild runs; tested with 0.28.2. `supported` and `tested` report the range and the version.        |
| effect-build-rolldown | dependency `rolldown` `1.2.5`     | Pinned: the wrapper uses `rolldown/experimental`, whose types change outside semver. `tested` reports the version. |

The archive writers and the wheel writer are pure TypeScript and need only platform services.

## Targets

Core targets are `linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`,
`darwin-arm64`, `windows-x64`, and `windows-arm64`. Linux without a suffix means glibc. Every
executable's `target` is read from its header after the tool runs.

- **Bun** accepts core targets and its own names (`bun-linux-x64-baseline`, `bun-windows-x64-modern`,
  and so on). Without `target`, Bun selects its host and the provider inspects the result; a
  static Linux binary reports as glibc. Windows outputs must end in lowercase `.exe`.
- **Deno** accepts core targets and native triples. There is no musl target. Deno embeds the output
  basename, so the staged file and the committed file share a name; Windows outputs must end in
  lowercase `.exe`.
- **Node SEA** builds for the base executable's target, read from its header, so a base running
  under emulation is recorded as itself. Windows outputs must end in `.exe`.
- **Signing** preserves the input target: `Windows.sign` and `Apple.sign` re-read the header after
  signing and fail if it changed.
- `Target.host()` returns the host target when the OS, architecture, and (on Linux) libc are
  established, and `undefined` otherwise; compilers make their own host selection.

## Native APIs

`effect-build-bun/api` wraps `Bun.build` and `Bun.Transpiler`; `effect-build-deno/api` wraps
`Deno.bundle`. These subpaths run only on their runtime and keep the native result types. The
Bun API declarations reference `bun-types`, an optional peer (`>=1.3.14 <2.0.0`) that a Node
consumer never installs; the package roots reference no Bun or Deno types. For atomic directory
output use the CLI operations (`Bun.bundle`, `Deno.bundle`); the native APIs write the way the
runtime does.

## Output and diagnostics

Operations that run a tool accept `onOutput`, which receives every stdout and stderr chunk as it
arrives while the completed output is still retained on failure. `ToolFailed` carries `stdout`,
`stderr`, `exitCode`, and truncation flags; `Tool.run` keeps 8 MiB per stream by default. Bun and
Deno `watch` inherit stdout and stderr by default and take `stdio: "pipe"` to hand you the child's
streams.

The compiler's host and the host running Effect are separate choices: a Node process can drive
Bun and Deno on any host they support, but a cross-compiled binary still needs a matching host to
run. The [compatibility](compatibility.md) page has the evidence per operation, and
[CONTRIBUTING.md](../CONTRIBUTING.md) the commands that run the real-tool tests.

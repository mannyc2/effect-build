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
  match on `PATH`. It resolves symlinks, records file metadata, runs its version probe once, and checks
  the version against `version`, which defaults to the package's `supported` range. Later
  operations use the recorded path without checking it again. `executable: undefined` means
  `PATH`, so forwarding an unset environment variable needs no branch.
- `supported` is the npm semver range the layer accepts by default. `tested` is the exact
  versions in a readonly array that real-tool CI runs. A version inside `supported` but outside `tested` has not
  been exercised; the range says the package's flags exist there.
- `version` accepts any npm semver range (`^1.4.2`, `>=1.3.14 <2`, `1.3.14 || 1.4.2`) or a
  predicate on the version string. Prereleases match only a range that names a prerelease. An
  invalid range fails through `ToolVersionUnsupported` rather than throwing.
- Operations take `outfile` or `outdir`, run the tool against the resolved record, validate their
  output, and commit it through the [atomic output](errors.md#atomic-output) options every
  producer shares.
- Layers need platform services: `NodeServices.layer` from `@effect/platform-node`, or
  `BunServices.layer` from `@effect/platform-bun`.


A binary provider is `Tool.provider(Service, spec)`: its declaration owns the tool name,
version extractor, supported range, tested versions, operation constraints, and host requirements.
`resolved` reads the tool from the service; `testLayer({ tool, ...extra })` installs an existing
record. `extend` adds toolchain state such as Deno's file-backed `denort` or Node SEA's base executable.
An extractor normally uses `Tool.versionPattern`; an Effect extractor can inspect the resolved
path when the native version lives in binary resources.

Tool errors name their tool: `ToolNotFound`, `ToolProbeFailed`, and `ToolVersionUnsupported` come
from the layer; an operation constraint also raises `ToolVersionUnsupported` with `operation` and `reason`. `ToolFailed` and `ToolSpawnFailed` from operations. Every operation's error type
lists exactly what it can raise.

## Tool versions

<!-- providers-table:start -->

| Provider | Tool | `supported` | `tested` | Operation constraints |
| --- | --- | --- | --- | --- |
| effect-build-bun | `bun` | `>=1.3.14 <2.0.0` | `1.3.14`, `1.4.2` | `Bun.compile` rejects `1.4.1`: variable-collision defect in emitted builds<br>`Bun.bundle` rejects `1.4.1`: variable-collision defect in emitted builds<br>`Bun.build` rejects `1.4.1`: variable-collision defect in emitted builds<br>`Bun.watch` rejects `1.4.1`: variable-collision defect in emitted builds |
| effect-build-deno | `deno` | `>=2.9.5 <3.0.0` | `2.9.5` | `Deno.compile` rejects `>=2.9.6`: --allow-scripts was removed in Deno 2.9.6; omit it or select 2.9.5<br>`Deno.watch` rejects `>=2.9.6`: --allow-scripts was removed in Deno 2.9.6; omit it or select 2.9.5<br>`Deno.transpile` rejects `>=2.9.6`: --conditions was removed from deno transpile in Deno 2.9.6; omit it or select 2.9.5 |
| effect-build-node-sea | `node` | `>=22.0.0 <27.0.0` | `22.0.0`, `26.7.0` | — |
| effect-build-archives | `git` | `>=2.40.0 <3.0.0` | `2.40.0`, `2.55.0` | — |
| effect-build-python | `uv` | `>=0.12.0 <1.0.0` | `0.12.0` | — |
| effect-build-nfpm | `nfpm` | `>=2.47.0 <3.0.0` | `2.47.0` | — |
| effect-build-sbom | `syft` | `>=1.50.0 <2.0.0` | `1.50.0` | — |
| effect-build-windows | `signtool` | `>=10.0.26100 <11.0.0` | `10.0.26100` | — |
| effect-build-apple | `xcrun` | `>=70.0.0 <71.0.0` | `70.0.0` | — |
| effect-build-esbuild | `esbuild` | `>=0.28.2 <0.29.0` | `0.28.2` | — |
| effect-build-rolldown | `rolldown` | `1.2.5` | `1.2.5` | — |

<!-- providers-table:end -->

The Deno constraints apply only when the named removed flag is used. Node SEA's `tool`
(the builder) and `base` must have matching versions. SignTool reports a native four-component
version; string ranges and the tested SDK family use the first three, while predicates see all four.
Apple and Windows signing remain experimental.

esbuild and Rolldown run in process and have no tool layer. esbuild is a peer; Rolldown is
pinned because its experimental API can change outside semver.

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

## Environment and host requirements

Binary operations and watch sessions accept `env`, `extendEnv`, and `scrubEnv`. The default
inherits the process environment. `env` merges into it unless `extendEnv: false`; that option
submits only `env` to the platform spawner, or an empty map when `env` is omitted.
`scrubEnv: true` submits
`PATH` pointing to the resolved tool's directory, and `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`,
and `TMP` pointing to a scoped temporary directory. Explicit `env` overrides those defaults.
The temporary directory is removed when the process or watch scope closes.

Native process APIs may supplement that map. On Windows, Node's libuv restores missing
system variables such as `SYSTEMROOT`, `TEMP`, and `PATH` from the parent. Application
variables are still removed, and an explicit `env.PATH` replaces the native fallback.
Use the uppercase keys shown above when overriding scrubbed defaults; Windows treats
environment names case-insensitively. This is environment replacement through the selected
platform, not a guarantee that the child's entire environment is empty.
See [Node 24.14.1's Windows environment construction](https://github.com/nodejs/node/blob/v24.14.1/deps/uv/src/win/process.c#L597-L607).

```ts
const executable = yield* Bun.compile({
  entrypoints: ["src/cli.ts"], outfile: "dist/cli",
  scrubEnv: true, env: { NODE_ENV: "production" },
});
```

Each provider exports `requirements` with documented environment keys, possible network use,
and host services. These are discovery metadata, not an exhaustive input closure: tools may
read project configuration, plugins, lifecycle scripts, credentials, or other environment variables.
Scrubbing is opt-in because signing, tool downloads, and SDK discovery can require explicit host
inputs. It isolates the environment only; filesystem access and network remain available.

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

Tool byte identity is optional: compose `Bun.resolved.pipe(Effect.flatMap(Tool.withSha256))`
when a caller needs it. Resolving a provider does not read the compiler for hashing.

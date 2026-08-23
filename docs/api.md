# API

Six packages; every root is a namespace facade and operations live at
subpaths. The exact export lists are asserted against
[`tooling/public-api.json`](../tooling/public-api.json).

```ts
import * as BunBundle from "effect-build-bun/Bundle";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoBundle from "effect-build-deno/Bundle";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as Watch from "effect-build-esbuild/Watch";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
import * as Rolldown from "effect-build-rolldown/Build";
import * as RolldownWatch from "effect-build-rolldown/Watch";
import * as Target from "effect-build/Target";
import * as Toolchain from "effect-build/Toolchain";
```

**Compile executables.** `BunCompile.compileExecutable` and
`DenoCompile.compileExecutable` take a flat input — `entrypoint`, `outfile`,
optional `cwd`, `target` (defaults to the host), `hash` (defaults to `true`),
and tool-native options (`minify`/`sourcemap`/`bytecode` for Bun;
`bundle`/`minify`/`permissions` for Deno, where `minify` requires `bundle`
at the type level). Both return one `Artifact.Executable`:

```ts
interface Executable {
  readonly _tag: "Executable";
  readonly path: string; // absolute, .exe appended for windows targets
  readonly bytes: number;
  readonly target: Target.Target;
  readonly tool: { readonly name: string; readonly version: string };
  readonly sha256?: string; // present unless hash: false
}
```

**Bundle to a directory.** `BunBundle.bundle` (`bun build`, with `target`
browser/bun/node, `format`, `minify`, `sourcemap`, `splitting`, `packages`,
`external`) and `DenoBundle.bundle` (`deno bundle`, with `platform`
browser/deno, `minify`, `codeSplitting`, `sourcemap`, `external`) take
non-empty `entrypoints` plus an `outdir` and return one `Artifact.Bundle`:

```ts
interface Bundle {
  readonly _tag: "Bundle";
  readonly outdir: string; // absolute
  readonly files: readonly { path: string; bytes: number; sha256?: string }[]; // sorted by path
  readonly tool: { readonly name: string; readonly version: string };
}
```

**Bundle with esbuild.** `Build.build` runs one in-memory build (`write`
must be the literal `false`) and returns esbuild's native `BuildResult`;
`Build.transform` transpiles one file in memory and `Build.analyzeMetafile`
renders esbuild's size report. `Context.make` returns a scoped incremental
context whose `rebuild`, `watch`, `serve`, and `cancel` are Effects;
closing the Scope cancels and disposes the native context. `Watch.changes`
turns watch mode into a `Stream` of build results — broken rebuilds arrive
as values on `result.errors`, and ending the stream stops the watcher.

**Bundle with Rolldown.** `Rolldown.make` is a scoped handle over a native
`RolldownBuild` whose `generate` (in-memory) and `write` (on-disk) return
rolldown's native `RolldownOutput`; `Rolldown.generate`/`Rolldown.write`
are the one-shot forms, and native `close` is owned by the Scope.
`RolldownWatch.events` streams sanitized watcher events (`START`,
`BUNDLE_START`, `BUNDLE_END`, `END`, `ERROR`) with the native result
handles closed for you.

**Assemble Node SEA executables.** `AssembleExecutable.assembleExecutable`
takes a `main` (`File` or `Bytes`, commonjs or module), optional `assets`
as a keyed record, and produces a host-target executable via `node --check`
and `node --build-sea`.

**Targets.** `Target.Target` is the eight-target vocabulary
(`macos|linux|windows` × `x64|aarch64`, with `gnu|musl` on linux);
`Target.info` projects os/architecture/abi/executable-suffix/native-format
from a target, and `Target.host()` best-effort detects the host. Each
provider exposes its own supported subset as `Target`.

**Toolchain.** `effect-build/Toolchain` is the kernel providers are built
on — `resolveExecutable` (resolve-once), `run`/`runOrFail` (scoped spawn
with bounded output capture), `probeVersion`, `warnIfUntested`, and
`publishExecutable` (staged atomic publication). It is public so
third-party provider authors build on working code, not type-only
contracts.

Fan-out is plain Effect: `Effect.forEach(inputs, compileExecutable, { concurrency })` with `Effect.exit` per cell when independent settlement is
wanted.

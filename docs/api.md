# API

Twelve lockstep packages; every root is a namespace facade and operations live at
subpaths. The exact export lists are asserted against
[`tooling/public-api.json`](../tooling/public-api.json).

```ts
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives/Archive";
import * as SourceArchive from "effect-build-archives/SourceArchive";
import * as BunBundle from "effect-build-bun/Bundle";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoBundle from "effect-build-deno/Bundle";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as Watch from "effect-build-esbuild/Watch";
import * as Nfpm from "effect-build-nfpm/Package";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
import * as PythonBuild from "effect-build-python/Build";
import * as Rolldown from "effect-build-rolldown/Build";
import * as RolldownWatch from "effect-build-rolldown/Watch";
import * as Sbom from "effect-build-sbom/Generate";
import * as SignMsix from "effect-build-windows/SignMsix";
import * as Target from "effect-build/Target";
import * as Toolchain from "effect-build/Toolchain";
```

**Compile executables.** `BunCompile.compileExecutable` and
`DenoCompile.compileExecutable` take a flat input — `entrypoint`, `outfile`,
optional `cwd`, `target` (defaults to the host), and tool-native options
(`minify`/`sourcemap`/`bytecode` for Bun;
`bundle`/`minify`/`permissions` for Deno, where `minify` requires `bundle`
at the type level). Both return one `Artifact.Executable`:

```ts
interface Executable {
  readonly _tag: "Executable";
  readonly path: string; // absolute, .exe appended for windows targets
  readonly bytes: number;
  readonly target: Target.Target;
  readonly tool: { readonly name: string; readonly version: string };
  readonly sha256: string; // canonical lowercase SHA-256
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
  readonly entries: readonly (
    | { _tag: "File"; path: string; bytes: number; mode: number; sha256: string }
    | { _tag: "Directory"; path: string; mode: number }
    | { _tag: "SymbolicLink"; path: string; target: string }
  )[]; // exact, sorted manifest
  readonly tool: { readonly name: string; readonly version: string };
}
```

Bundle publication rejects a pre-existing destination, records every regular
file, empty directory, relative symbolic link, and permission mode, and commits
the complete staged tree with one directory rename. Downstream producers use
`Toolchain.materializeVerifiedBundle` to reconstruct a private snapshot only
after verifying the manifest and every file digest.

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

**Finalize ordinary files.** Archives, Python distributions, native
packages, signed products, disk images, installers, and SBOMs return
`Artifact.FileArtifact`: `_tag: "File"`, absolute `path`, `bytes`, `tool`,
and mandatory canonical `sha256`. `Toolchain.publishFile` owns private staging,
regular-file admission, final observation, optional validation of the exact
held bytes, and the atomic commit under the
release machine's single-writer invariant. An interruption pending across the
commit is reasserted after the complete destination becomes visible, so callers
must observe/adopt or deliberately rebuild that output rather than infer that
the rename did not happen.

**Release producers.** `effect-build-archives` builds deterministic binary
layouts or projects one exact Git tree. `effect-build-python` emits exactly
one wheel and one sdist through uv. `effect-build-nfpm` emits deb/rpm/apk,
Arch Linux, or unsigned MSIX. `effect-build-windows` signs and verifies MSIX.
`effect-build-sbom` emits strict-UTF-8, schema-decoded SPDX or CycloneDX JSON
whose format and output extension agree.
`effect-build-apple` composes app/DMG/pkg construction, signing, notarization,
stapling, and assessment without placing credentials in returned values.

**Targets.** `Target.Target` is the eight-target vocabulary
(`macos|linux|windows` × `x64|aarch64`, with `gnu|musl` on linux);
`Target.info` projects os/architecture/abi/executable-suffix/native-format
from a target, and `Target.host()` best-effort detects the host. Each
provider exposes its own supported subset as `Target`.

**Toolchain.** `effect-build/Toolchain` is the kernel providers are built
on — `resolveExecutable` (resolve-once), `run`/`runOrFail` (scoped spawn
with bounded output capture), `probeVersion`, `warnIfUntested`, and
`publishExecutable`, `publishFile`, and `publishBundle` (staged publication),
plus `readVerifiedFile` and `materializeVerifiedBundle` for immutable
downstream trust boundaries.
It is public so
third-party provider authors build on working code, not type-only
contracts.

Fan-out is plain Effect: `Effect.forEach(inputs, compileExecutable, { concurrency })` with `Effect.exit` per cell when independent settlement is
wanted.

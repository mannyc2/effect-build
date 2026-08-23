# API

Five packages; every root is a namespace facade and operations live at
subpaths. The exact export lists are asserted against
[`tooling/public-api.json`](../tooling/public-api.json).

```ts
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
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

**Bundle with esbuild.** `Build.build` runs one in-memory build (`write`
must be the literal `false`) and returns esbuild's native `BuildResult`.
`Context.make` returns a scoped incremental context whose `rebuild`,
`watch`, `serve`, and `cancel` are Effects; closing the Scope cancels and
disposes the native context.

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

# Plan 009: Add discoverable Bun and Deno drivers and exercise all three axes

> **Executor instructions**: Execute after Plans 007 and 008 are `DONE`. Keep
> tool-specific semantics inside their own modules and keep the common engine
> unchanged unless a genuine shared lifecycle bug is exposed. Add tests before
> implementation. Real-tool tests must fail in the required CI route when tools
> are absent; a silent return is not a pass. Update only Plan 009's status row
> after the deterministic gate and the provisioned local equivalent of the
> required real-tool job are green. This plan does not require pushing the
> branch or waiting for a remote run; the workflow itself must make those same
> commands required on the next operator-owned push.
>
> **Drift check (run first)**:
>
> ```sh
> rg -q '^\| 007 \|.*\| DONE \|$' plans/README.md
> rg -q '^\| 008 \|.*\| DONE \|$' plans/README.md
> pnpm check
> pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts
> pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
> git diff --stat 15b6abb8c28db73b4e8aeb818755f6ffc3e05530..HEAD -- src/standalone test package.json pnpm-lock.yaml scripts tooling .github/workflows/ci.yml
> git status --short
> ```

Expected: both dependencies are complete and green; only their declared files
plus the known user WIP differ. Any public export or old managed driver edit is
a STOP condition—Plan 010 owns the cutover.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/008-build-effect-native-compile-engine.md`
- **Category**: feature / architecture / tests / CI / DX
- **Planned at**: commit `15b6abb`, 2026-08-09

## Why this matters

The same core call must survive three independent choices: the runtime hosting
the Effect program, the compiler binary, and the artifact target. The current
repository models those names but couples them in practice: both compiler
drivers are macOS/aarch64/version pinned, and every “host” test calls Node's
spawner. This plan makes the axes operational while keeping compiler-specific
options visibly different.

## Fixed driver API and options

Create final modules `src/Bun.ts` and `src/Deno.ts`. They are not exported by
`package.json` until Plan 010, but their runtime/type surface is final (shape B
per the gate decisions recorded 2026-08-11; there is no driver value):

```ts
export class Compiler extends Context.Service<Compiler, CompilerService<Options>>()(
  "effect-build/bun/Compiler" // or deno
) {}

export const compileExecutable: (
  input: CompileExecutableInput<Options>
) => Effect.Effect<Artifact, BuildError, Compiler>

export const layer: (options?: LayerOptions) => Layer.Layer<
  Compiler,
  ToolNotFound | ToolProbeFailed,
  ChildProcessSpawner | FileSystem | Path | Crypto
>
```

`compileExecutable` is built with Plan 007's `makeCompileExecutable(Compiler)`
factory; each module's `Options` instantiation is its own concrete type, so
cross-tool option mixing is a type error by construction.

`LayerOptions` has only `executable?: string`. Omitted means discover `bun` or
`deno` on PATH; supplied must be an absolute path and means probe only that
executable. A relative override fails Layer construction as `ToolProbeFailed`
before spawn. This is Layer provisioning, not a per-build option. Capture the
host services while building the Layer so `Compiler.compileExecutable` has
`R = never`.

### Bun V1 options

```ts
interface Options {
  readonly minify?: boolean
  readonly sourcemap?: "linked" | "inline"
  readonly bytecode?: boolean
}
```

Only render a flag when its field is present/true. The base command is:

```text
<observed bun> build --compile [target] [requested options] --outfile=<staged> <entrypoint>
```

Do not inject `--minify`, `--no-env-file`, or any
`--no-compile-autoload-*` flag. Bun's official standalone documentation lists
minify, sourcemap, bytecode, and the supported compile targets:
`https://bun.com/docs/bundler/executables`.

CPU `baseline`/`modern`, Windows metadata, define/external/plugin surfaces,
multiple entrypoints, external sourcemap artifacts, and raw argv are
deliberately deferred. They are not coerced into the common target, silently
deleted from staging, or added to a generic options bag.

### Deno V1 options

```ts
type PermissionValue = true | readonly string[]

type Permissions =
  | { readonly all: true }
  | {
      readonly all?: false
      readonly read?: PermissionValue
      readonly write?: PermissionValue
      readonly net?: PermissionValue
      readonly env?: PermissionValue
      readonly run?: PermissionValue
      readonly ffi?: PermissionValue
      readonly sys?: PermissionValue
      readonly import?: PermissionValue
    }

type Options =
  | { readonly bundle?: false; readonly minify?: never; readonly permissions?: Permissions }
  | { readonly bundle: true; readonly minify?: boolean; readonly permissions?: Permissions }
```

Render permissions as `--allow-<name>` or
`--allow-<name>=comma,separated,values`; `{ all: true }` renders `--allow-all`.
`minify` is unrepresentable unless `bundle: true`. The base command is:

```text
<observed deno> compile [target] [bundle/minify] [permissions] --output <staged> <entrypoint>
```

Do not inject `--no-config`, `--no-lock`, `--no-remote`, `--no-npm`,
`--cached-only`, `--no-check`, `--no-prompt`, `DENO_DIR`, or `DENORT_BIN`.
Normal config, lockfile, cache/network, and environment behavior belongs to
Deno and the calling process. The official compile reference documents
permissions, config merging, bundle/minify, and targets:
`https://docs.deno.com/runtime/reference/cli/compile/`.

## Target mappings

Map Plan 007's canonical targets exactly:

| Target | Bun token | Deno token |
|---|---|---|
| `macos-x64` | `bun-darwin-x64` | `x86_64-apple-darwin` |
| `macos-aarch64` | `bun-darwin-arm64` | `aarch64-apple-darwin` |
| `linux-x64-gnu` | `bun-linux-x64` | `x86_64-unknown-linux-gnu` |
| `linux-aarch64-gnu` | `bun-linux-arm64` | `aarch64-unknown-linux-gnu` |
| `linux-x64-musl` | `bun-linux-x64-musl` | unsupported |
| `linux-aarch64-musl` | `bun-linux-arm64-musl` | unsupported |
| `windows-x64` | `bun-windows-x64` | `x86_64-pc-windows-msvc` |
| `windows-aarch64` | `bun-windows-arm64` | `aarch64-pc-windows-msvc` |

An unsupported mapping fails with `TargetUnsupported` before the compiler
spawn, listing that driver Layer's available targets. Do not derive artifact
target from the orchestrator runtime.

## Current state

- `src/bun/BunCli.ts:28-39,92-157` hardcodes Bun 1.3.9 on
  macOS/aarch64, requires an absolute path, and rejects every other observation.
- Its invocation at lines 57-70 forces minification and disables dotenv,
  bunfig, tsconfig, and package config.
- `src/deno/DenoCli.ts:41-105,124-207` similarly hardcodes Deno 2.9.3,
  requires a separate denort, and disables config/lock/network/npm/checking.
- `test/integration/bun-executable.test.ts:36-40` and the Deno equivalent
  silently return when tool variables are absent.
- `test/integration/cross-driver-executable.test.ts:3-12` performs no build.
- `.github/workflows/ci.yml:65-71` invokes those tests without provisioning or
  exporting the tools, so the job is currently false-green.
- `test/host/process-*.smoke.ts` delegates to
  `test/testkit/processContract.ts`, which imports `node:child_process`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| host implementations | `pnpm add -D @effect/platform-bun@4.0.0-beta.106 @effect/platform-deno@4.0.0-beta.106` | exit 0 |
| driver units | `pnpm exec vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts` | all pass |
| real tools | `pnpm run test:integration:real` | real Bun and Deno builds run; absent tools fail |
| required host | `pnpm run test:host:standalone` | Node host program passes |

## Dirty-worktree boundary

This plan may edit `package.json`/`pnpm-lock.yaml` only for the two platform dev
dependencies and temporary new scripts needed to run its tests. Preserve the
known package WIP recorded in Plan 008. Do not touch the dirty docs/examples,
`dprint.json`, or `tsconfig.json`.

The existing workflow/tooling files are clean at the planning baseline and may
be edited only as described below. Do not hand-edit generated
`docs/compatibility.md`; Plan 010 deletes/replaces that managed mechanism.

## Scope

**Create:**

- `src/Bun.ts`
- `src/Deno.ts`
- `src/standalone/internal/ToolDiscovery.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/testkit/standaloneDriverContract.ts`
- `test/integration/standalone-bun.test.ts`
- `test/integration/standalone-deno.test.ts`
- `test/integration/standalone-cross-target.test.ts`
- `test/host/standalone-node.smoke.ts`
- `test/host/standalone-bun.smoke.ts`
- `test/host/standalone-deno.smoke.ts`
- `test/testkit/standaloneHostContract.ts`
- `scripts/provision-tool-assets.mjs` to download, verify, and expose the
  existing pinned fixtures

**Modify:**

- `package.json`, `pnpm-lock.yaml`
- `typetest/standalone-contract.tst.ts`
- `test/fixtures/bun-executable/autoload-trap/**`
- `test/fixtures/deno-executable/no-config-trap/**`
- `tooling/tool-pins.json` only if its current archive layout is disproved;
  keep pins as CI fixtures, never runtime acceptance policy
- `.github/workflows/ci.yml` only for an honest required-real pre-cutover gate
- `plans/README.md` only for Plan 009 status

**Out of scope:**

- old Bun/Deno modules and managed tests;
- root/package exports and public-api manifest;
- README/docs/examples/AGENTS;
- managed compatibility generation or any runtime exact-version pin.

## Git workflow

- Preserve the current branch and dirty WIP.
- Commit driver units separately from real-tool/host CI wiring.
- Suggested messages: `feat: add standalone bun and deno drivers` and
  `test: require real compiler and host matrices`.
- Do not push or open a PR.

## Steps

### Step 1: Implement and test PATH discovery as Layer construction

In `ToolDiscovery.ts`, probe the command name or explicit executable through
`ChildProcessSpawner`, not a shell or `which`. Have the tool report both facts:

- Bun: `process.execPath` and `Bun.version`;
- Deno: `Deno.execPath()` and `Deno.version.deno`.

Resolve the reported path with Effect `FileSystem.realPath`, require it to be an
absolute regular executable, and store only the observed name/version/path.
Map command-not-found to `ToolNotFound`; malformed/nonzero probe to
`ToolProbeFailed`. Accept observed versions rather than rejecting everything
except the CI fixture version.

Layer construction captures `ChildProcessSpawner`, `FileSystem`, `Path`, and
`Crypto`, calls Plan 008's engine factory, and provides the unique Compiler.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts -t 'discover|probe|layer'
```

Expected: fake spawner tests cover PATH success, explicit-path success,
not-found, malformed probe, and observed metadata without exact-version
rejection.

### Step 2: Implement exact typed option and target rendering

Implement the fixed option types and argv shapes above. Drivers return argv
only; core supplies the observed executable and every process option. Never
concatenate a shell command. Keep the original `entrypoint` specifier and
optional `cwd`; pass the staged absolute outfile.

Use `standaloneDriverContract` for both drivers to assert:

- exactly one probe spawn while acquiring the Layer and, measured after Layer
  acquisition, exactly one compile spawn on success;
- no compile spawn for unsupported target or invalid driver options (the
  already-completed Layer probe is counted separately);
- only requested flags appear;
- the final staged output and entrypoint occupy the documented argv positions;
- environment is not replaced;
- nonzero exit returns bounded typed diagnostics;
- a Bun-only field is a compile error under Deno and vice versa.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
```

Expected: all pass; update the existing type-test file with the real Bun/Deno
negative cases but do not expose root imports yet.

### Step 3: Replace false-green real-tool tests with observable behavior

Use the existing pinned Bun 1.3.9, Deno 2.9.3, and Linux denort archives as
known CI fixtures. `provision-tool-assets.mjs` must download/extract to a temp or
CI cache path, verify every authored SHA-256 before execution, and print only
resolved non-secret paths. Do not make those pins part of runtime driver logic.

Create a required runner/script that exits non-zero if either tool is absent;
then run the two current-host integration files (`standalone-bun`,
`standalone-deno`). The `standalone-cross-target` file belongs to the
optional, non-advertised lane described in Step 5. Tests must:

- call the new internal standalone API through Bun/Deno driver services;
- compile and execute the **returned Artifact.path**;
- recompute digest and bytes from the final file;
- assert tool name/version/path are observed;
- verify a missing import becomes `ToolFailed` with diagnostics;
- verify project config is inherited: replace the existing Bun trap with a real
  tsconfig path-alias case and the Deno trap with a real deno.json import-map or
  compile-config case;
- verify a Deno musl request is rejected before spawn;
- verify a Windows target whose requested final outfile lacks `.exe` is still
  published at exactly that requested path (the staged filename absorbs the
  compiler's extension rule);
- on Linux x64, compile and execute current-host `linux-x64-gnu` with both Bun
  and Deno;
- pin Bun's observed minify behavior with a regression test (review §8.1):
  Bun 1.3.9's default `--compile` output is unminified despite its own help
  text ("Implies --production"); compile a probe entrypoint and assert a probe
  identifier survives in the default binary and disappears under
  `minify: true`. Assert on bundle content, never byte comparison — identical
  invocations were observed to produce differing bytes;
- in the optional, non-advertised cross-target lane (gate 3: V1 advertises
  current-host targets only), compile `macos-aarch64` and `windows-x64` with
  both pinned compiler binaries, validate Mach-O/PE headers, and use distinct
  outfiles; do not attempt to execute foreign artifacts;
- never compare bytes with direct CLI unless a separate driver/target
  characterization proves that claim.

The compile command inherits environment and config because the adapter omits
replacement-env and managed disable flags. Do not inspect or record config
files as provenance.

**Verify**:

```sh
pnpm run test:integration:real
```

Expected with provisioned tools: real compiled artifacts run/validate and all
tests pass. Expected without tools: the command exits non-zero with an
actionable provisioning message, never a green skip.

### Step 4: Exercise orchestrator runtime separately from build tool and target

Create one shared host program whose build-call source text is identical:

```ts
Bun.compileExecutable({ entrypoint, outfile })
```

Run it under:

- Node with `NodeServices.layer` — **required**; Node is the advertised V1
  orchestrator host (gate 3);
- Bun with `BunServices.layer` and Deno with `DenoServices.layer` — an
  **optional, non-advertised** lane (`test:host:extra`). Keeping these smokes
  is cheap because the program is identical, but they are not required for
  `DONE` and the docs do not advertise those hosts until each has a required
  CI cell.

Only the outer official host service Layer changes. The `Bun` tool module, its
Layer, operation input, and artifact assertions stay the same. Each executed
host must compile and run the returned executable and verify cleanup. Do not
use `node:child_process` in the contract.

Add the official platform packages as dev dependencies at the same pinned
Effect beta. The library source itself continues to depend only on `effect`.

**Verify**:

```sh
pnpm run test:host:standalone
```

Expected: the required Node host program passes with the shared build call;
the optional lane, when run, passes identically under Bun and Deno.

### Step 5: Make the required real lane explicit and keep deterministic verification separate

The hermetic/offline framing (`unshare`, network-namespace denial) is dropped:
it belonged to the abandoned managed promise, and V1 makes no hermeticity
claim (review §10 on this plan). What remains is ordinary compatibility
testing sized to the advertised support of gate 3: Node host, Bun and Deno
compilers, current-host targets.

Create these non-skipping scripts:

- `test:integration:real` — **required**: runs both current-host cells
  (Bun and Deno compile-and-execute) using the checksum-verified Bun 1.3.9,
  Deno 2.9.3, and denort fixtures. Exits non-zero with an actionable
  provisioning message when a tool is absent; never a green skip.
- `test:integration:cross-target` — **optional, non-advertised**: the four
  foreign-format cells specified in Step 3, with network available for
  compiler-managed target-runtime fetches. Deno/Bun target-runtime downloads
  are CLI behavior in this lane, not effect-build provisioning or runtime
  policy. It must name its exact four cells in test cases and fail if a
  runtime download or header check fails.
- `test:host:standalone` — **required**: the Node host program.
- `test:host:extra` — **optional, non-advertised**: the identical program
  under Bun and Deno host services.

Update CI with one required job:

1. `real-tools` provisions the pinned assets, verifies their authored
   checksums, places the compiler binaries on PATH, sets the fixture
   `DENORT_BIN` outside the library call, and runs `test:integration:real`
   plus `test:host:standalone`.

The optional lanes may run as separate non-required jobs. Anything without a
required CI cell stays out of the docs (advertise-equals-test). Keep
unit/type/build checks available without real compilers. Plan 010 will
simplify final script names after the public cutover.

**Verify**:

```sh
pnpm check
pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
node scripts/read-tooling.mjs
git diff --check
pnpm run test:integration:real
pnpm run test:host:standalone
```

Expected: all deterministic gates pass, tooling parses, and the provisioned
local required real-tool lane and Node host lane pass. Mark this plan `DONE`
only then. The CI workflow must invoke the exact commands above, but no push or
remote-run observation is part of this plan's completion authority.

## Test plan

- Tool discovery/probe and observed metadata.
- Exact typed argv for every selected V1 option.
- Pre-spawn target availability and post-spawn native validation.
- Real Bun and Deno compilation, failure diagnostics, config inheritance, and
  returned Artifact execution.
- Exact Bun and Deno `macos-aarch64` and `windows-x64` foreign-format cells with
  distinct outputs.
- One compiler under Node/Bun/Deno official platform services.
- Required-tool absence is a red gate.

## Done criteria

- [ ] `Bun.layer()` and `Deno.layer()` discover PATH by default and accept an
  explicit executable only through Layer options.
- [ ] Observed versions are recorded but not exact-version rejected at runtime.
- [ ] No unrequested policy/config/env flags are injected.
- [ ] Bun and Deno options remain different and correlated to the driver.
- [ ] Common target mappings are exact; Deno musl rejects before spawn.
- [ ] Real tests compile, return, hash, execute, and inspect effect-build's
  artifact rather than a direct CLI output.
- [ ] The same Bun build call passes under the required official Node
  services; the optional Bun/Deno host lane passes whenever it is run.
- [ ] Required CI cannot pass without executing both real compilers.
- [ ] Runtime source still has no `node:*` imports.
- [ ] Dirty documentation/example WIP remains untouched.
- [ ] Plan 009 reaches `DONE` only after the deterministic gate and the
  provisioned local equivalent of the required real-tool job pass; the next
  push is wired to run the same required CI job.

## STOP conditions

Stop and report if:

- any supported-target distinction cannot be mapped truthfully;
- project config inheritance requires a per-tool common-core special case;
- a driver needs access to publication or raw host services beyond rendering
  and interpreting its command;
- the same compiler call cannot run under one claimed official host Layer;
- required CI cannot provision/checksum its tools without secrets or ambient
  machine state;
- a real compiler embeds the staged outfile in a way that changes runtime
  semantics—characterize and document; do not claim byte identity;
- implementing an option requires a universal union, raw argv, or fallback.

## Maintenance notes

- CI pins are tested fixtures, not runtime provenance or accepted-version policy.
- Deno may download denort in ordinary use; that is Deno CLI behavior. Offline
  callers manage `DENO_DIR`/`DENORT_BIN` outside this operation.
- Add native options only from real user pressure and only to their driver.

# Plan 008: Build the Effect-native compile and atomic publication engine

> **Executor instructions**: Execute this plan only after Plan 007 is `DONE`.
> Write each named lifecycle test before its implementation, observe the
> intended failure, then make it pass. The new engine remains internal and must
> not route through `BuildExecutor` or be exported publicly. Run every gate and
> honor every STOP condition. Update only Plan 008's status row when complete.
>
> **Drift check (run first)**:
>
> ```sh
> test "$(git rev-parse HEAD)" = "15b6abb8c28db73b4e8aeb818755f6ffc3e05530" || git diff --stat 15b6abb8c28db73b4e8aeb818755f6ffc3e05530..HEAD -- src/standalone test/unit/standalone-contract.test.ts typetest/standalone-contract.tst.ts package.json pnpm-lock.yaml
> rg -q '^\| 007 \|.*\| DONE \|$' plans/README.md
> pnpm check
> pnpm exec vitest run test/unit/standalone-contract.test.ts
> pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
> git status --short
> ```

Expected: Plan 007 is complete and its gate is green. The original user-owned
dirty WIP remains present. If `package.json` or `pnpm-lock.yaml` changed for a
reason other than the scoped dependency addition below, reconcile before
continuing.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/007-freeze-standalone-compile-contract.md`
- **Category**: correctness / architecture / tests
- **Planned at**: commit `15b6abb`, 2026-08-09
- **Effect baseline**: `effect@4.0.0-beta.106`

## Why this matters

The present process wrapper is an ordinary Promise around Node spawning. Fiber
interruption cannot cancel it, and the existing “interruption” test only checks
a timeout. The new product's value depends on the opposite behavior: a scoped
Effect owns the child and staging path, failure or interruption preserves the
previous destination, and success atomically publishes one validated, hashed
executable.

This plan implements that lifecycle once through Effect's platform-neutral
services. It does not implement Bun/Deno flags or discovery; Plan 009 supplies
driver adapters.

## Current state

- `src/internal/ProcessExecutor.ts:26-89` calls `node:child_process.spawn` inside
  a Promise. `Effect.promise` at lines 91-93 has no interruption canceler.
- `test/unit/interruption.test.ts:5-17` tests `timeoutMillis`, not a forked and
  interrupted Effect fiber or orphan cleanup.
- `src/ExecutionPlatform.ts:2-4` and most I/O modules import Node APIs; its Layer
  records identity but supplies no filesystem/process implementation.
- `src/internal/DurableFileCommit.ts:22-47` is intentionally atomic
  **no-replace** content-store publication through `link`; it is not the
  destination replace primitive this product needs.
- `src/BuildExecutor.ts:250-269` has a timestamp temp path and rename, but no
  scoped cleanup and no typed locked-output behavior.
- `test/integration/publication-host.test.ts:4-8` only reads a fixture.

The Effect implementation already supplies the required ownership semantics:

- `ChildProcess.Command` requires `ChildProcessSpawner | Scope` at
  `.agent-sources/effect/packages/effect/src/unstable/process/ChildProcess.ts:42-47`.
- Node acquires/releases and escalates TERM to KILL at
  `.agent-sources/effect/packages/platform-node-shared/src/NodeChildProcessSpawner.ts:473-505`.
- Deno has the equivalent scoped release at
  `.agent-sources/effect/packages/platform-deno/src/DenoChildProcessSpawner.ts:269-288`.
- `FileSystem.makeTempDirectoryScoped` cleans its directory with Scope, and
  `FileSystem.rename` supplies the host rename operation at
  `.agent-sources/effect/packages/effect/src/FileSystem.ts:176-214,285-290`.

Use those services; do not recreate their lifecycle with raw host APIs.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| add Node test implementation | `pnpm add -D @effect/platform-node@4.0.0-beta.106` | lockfile updated, exit 0 |
| typecheck | `pnpm check` | exit 0 |
| lifecycle tests | `pnpm exec vitest run test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts` | all pass |
| contract | `pnpm exec vitest run test/unit/standalone-contract.test.ts` | all pass |

## Dirty-worktree boundary

`package.json` and `pnpm-lock.yaml` are in scope only for the exact
`@effect/platform-node@4.0.0-beta.106` dev dependency. At planning time
`package.json` already has user WIP with SHA-256
`c11b442ee7aa5f0b1365272ef3159853d142e3d5c4e6366f67a77eba4d87afd0`.
Verify that checksum before the dependency edit. Preserve every existing script,
example inclusion, and unrelated field byte-for-byte around the dependency
change. A checksum mismatch is a STOP condition unless the operator confirms
the new WIP.

All documentation/example WIP listed in Plan 007 remains out of scope.

## Scope

**Create:**

- `src/standalone/internal/CompilerAdapter.ts`
- `src/standalone/internal/Process.ts`
- `src/standalone/internal/AtomicOutput.ts`
- `src/standalone/internal/NativeExecutable.ts`
- `src/standalone/internal/CompilerEngine.ts`
- `test/unit/standalone-process.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/fixtures/process/interruptible-compiler.mjs`
- `test/fixtures/publication/fake-executable.ts` or the smallest equivalent
  fixture required by the adapter tests

**Modify:**

- `src/standalone/BuildError.ts` only if the fixed Plan 007 errors need their
  internal constructors wired; do not add tags without reconciliation
- `package.json` and `pnpm-lock.yaml` only for the pinned Node platform dev
  dependency
- `plans/README.md` only for Plan 008 status

**Out of scope:**

- existing managed `src/` and tests;
- Bun and Deno modules, target mappings, discovery, or option rendering;
- root/package exports, docs, examples, CI, or scripts;
- fsync/crash durability, content addressing, records, caches, retries, locks,
  or input snapshots.

## Git workflow

- Preserve the branch and pre-existing WIP.
- Keep the dependency/lockfile edit isolated from implementation changes.
- Suggested commits: `test: specify standalone lifecycle`, then
  `feat: add effect-native compile engine`.
- Do not push or open a PR.

## Steps

### Step 1: Define the private driver/core boundary

Create `CompilerAdapter<Options>` with only tool-specific decisions:

- `toolName`;
- `supportedTargets`;
- `renderArgv({ input, stagedOutfile })`, returning only an inert readonly argv
  array; core supplies the observed executable, cwd, environment policy, shell
  policy, and kill timeout;
- `interpretFailure(completion)`, returning `ToolFailed` diagnostics when the
  exit is non-zero.

The adapter does not receive `FileSystem`, `Path`, `Crypto`, publication, or
Scope. It does not publish output. `CompilerEngine` owns all shared lifecycle
steps. There is no serializable descriptor or pre-enumerated variant algebra.

Define a private observed tool value `{ name, version, path }` that will be
provided by Plan 009's Layer construction.

**Verify**:

```sh
pnpm check
```

Expected: new private interfaces compile and no root API changes.

### Step 2: Implement bounded concurrent process completion through Effect

In `src/standalone/internal/Process.ts`:

1. accept only executable, argv, and optional cwd;
2. construct `ChildProcess.Command` centrally with `shell: false`, no `env`,
   and `forceKillAfter: "2 seconds"`, then spawn it inside `Effect.scoped`
   through `ChildProcessSpawner`. Note the escalation bound is a deliberate
   library-owned policy, not an Effect default: in the pinned source,
   `KillOptions.forceKillAfter` defaults to `undefined`, meaning no timeout is
   enforced unless chosen;
3. drain stdout and stderr concurrently with the exit effect so neither pipe
   can deadlock;
4. retain at most 1 MiB per channel while continuing to drain excess bytes;
5. return exit code and two `{ text, truncated }` channels;
6. never catch interruption into `BuildError`.

Do not set the command's `env` field. In the pinned Effect API, providing `env`
replaces the inherited environment (`ChildProcess.ts:380-405`); omitting it is
the CLI-compatible neutral default. Apply `cwd` only when the input supplies it.

Write a test that launches `interruptible-compiler.mjs`, waits for a PID/sentinel
file, interrupts the forked fiber, and polls until the child is gone. Assert the
Effect exit is interruption, not failure. Test output over the cap to prove the
stream is drained and marked truncated rather than deadlocking.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-process.test.ts
```

Expected: normal exit, non-zero exit capture, bounded/truncated output, and real
fiber interruption all pass; no child remains.

### Step 3: Implement sibling staging and atomic replace

In `AtomicOutput.ts`, use only `FileSystem` and `Path`:

1. normalize `cwd` when present and resolve `outfile` to an absolute path;
2. create the destination parent recursively;
3. acquire a unique scoped temp directory inside that parent with prefix
   `.effect-build-`;
4. give the compiler a staged filename that preserves the final destination
   basename inside that directory. Deno derives the compiled executable's
   runtime storage identity from the compiler-visible output name (verified by
   operator experiment; see FIRST-PRINCIPLES-REVIEW.md §8.3), so a fixed
   synthetic staged name is observable behavior, not an implementation detail.
   Append `.exe` only when the requested target is Windows and the basename
   lacks it, so Bun/Deno cannot silently write a second path when
   cross-compiling Windows, while the final rename still honors the caller's
   exact `outfile`;
5. on commit, rename the completed staged file onto the destination;
6. let Scope remove the staging directory on success, failure, or interruption.

The destination promise is: at every observable instant it names either the
previous complete file or the new complete file. Never fall back to truncating,
copying over, unlink-then-rename, or a temp path on another filesystem.

Map a confirmed Windows/executing-file lock to `OutputLocked`. Map other rename
or filesystem publication failures to `PublicationFailed` with operation and
path. Do not retry in V1.

Test:

- success with no prior output;
- success replacing old bytes;
- tool failure preserves old bytes, inode metadata where the host exposes it,
  and leaves no `.effect-build-*` residue;
- missing staged output;
- interruption preserves output and removes staging;
- nested `outfile` parent creation;
- the staged filename equals the destination basename for non-Windows targets;
- Windows-target output when the requested final outfile has no `.exe`
  extension;
- concurrent temp-name uniqueness;
- a locked destination on Windows, gated to that host, yields `OutputLocked`.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-publication.test.ts -t 'atomic|interrupt|locked|missing'
```

Expected: all host-applicable assertions pass and no residue remains in test
directories.

### Step 4: Validate, hash, publish, and return one Artifact

In `NativeExecutable.ts`, adapt the reusable ELF/Mach-O/PE recognition from
`src/internal/NativeExecutableFormat.ts:86-188` without importing that managed
module. Keep strict bounds. Validation needs only bounded header reads; hash
the full file only when the caller requested a digest (gate 2: `digest` is
opt-in, and it is the only Artifact field costing a separate full read).

**ABI validation policy** (review §8.2): always validate format→OS and
machine→arch from the native header. Treat ABI as evidence that may be
`unknown` — a static or unrecognized interpreter will eventually be observed
even though Bun 1.3.9 musl outputs currently classify correctly. When the
caller supplied `target`, require OS/arch agreement, compare ABI only when it
was observed, and report the requested target in `Artifact.target`. When
`target` was omitted, derive it from the observation; if the header cannot
classify a Linux ABI, fall back to the adapter's declared default target for
the invocation (the host target when no target flag was rendered), and only if
neither source yields an ABI fail with `OutputInvalid` and reason
`abi-unrecognized`. Never guess between gnu and musl.

In `CompilerEngine.ts`, construct a compiler service by capturing
`ChildProcessSpawner`, `FileSystem`, `Path`, and `Crypto` at Layer construction.
The returned service method has `R = never` and performs this exact sequence:

```text
validate requested target against adapter list (before spawn)
-> acquire sibling staging (staged name preserves the destination basename)
-> render and run exactly one compile command
-> nonzero exit => ToolFailed
-> require staged regular file => OutputMissing/OutputInvalid
-> read header bytes; inspect ELF/Mach-O/PE
-> requested target, when present, must match observed OS/arch; ABI compared
   only when observed (policy above)
-> SHA-256 the staged bytes only when input.digest was true
-> atomic rename commit
-> return Artifact for the final absolute path
```

When `target` is omitted, populate `Artifact.target` from the native output
observation. When it is supplied, return the requested target only after the
native observation agrees. Validate executable mode on POSIX where the Effect
filesystem info exposes it; do not invent POSIX mode semantics on Windows.

Convert Effect `PlatformError`s only at the boundary that knows the operation.
Keep interruptions, defects, and programmer bugs distinct from expected
`BuildError`s.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts
pnpm check
```

Expected: all pass; the happy path returns absolute path, exact byte count,
matching digest when requested, observed target, and supplied observed tool.

### Step 5: Run the complete internal gate

```sh
pnpm check
pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-process.test.ts test/unit/standalone-publication.test.ts
pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
rg -n 'from "node:|Effect\.runPromise|BuildExecutor|ContentStore|ResolvedBuild' src/standalone
git status --short
```

Expected: verification passes; the `rg` command returns no matches; status
contains only this plan's scoped changes plus the preserved WIP.

## Test plan

- Real Node-platform subprocess lifecycle, not a Promise fake.
- Real fiber interruption and orphan check.
- Concurrent bounded stdout/stderr drain.
- Atomic output state table across success, failure, interruption, missing
  output, and host lock.
- Native-format and target mismatch tests for ELF, Mach-O, and PE fixtures,
  including the unknown-ABI fallback policy.
- Digest recomputation against published bytes when requested, and digest
  absence (with no extra full read) when not requested.
- One compile-spawn assertion measured after the compiler service is acquired,
  and a zero-compile-spawn unsupported-target assertion; driver probing belongs
  to Plan 009 and is counted separately.

## Done criteria

- [ ] All standalone I/O uses `ChildProcessSpawner`, `FileSystem`, `Path`, and
  `Crypto`; no raw Node imports exist under `src/standalone`.
- [ ] Compiler interruption kills/reaps the child and cleans staging.
- [ ] Interruption remains interruption.
- [ ] Failure/interruption never changes an existing outfile.
- [ ] Success publishes by same-filesystem rename and returns one final Artifact.
- [ ] The target is rejected before spawn or validated from output after spawn.
- [ ] Diagnostics are bounded without stopping pipe drainage.
- [ ] No managed planner/store/record module is called.
- [ ] Focused tests, typecheck, and TSTyche pass.
- [ ] Pre-existing dirty WIP is preserved.
- [ ] Plan 008 is `DONE` in the index.

## STOP conditions

Stop and report if:

- official Effect process Scope does not kill and reap the tested compiler
  process on a claimed host;
- stdout/stderr cannot be drained concurrently without bypassing Effect;
- atomic replace of an existing destination is unavailable on a host—surface
  unsupported/locked behavior rather than weakening the promise;
- native target distinctions cannot round-trip through Plan 007's Target;
- staging changes compiler semantics in a way that invalidates the operation;
- any solution requires `Effect.runPromise`, raw `node:*` imports, store
  materialization, or catching interruption as a BuildError;
- the existing package WIP checksum changed unexpectedly.

## Maintenance notes

- Atomicity is the neutral tier's guarantee; crash-durable fsync is not.
- Same-outfile concurrent builds are last successful rename wins. Returned
  metadata describes the bytes this call published at its commit instant.
- Do not claim byte identity with direct CLI invocation: the staged outfile can
  be observable to a compiler. Plans 009/010 document the divergence instead.

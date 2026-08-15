# Plan 028: Canonicalize tool identity and host publication semantics

> Behavior-preserving internal refactor plus one Windows cross-target bug fix.
> Do not add a public host, toolchain, or platform abstraction.

## Status

- Priority: P0
- Effort: M
- Risk: MEDIUM
- Depends on: 027
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Evidence and desired invariant

Current `ToolDiscovery.ts::DiscoveredCompiler` and
`CompilerAdapter.ts::DiscoveredCompiler` duplicate:

```ts
readonly artifactTool: { readonly name: Name; readonly version: string; readonly path: string }
readonly hostOs: OperatingSystem
```

`CompilerEngine.ts::compilePreparedCell` uses `hostOs` only to choose the
untargeted `.exe` suffix, while
`ExecutableLifecycle.ts::validateAndPublishExecutable` gates execute-bit
validation on the *target* suffix. Host filesystem semantics and output target
are different axes.

After this plan:

- selected tool identity is exactly canonical `{name, version, path}`;
- Windows host behavior derives from Effect `Path.sep === "\\"`;
- a cross-target Windows host never uses target suffix as a mode-bit proxy;
- explicit executable selection must probe back to the same canonical path;
- PATH discovery remains shim-transparent, canonical, and Effect-native.

## Scope

Production:

- `packages/effect-build/src/standalone/internal/ToolDiscovery.ts`
- `packages/effect-build/src/standalone/internal/CompilerAdapter.ts`
- `packages/effect-build/src/standalone/internal/CompilerEngine.ts`
- `packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts`
- Bun/Deno adapter probe definitions

Tests/docs:

- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-matrix.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `docs/architecture.md`, `docs/drivers.md`
- this plan and `plans/README.md`

No manifest, public declaration, or package split change.

## Steps

1. Characterize before editing:

   - explicit absolute path whose probe reports itself;
   - explicit absolute path whose probe reports a different realpath;
   - PATH command resolving through a shim to an absolute real executable;
   - untargeted output naming under injected POSIX and Windows `Path` Layers;
   - Windows-host/Linux-target and POSIX-host/Windows-target mode validation.

   Use deterministic fake `Path`/FileSystem/child services; no `process.platform`
   branch in production.

2. Remove `hostOs` from probe JSON, discovery result, adapter contract, and all
   fixtures. Parse only nonempty absolute `path` and `version`; canonicalize and
   stat the reported path as today.

3. For explicit selection, canonicalize the requested path and require equality
   with the probe-reported canonical path. Mismatch is `ToolProbeFailed`, before
   a service is produced. For implicit PATH selection, accept a shim-reported
   canonical executable identity.

4. Replace both host decisions with one `Path.sep` fact captured by the service:
   untargeted `.exe` naming uses Windows host syntax; execute-bit validation is
   skipped only on a Windows host, independent of requested/observed target.
   Do not store `hostOs` under a new name.

5. If implicit command spawning is not reliably PATH-resolved by the Effect
   platform, implement a package-private absolute PATH walker using Effect
   `Config.string("PATH")`, `Path`, and `FileSystem`. Use `;` only when
   `Path.sep === "\\"`, otherwise `:`. Ignore empty/nonabsolute entries, accept
   only regular executable files, and preserve typed not-found/probe errors.
   STOP rather than import `node:*`.

6. Run:

   ```sh
   bun run build
   bun x vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-matrix.test.ts test/unit/standalone-publication.test.ts
   bun run test:types
   bun run test:architecture
   bun run verify
   bun run verify:effect
   git diff --check
   ```

   Expected: all pass; public declaration allowlists are unchanged; `rg -n
   'hostOs' packages test typetest` has no result.

## STOP conditions

- Effect services cannot resolve PATH without raw host APIs;
- explicit-path equality rejects documented Bun/Deno behavior;
- any public type needs a host OS field;
- a platform test cannot distinguish host filesystem from target suffix.

## Maintenance / compression ledger

Removes provider probe OS, its duplicate interface, and target-as-host branches.
Adds no new public state; `Path` remains the sole host-filesystem authority.

## Receipt

- **Implementation source SHA**:
  `1a803ca760e2b943ef33d93131c10ea1ca271f0b`.
- Tool discovery now selects only absolute candidates from `PATH`, ignores
  empty/relative entries, accepts only regular executables, uses `;` plus the
  bounded names `bun`/`bun.exe` or `deno`/`deno.exe` under an injected Windows
  `Path`, and accepts a shim-reported canonical executable identity. It adds no
  `.cmd`/`.bat`, shell, current-directory, or raw-host fallback.
- Explicit executable selection canonicalizes both the requested and reported
  paths and rejects a mismatch as `ToolProbeFailed`. The probe payload and
  stored compiler identity contain only canonical `{name, version, path}`.
- Host filename and mode policy now derives at use time from the official
  Effect `Path` service. Windows-host/Linux-target and
  POSIX-host/Windows-target tests prove that target suffix is no longer used as
  a host-mode proxy.
- Installed Effect `4.0.0-rc.108` source and a live regression demonstrated
  that `Effect.option`/`Effect.mapError` would lose sibling interruption from a
  mixed cause. Discovery instead maps owned typed failures with `Cause.map`
  and `Effect.failCause`; the focused Fail+Interrupt test retains both the
  mapped `ToolProbeFailed` and interruptor.
- **Scope reconciliation**: `packages/effect-build/src/Integration.ts` is the
  required call site for passing the captured `Path` authority into lifecycle
  validation. `test/testkit/standaloneDriverContract.ts` and the driver,
  matrix, and publication fixtures are the bounded shared evidence needed to
  remove `hostOs`, characterize PATH selection, and keep POSIX candidates
  executable. No manifest, declaration, export, or package topology changed.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). `bun run build` passed;
  the focused four-file run passed 81 tests with one intentional skip;
  `bun run test:types` passed five files; and `bun run test:architecture`
  passed six files and 41 tests.
- `bun run verify` passed 182 unit tests with one intentional skip, 14/14
  once-packed consumers, all architecture checks, lint, and formatting.
  `bun run verify:effect` passed both `4.0.0-beta.104` and
  `4.0.0-rc.108`, each with 182 unit tests, one intentional skip, and 14/14
  packed consumers.
- **Exact-SHA CI**: run
  [`31860069613`](https://github.com/mannyc2/effect-build/actions/runs/31860069613)
  completed `success` at receipt head
  `36dfce39abd96bafaaee59b0646ccdb0ba0af418`. All twelve jobs succeeded:
  `bun-bundle` (`94951763631`), `esbuild` (`94951763651`), `real-tools`
  (`94951763661`), `target-support (deno)` (`94951763664`), Effect beta
  (`94951763680`), `node-sea` (`94951763682`), `target-support (bun)`
  (`94951763696`), macOS publication (`94951763697`), Ubuntu publication
  (`94951763711`), `quality` (`94951763713`), Effect RC (`94951763723`),
  and Windows publication (`94951763733`).
- `git diff --check` passed, `rg -n 'hostOs' packages test typetest` returned
  no result, and the implementation worktree was clean immediately after the
  source commit. This receipt and README status are plan-only evidence.

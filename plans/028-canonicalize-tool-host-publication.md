# Plan 028: Canonicalize tool identity and host publication semantics

> Behavior-preserving internal refactor plus one Windows cross-target bug fix.
> Do not add a public host, toolchain, or platform abstraction.

## Status

- Priority: P0
- Effort: M
- Risk: MEDIUM
- Depends on: 027
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

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

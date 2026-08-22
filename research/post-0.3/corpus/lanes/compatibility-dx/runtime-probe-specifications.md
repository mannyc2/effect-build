# Runtime probe specifications

## Common probe contract

All probes are bounded, operation-specific, non-installing, and non-destination-mutating.

```text
ProbeSpec {
  id, revision, provider, operation, lane
  executableBinding
  argv / inProcessCall
  environmentAllowlist
  cwd: empty private directory or explicit project read-only context
  timeoutMs
  maxStdoutBytes
  maxStderrBytes
  network: forbidden | not-needed | externally-sandboxed
  filesystem: read-only except declared private probe temp
  expectedMachineShape
  capabilityIdsProduced
  cleanup
}
```

Default identity timeout: 2 seconds. Help/shape timeout: 3 seconds. In-memory semantic smoke timeout: 10 seconds. Output cap: 16 KiB per stream unless the provider needs a smaller strict limit. Kill the process group on timeout. No blind retry; a second attempt is a separately configured diagnostic probe and does not convert failure to success.

Before and after every executable probe, stat and hash the executable. Final recheck occurs immediately before provider work.

## Bun

### `bun.identity@1`

- Execute selected absolute path with `--version`, then `--revision`.
- Parse strict version when possible; retain full revision and digest.
- Verify reported executable from a bounded script only when needed; do not accept a different path.
- Capabilities produced: `identity.version`, `identity.revision`.

### `bun.build-command-help@1`

- `bun build --help` with fixed locale/no color.
- Detect exact flags required by the operation (`--compile`, target, output, watch, metafile, bytecode, etc.).
- Help presence is a syntactic capability only; semantic compatibility still depends on policy/receipts.

### `bun.host-api-shape@1`

- Run the selected Bun executable against an inline/local probe that serializes only `Bun.version`, `process.execPath`, `typeof Bun.build`, and required option-shape feature tests.
- No user source and no build output.
- `Bun.build` in-memory semantic smoke may use virtual files and no destination; record that a provider process/runtime was invoked as probe work.

## Deno

### `deno.identity@1`

- `deno --version` plus a no-config/no-prompt local eval returning `Deno.execPath()`, `Deno.version`, target triple if exposed, and channel/source fields if exposed.
- Because upstream documents same-string stable/LTS builds, failure to observe channel leaves identity insufficient unless acquisition provenance/digest binds the channel.

### `deno.compile-help@1`

- `deno help compile` under `--no-config` semantics where supported.
- Detect requested target, permissions, `--cached-only`, `--no-remote`, node-modules mode, `--bundle`, and other required flags.

### `deno.denort-asset@1`

- Resolve explicit `DENORT_BIN`, sibling `denort`, or documented cache candidate without network.
- Hash and identify target/version if possible.
- If matching asset cannot be established in offline mode: `EFFECT_BUILD_OFFLINE_ASSET_UNAVAILABLE`.
- Never invoke compile merely to trigger download.

### `deno.bundle-command-help@1`

- `deno help bundle`; mark upstream experimental.
- Detect output/outdir/platform/watch/declaration requirements for the selected operation.

### `deno.bundle-host-api@1`

- Selected Deno runs no-config/no-prompt local eval with `--unstable-bundle`, serializing `typeof Deno.bundle` and optionally a `write:false` virtual/minimal local fixture.
- Any esbuild backend acquisition makes the semantic smoke unsuitable for strict offline preflight unless fully cached and externally sandboxed. In that case use shape-only preflight and retain semantic compatibility as exact CI evidence.

## esbuild

### `esbuild.identity@1`

- Import exact resolved package and read `esbuild.version`.
- Record package version/integrity and platform package.
- If a native executable path is available, run `--version`, hash it, and require coherence.

### `esbuild.one-shot-shape@1`

- Verify `typeof build` and required option fields using package declarations/runtime shape.
- A bounded `stdin`/virtual input with `write:false` may establish semantic one-shot behavior without destination mutation.

### `esbuild.context-lifecycle@1`

- Create a context over virtual/in-memory or private probe input with `write:false`.
- Exercise `rebuild`, `cancel` when meaningful, and `dispose` under timeout.
- Record native service process start as probe work.
- CLI capability cannot satisfy this probe because upstream documents no CLI rebuild API.

## Node SEA

### `node.identity@1`

- `node --version` and local JSON of `process.execPath`, `process.platform`, `process.arch`, `process.versions.modules`, and `process.versions.napi`.
- Hash the binary; classify libc where required.

### `node.build-sea-help@1`

- `node --help`; detect exact `--build-sea` flag.
- No SEA output is generated during preflight.

### `node.sea-relation@1`

- Observe builder and base independently.
- Require normalized version equality.
- Require host/target and snapshot/code-cache predicates.
- Optionally require official distribution/source/digest family according to policy.

## Package, Effect, and protocol probes

- Package graph: parse lockfile/package-manager graph and actual resolved manifests; no install during normal build.
- Effect declarations: release CI only, because compilation is not a cheap per-build probe. Runtime can inspect resolved identities and duplicate instances.
- Protocol: pure identity/schema/invariant negotiation; no provider work.

## Probe result semantics

```text
present       = bounded probe positively establishes required shape
absent        = bounded probe positively establishes missing shape
indeterminate = timeout, crash, malformed output, unavailable channel identity,
                or semantics requiring unexecuted work
```

`indeterminate` never becomes `present` through an override. Only a complete set of `present` capabilities can reach unknown-but-capable.

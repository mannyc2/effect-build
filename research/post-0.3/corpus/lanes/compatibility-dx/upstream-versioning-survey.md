# Upstream versioning and compatibility survey

## Method

This survey asks three separate questions for every provider:

1. **Identity grammar:** what must be observed to identify the selected implementation?
2. **Upstream promise:** what compatibility or stability does upstream actually declare?
3. **Operation asymmetry:** which APIs, commands, flags, lifecycle handles, assets, or relations differ?

An npm-looking version is not automatically a sufficient tool identity. Version ordering, channel identity, source revision, target runtime, embedded engine, and binary bytes can be independent coordinates.

## Canonical version-identity sum type — PROPOSAL

```text
VersionIdentity =
  | SemVerIdentity {
      raw, normalized, major, minor, patch,
      prerelease[], buildMetadata[]
    }
  | BunIdentity {
      rawVersion, semanticVersion?, revision,
      channel: stable | canary | unknown,
      binarySha256
    }
  | DenoIdentity {
      rawVersion, semanticVersion?, channel,
      releaseKind, targetTriple, v8Version, typescriptVersion,
      sourceCommit?, binarySha256
    }
  | EsbuildIdentity {
      packageVersion, apiVersion, nativeBinaryVersion?,
      packageIntegrity?, nativeBinarySha256?, platformPackage?
    }
  | NodeIdentity {
      semanticVersion, releaseChannel?, commit?,
      modulesAbi, nodeApiVersions, platform, arch, libc,
      binarySha256
    }
  | OpaqueIdentity {
      raw, providerGrammarRevision, binarySha256
    }
```

`OpaqueIdentity` prevents an unparseable version from being silently coerced into SemVer. It is eligible only for exact-identity rules or an unknown-but-capable override; it is not range-orderable.

## SemVer and npm ranges

**UPSTREAM-DIRECT [S26, S27, S29].** SemVer prerelease identifiers participate in ordering; build metadata does not. Major version zero carries no general stability promise. npm ranges are sets of comparator sets joined with `||`, so they can be non-contiguous. npm excludes prereleases from ordinary range matching unless the relevant prerelease tuple is explicitly opted into or `includePrerelease` behavior is selected.

**FALSIFIED:** a parser that strips prerelease/build suffixes and compares only `major.minor.patch` cannot safely implement Effect prerelease peers, provider canaries, holes, or exact release-candidate endpoints.

## Bun

### Identity grammar

**UPSTREAM-DIRECT [S30].** Bun is a single executable and documents both `bun --version` and `bun --revision`. Stable releases have a version plus revision. Canary builds are automatically published for every commit to `main`, are explicitly described as untested, and may upload crash reports. A version string alone is therefore weaker than revision plus binary digest.

**PROPOSAL:** treat `{version, revision, channel, sha256}` as identity. For stable SemVer policy, use the semantic version for ordering but retain revision and digest as exact observation. For canary, use revision/digest identity; do not infer ordering from a canary-looking version unless Bun documents a grammar suitable for ordering.

### Operation asymmetry

**UPSTREAM-DIRECT [S31, S32].** `bun build` and `Bun.build()` overlap, but are not identical. In-memory `files` is JavaScript-API-only. Compilation is exposed in both CLI and API. Watch is a provider-owned long-running command/API behavior, not proof of a machine-readable portable event protocol. Standalone targets encode OS, architecture, libc, and baseline/modern CPU expectations.

**RECORDED-EXECUTION [S22, S23].** Exact command build capabilities were exercised at `1.3.9` and `1.3.14`; host API shape was exercised at those points. This is two exact points, not `>=1.3.9 <=1.3.14`.

### Policy implications

- Key by `provider=bun`, operation, lane (`host-api` or `selected-command`), target, and host.
- Stable range policy may be possible only after dense execution; canaries should begin as exact revision/digest identities.
- Expose prerelease/canary warnings separately from compatibility result.
- Never substitute the host Bun process for an explicitly selected Bun executable.

## Deno

### Identity grammar

**UPSTREAM-DIRECT [S33].** Deno has `stable`, `lts`, `rc`, and `canary` channels; alpha/beta channels appear during major prerelease cycles. The channel is baked into the binary. Deno explicitly documents that stable and LTS can be byte-different builds with the same version string, including `2.9.3`. A bare version number selects stable, not LTS.

**PROPOSAL:** identity must include `{channel, version, release kind, target triple, source commit if available, binary digest}`. A bare `2.9.3` is incomplete when policy distinguishes stable and LTS.

### API, command, experimental, permissions, and acquisition

**UPSTREAM-DIRECT [S34, S35, S36].** `deno bundle` and `Deno.bundle()` are experimental; the runtime API was added in Deno `2.5` and requires `--unstable-bundle`. The command uses esbuild under the hood. `deno compile` embeds permissions selected at compilation. Its first compile for a Deno-version/target pair downloads matching `denort` into `DENO_DIR`; subsequent compiles can work offline. `DENORT_BIN` or a sibling `denort` can supply the runtime. `--cached-only`, `--no-remote`, and node-modules modes change dependency acquisition and mutation behavior.

**RECORDED-EXECUTION [S22, S23].** Exact Deno `2.9.3` and `2.9.5` command/API bundle points passed bounded research fixtures. The receipt also observed `deno bundle` downloading an esbuild platform package, and a compiled Deno program where `Deno.bundle` was absent. These facts prove command/runtime asymmetry and an acquisition risk; they do not define a range.

### Policy implications

- Channel identity is mandatory.
- Experimental operation policy is independent from stable core-runtime version policy.
- Offline preflight must inspect both dependency caches and matching `denort`; no hidden download retry.
- Permission requirements are operation inputs, not a version-compatibility success signal.
- “Deno supports bundling” is too broad: distinguish selected command, host API, and compiled-runtime API.

## esbuild

### Identity grammar

**UPSTREAM-DIRECT [S38].** esbuild recommends an exact npm installation. It is a `0.x` project; SemVer itself says `0.y.z` may change at any time. The JavaScript package starts/communicates with a platform-native executable, so package version, API-reported version, platform package, and native binary digest are relevant.

**GITHUB-DIRECT [S07, S20].** The live provider package depends exactly on esbuild `0.28.2`, and the service rejects any API version other than `0.28.2`.

### API/CLI asymmetry and lifecycle

**UPSTREAM-DIRECT [S37].** CLI, JS, and Go concepts overlap, but the CLI explicitly has no rebuild API. JavaScript/Go contexts provide `rebuild`, `watch`, `cancel`, and `dispose`. Thus `build` capability does not prove context lifecycle compatibility.

**UPSTREAM-DIRECT [S39].** Advisory GHSA-g7r4-m6w7-qqqr records a Windows development-server traversal issue for `>=0.27.3 <0.28.1`, fixed in `0.28.1`. This is a real example of an operation-and-host-specific known-bad hole. It does not make `build` on non-Windows hosts incompatible, and `effect-build` does not currently expose `serve` in the inspected public provider.

**RECORDED-EXECUTION [S22, S23].** `build`, `context`, `cancel`, and `dispose` were exercised at exact `0.28.1` and `0.28.2` points. No range is inferred.

### Policy implications

- Package/API/native-binary skew is its own relation.
- Context lifecycle and one-shot build need separate operation policies.
- Security holes carry host and operation predicates.
- Exact pinning is a valid initial implementation choice but not a complete compatibility state model.

## Node SEA

### Identity and relation grammar

**UPSTREAM-DIRECT [S41].** Built-in `--build-sea` was added in Node `25.5.0`; SEA remains Stability `1.1` (active development). The Node binary used to produce the SEA blob must have the same version as the binary receiving it. Cross-platform builds must disable code cache and snapshots because those are platform-specific.

**GITHUB-DIRECT [S21].** The live provider accepts exact Node `26.7.0`, exact `linux-x64-gnu`, and probes `--build-sea`.

**RECORDED-EXECUTION [S22, S23].** Same-version `25.5.0` and `26.7.0` builder/base fixtures built and ran. A `26.7.0` builder with a `25.5.0` base produced an output that failed execution. The supported relation is not “both versions individually supported”; it is at least `builder.version == base.version`, with target/snapshot/cache predicates layered on top.

### Policy implications

- Relational predicates are first-class and non-overrideable through an unknown-version flag.
- Base binary selection must be explicit and observed independently from the builder.
- Equality should compare normalized Node version and, for strongest assurance, release bytes/source identity where the workflow assumes an official matching build.

## Effect

**GITHUB-DIRECT [S03-S08, S13].** Every inspected package declares Effect peer `>=4.0.0-beta.104 <4.1.0-0`. Workspace development uses exact `4.0.0-rc.108`. CI explicitly checks exact `4.0.0-beta.104` and `4.0.0-rc.108`; the verifier installs a fresh packed consumer and preserves the authored peer range.

**UPSTREAM-DIRECT [S42, S43].** Both endpoints are prereleases. The releases contain declaration-affecting and runtime fixes, so “peer range accepts it” and “exact declarations/runtime were exercised” are distinct facts.

**PROPOSAL:** observe Effect in three ways: package graph, declaration endpoint used for compilation, and runtime identity actually loaded. A mixed graph can satisfy one package's range while still creating duplicate runtime identities or declaration/runtime skew.

## Comparative systems

Comparative systems inform UX; they do not establish provider behavior.

### Playwright

**UPSTREAM-DIRECT [S44].** Each Playwright version requires specific browser binaries. Installation is explicit, versions are coupled, multiple installations/cache locations are visible, and hermetic browser placement is supported. Lesson: separate package identity, selected executable artifact, explicit acquisition, and cache observability.

### Prisma engines

**UPSTREAM-DIRECT [S45, S46].** `prisma version --json` exposes CLI/client/platform/engine hashes and paths. Legacy engine architectures allow custom engine paths and distinguish package code from native engines. Lesson: structured identity should report the actual engine, not only the npm package.

### Volta

**UPSTREAM-DIRECT [S47, S48].** Volta pins project tool versions, routes shims contextually, supports multiple installed versions, and provides `volta which` to reveal the actual binary. Lesson: executable selection provenance and an “unwrap the shim” operation are developer-facing compatibility features.

### Native bindings / Node-API

**UPSTREAM-DIRECT [S49, S50].** Node-API has independently versioned capability/ABI levels; `process.versions.modules` and `process.versions.napi` are separate from the Node version. Lesson: package version and protocol/ABI identity must not be collapsed.

## Survey conclusion

**INFERENCE:** no single ordering relation covers all selected tools. SemVer range evaluation is one matcher inside a provider-specific identity system, not the canonical identity model. The minimum truthful model requires exact identities, operation/lane/host keys, holes and predicates, bounded capabilities, and relational constraints.

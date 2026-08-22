# Completion and release architecture audit

> Read-only planning record. Source baseline:
> `e8c1557509a9236df8e5eb236293527c3f4fd21d` on
> `codex/granular-integration-program`, audited 2026-08-14. Repository source
> was not changed while producing this program.

## Verifiable success criteria

This program is complete only when all of the following are true:

1. The five-package public graph remains a star: Bun, Deno, Esbuild, and Node
   SEA depend one way on `effect-build`; no integration depends on another.
2. Existing Bun/Deno scalar and matrix call shapes and successful behavior are
   preserved. The only intentional request-behavior tightening is total scalar
   validation of untyped input, recorded as a release-note item.
3. Tool identity has one authority: the selected executable reports an absolute
   canonical path and version. Host filesystem semantics come from Effect
   `Path`, not from provider probe JSON.
4. Interruption remains interruption, including mixed fail-plus-interrupt
   causes. No convenience combinator may erase the interrupt component.
5. Native inspection converts malformed bytes to typed operation failures; no
   corrupt executable can escape as a defect.
6. Release workflows execute no unvalidated dispatch SHA, interpolate step
   output only as data, retain `persist-credentials: false`, and never repack a
   certified npm tarball.
7. A single coordinator owns the ordered public mutation sequence:
   `effect-build -> effect-build-bun -> effect-build-deno ->
   effect-build-esbuild -> effect-build-node-sea -> GitHub`. It re-observes
   equivalent, conflicting, partial, and unknown outcomes before deciding what
   may run next.
8. All five npm subjects have verified maintainer ownership and one exact
   trusted-publisher configuration. OIDC permission exists only on the publish
   job; package provenance remains enabled.
9. The final candidate is rebuilt and re-certified after every source change.
   Published npm bytes equal the candidate manifest hashes; GitHub is last.
10. `JavaScriptBundler` / `ExecutableBuilder` are not smuggled into the release.
    A later gate may promote only a contract that a named program can swap via
    Layers without losing provider-specific errors or accepting invalid input
    topologies.

Primary objective: **semantic compression plus correctness**, followed by the
minimum release feature growth. This is not a source-line compression exercise.

## Baseline and completed work

- Plan 026 is the last completed plan.
- Certified implementation source:
  `2dda53151e877ab89708d0b0fbafa5f00d06ad58`.
- Required CI run: `31855513747`, twelve successful jobs.
- Non-mutating candidate run: `31855652066`, exactly five tarballs, one
  manifest, and 14/14 packed-consumer cases.
- Receipt/docs commit at audit entry:
  `e8c1557509a9236df8e5eb236293527c3f4fd21d`.
- Public registry state rechecked 2026-08-14: `effect-build@0.2.0` exists;
  `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and
  `effect-build-node-sea` return npm E404. An E404 is not ownership evidence.

The old `/private/tmp/effect-build-public-toolkit/plans/027-037` bundle was
written before Plans 023-026. It is evidence, not an executable program. This
audit accepts, corrects, or replaces its findings below.

## Recon counts

Counts use `rg --files` at the audit SHA and separate production from evidence:

| Group | Files | Physical lines | Nonblank lines |
|---|---:|---:|---:|
| `packages/*/src/**/*.ts` production | 28 | 5,189 | 4,777 |
| `test/**` plus `typetest/**` | 78 | 8,764 | 8,191 |
| root/package READMEs, `docs/**`, `plans/**` | 47 | 23,581 | 20,076 |
| `scripts/**` plus `.github/**` | 10 | 1,853 | 1,751 |

Production distribution is core 2,805 lines, Bun 639, Deno 262, Esbuild 568,
and Node SEA 915. Plans and evidence dominate line count and must not be
mistaken for shipped complexity.

## Live lifecycle traces

### Bun/Deno scalar and matrix

`Provider.define` constructs one service around one discovered command.
`discoverTool` probes once, canonicalizes the reported executable path, and
the service reuses that path for every cell. Scalar validates target/options,
then calls the shared `Integration.produceExecutable`; matrix first performs
total request preflight, runs prepared cells with bounded Effect concurrency,
and preserves ordered partial results. The shared lifecycle resolves the
destination, allocates a sibling candidate, runs the scoped child, inspects
native bytes, optionally hashes, and atomically renames.

Current duplicated/weak facts:

```ts
// ToolDiscovery.ts
return { artifactTool: { name: tool, version, path }, hostOs }

// CompilerEngine.ts
const executableSuffix = selection === undefined
  ? tool.hostOs === "windows" ? ".exe" : ""
  : selection.descriptor.executableSuffix

// ExecutableLifecycle.ts
if (state.executableSuffix !== ".exe" && (information.mode & 0o111) === 0) ...
```

`hostOs` is consumed only to name untargeted output. The mode check incorrectly
uses target suffix as a host-filesystem proxy, so a Windows host producing a
Linux/macOS target can reject a valid file. Effect `Path.sep` is already in the
operation environment and is the smallest truthful host filesystem fact.

### Scoped bundle -> Node SEA

Esbuild and Bun independently implement the same public continuation shape:

```ts
withJavaScriptBundle(input, use)
```

Both construct a core `JavaScriptBundle.Artifact` that is live only during the
callback. Node SEA consumes that capability through:

```ts
createExecutable({ main, outfile, cwd?, digest?, assets? })
```

Core owns liveness, cleanup-root/publication exclusion, inspection, digest, and
publication; integrations own native invocation and diagnostics. This is the
earned granular lifecycle. It does not yet prove a provider-neutral error
contract for a replaceable bundler service.

One Effect correctness defect remains in Bun's continuation wrapper:

```ts
(main) => Effect.result(use(main))
```

A live rc.108 probe of a combined `Cause.fail("user")` plus
`Cause.interrupt(123)` returns a successful `Result.Failure` and loses all
interruptors. The repository already has `captureCellResult` precisely to
preserve mixed causes. This must be fixed before publication.

## Concept, representation, invariant, ownership map

| Concept | Canonical representation | Invariant | Owner |
|---|---|---|---|
| Selected tool identity | `{ name, version, path }` | one probed runnable canonical executable | integration Layer / core discovery |
| Host filesystem | Effect `Path` service (`sep`) | filename/mode semantics describe the orchestrator filesystem | application-supplied platform Layer |
| Native target | core `SystemTarget` | derived from output inspection, not requested suffix | core lifecycle |
| Temporary JS bundle | nominal live `JavaScriptBundle.Artifact` | authenticated bytes usable only inside callback | core lifecycle; producer supplies descriptor |
| Durable executable | `ExecutableArtifact` | validation/hash complete before one atomic rename | core lifecycle |
| Stage observation | ordered immutable stage tuple | observed work only; no hermeticity claim | integration result |
| Candidate release bytes | five `.tgz` files + manifest hashes | packed once, tested and published unchanged | effect-build candidate workflow |
| Publication subject | prepared npm/GitHub intent | observe before mutate; prerequisites converge in order | ts-release coordinator |
| Trusted publisher | npm package setting + exact workflow/environment | one OIDC publisher per package | maintainer/npm |

## Capability boundary matrix

| Surface | Core | Bun | Deno | Esbuild | Node SEA |
|---|---|---|---|---|---|
| durable file/executable artifact | owns | returns | returns | no | returns |
| scoped JS bundle capability | owns | produces | no evidence | produces | consumes |
| scalar/matrix source -> executable | lifecycle only | public | public | no | no |
| tool discovery/probe | private author support | uses | uses | package import/version | exact Node probe |
| native options/diagnostics | no | owns | owns | owns | owns |
| replaceable generic service | not yet | no | no | no | no |
| process/filesystem implementation | Effect services only | provided by app | provided by app | provided by app | provided by app |

## Vetted findings and dispositions

| Earlier proposal / new finding | Disposition | Evidence and reason |
|---|---|---|
| Keep tool probe for `{path, version}` | ACCEPT | It proves Layer-time runnability, pins a shim-transparent real executable, and avoids re-resolving every matrix cell. |
| Remove `hostOs` and derive Windows naming from `Path.sep` | ACCEPT | `hostOs` has one naming consumer and duplicates a host fact already available at the correct Effect boundary. |
| Gate execute-bit validation on host filesystem | ACCEPT/CORRECT | Current target-suffix guard is a real Windows cross-target bug. Do not add another `hostOs`; use the same `Path` authority. |
| Drop `provenance: true` | REJECT | The non-mutating candidate workflow and publishing manifest are not contradictory phases. Release activation should retain provenance and add job-scoped OIDC. npm trusted publishing generates provenance automatically for eligible public GitHub releases. |
| Contain Node ELF uint64 throws; reject duplicate interpreter/FAT64 | ACCEPT | `SelectedNodeExecutable.uint64` still throws outside typed containment; core accepts duplicate `PT_INTERP` and lacks an explicit FAT64 branch. |
| Harden explicit executable equality and PATH selection | ACCEPT WITH BOUNDARY | Explicit paths must match the probe realpath. PATH discovery may remain shim-tolerant, but should resolve only absolute entries using Effect `Config` + `Path`; do not import `node:*`. |
| Pin every consumer transitive with one override map | CORRECT | A global override can collapse legitimate duplicate versions. Generate a lock without installing code, validate integrity coverage, then perform frozen installs; record lock hashes in candidate evidence. |
| Dependabot + audit | ACCEPT | GitHub documents current text `bun.lock` support. Audit is a gating visibility control, not proof of absence of risk. |
| Cache release installs | REJECT | Cache only non-release CI. Candidate/publish jobs remain cold/frozen; npm's trusted-publishing guidance also recommends disabling package-manager cache in release builds. |
| Shrink native inspection seed and remove quadratic concatenation | ACCEPT | Range-request protocol already exists; this is behavior-preserving IO compression. |
| Pretend Effect Crypto streams SHA-256 | REJECT | rc.108 exposes one-shot digest only. Document the cost or wait for a real incremental service; do not import `node:crypto` into core. |
| Use `Effect.result` around arbitrary caller effects | REJECT | Live mixed-cause probe loses interruption. Preserve the original Cause; use identity-safe error mapping only around owned failures. |
| Reuse `@mannyc1/ts-release@0.2.2` unchanged | REJECT | Released/authored config is singular and repacks with `npm pack`; it cannot express five exact prepacked npm subjects. |
| Build a new effect-build release coordinator | REJECT | Current ts-release main already has prerequisites, observation, conflict, unknown-outcome reobservation, and resumability. Extend its input/preparation boundary. |
| Stage the first publication of four new package names | REJECT AS IMPOSSIBLE | npm staged publishing requires an existing package. Namespace bootstrap is a distinct, approved manual mutation. |
| Add generic `JavaScriptBundler` now as a release prerequisite | DEFER | Bun and Esbuild prove common input/artifact/lifetime, but provider errors have not converged and no application currently swaps Layers through one generic tag. |
| Add universal `ExecutableBuilder` | CORRECT/DEFER | Node SEA consumes a bundle; Bun/Deno consume source. A single untyped input union would reintroduce invalid states. First test `ExecutableAssembler<JavaScriptBundle>` separately from source compilers. |

## Release blocker analysis

Official npm constraints materially shape the solution:

- Trusted publishing needs npm >=11.5.1 and Node >=22.14, exact workflow
  identity, GitHub-hosted runners, and `id-token: write` on the publishing job:
  <https://docs.npmjs.com/trusted-publishers/>.
- The current `npm trust` CLI additionally requires npm >=11.15, account 2FA,
  write access, and an already-existing package:
  <https://docs.npmjs.com/cli/v11/commands/npm-trust/>.
- Staged publishing cannot create a brand-new package:
  <https://docs.npmjs.com/staged-publishing/>.

Therefore four E404 names create an explicit decision gate. Recommended
bootstrap: publish a minimal, unmistakable prerelease reservation such as
`0.0.0-reserved.0` for each new name with interactive 2FA, verify ownership,
configure the same exact trusted publisher on all five packages, then disable
long-lived publish tokens. This keeps the certified `0.3.0` release entirely on
OIDC, at the cost of four visible reservation versions. Publishing `0.3.0`
interactively instead is simpler but forfeits the coordinated first-release
proof and should be a conscious alternative, not a fallback.

There is no atomic five-package npm transaction. Safety comes from immutable
version coordinates, exact tarball hashes, prerequisite ordering, observation
before mutation, and resumability. GitHub tag/release creation must be last.

## Smallest execution program

The dependency order is:

1. Plan 027 imports this plan bundle and restamps transitional governance.
2. Plans 028-034 fix repository correctness, security, and performance without
   publication.
3. Plan 035 extends and publicly qualifies ts-release's existing coordinator.
4. Plan 036 performs the approved one-time npm namespace/trust bootstrap.
5. Plan 037 recertifies new source and releases the exact tested bytes.
6. Plan 038 tests, but does not presume, generic service promotion.

Plans 035-037 have explicit approval boundaries. Independent local work must
continue when an external approval is pending; no task may convert a missing
approval into a manual fallback.

## Hard exclusions

- no generic DAG, plan language, registry, automatic backend selection, cache
  protocol, CAS, remote transport/execution, container executor, plugin system,
  watch mode, automatic tool download, or npm-package build product;
- no integration-to-integration dependency;
- no raw argv/process handle/public candidate/rename capability;
- no repacking between candidate verification and npm publish;
- no token, npm OTP, environment secret, or private source in plans or logs;
- no release mutation from the planning task.

## Compression ledger

| Change | Representations removed / states closed | New state introduced |
|---|---|---|
| remove `hostOs` | provider probe OS + host naming branch | none; `Path.sep` already exists |
| host-gated mode check | target suffix pretending to be host filesystem | none |
| strict scalar preflight | scalar raw forwarding distinct from matrix validation | one documented rejection behavior |
| preserve mixed Cause | caller error as `Result` that can erase interrupt | none |
| typed native decode | defect path parallel to typed probe failure | finite internal reasons/tests |
| lock-before-install consumers | unpinned resolution immediately executed | per-fixture lock hash evidence |
| prepacked ts-release input | effect-build manifest plus a second npm-pack representation | ordered list of verified tarball subjects |
| one trusted workflow | tokens/manual fallback possibilities | one explicit bootstrap event |
| generic-service gate | guessed universal interfaces | one comparison fixture; no API unless earned |

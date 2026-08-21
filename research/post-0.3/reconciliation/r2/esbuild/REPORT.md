# R2 provider-native breadth supplement — esbuild

Date: 2026-08-19.
Lane: provider-native breadth (`RESEARCH-PROGRAM.md` R2), esbuild slice.
Status: **bounded research work product.** Not a decision record, not an export map, not a
certification, and not an authorisation to implement. Nothing here overrides `AGENTS.md`, the
`DECISION-RECORD.md` authority baseline (D1), or any active session or branch instruction.

Immutable base: `claude/research-corpus-reconciliation-63pjhg` at
`c4cefd0acc2b7854cc25513967af1a8d415ccab0`, verified against the remote before any work began.

## 0. Method, and what this pass may and may not claim

The imported breadth inventory recorded twelve esbuild rows (E01–E12) as `source-established`
with `evidence_status: not executed in this research`, sourced to `https://esbuild.github.io/api/`
— moving documentation with no version pin. That host is blocked by this environment's network
egress proxy (EV-ESB-025), so the corpus's own primary coordinate could not be re-read.

Rather than treat that as a stop, this pass moved **up** the evidence ladder that
`GOVERNANCE.md` defines. Every claim below is grounded in one of:

1. the **published package** `esbuild@0.28.2`, downloaded and verified against the registry
   `dist.shasum` (EV-ESB-001), including its declarations, its shipped implementation, its
   install script, its CLI entry, and its metadata;
2. the **tagged source** at `v0.28.2` on `raw.githubusercontent.com` — `lib/shared/types.ts`
   (byte-identical to the shipped `lib/main.d.ts`), `lib/shared/common.ts`, `lib/npm/node.ts`,
   `lib/deno/mod.ts`, `lib/npm/browser.ts`, and `CHANGELOG.md`;
3. the **platform package** `@esbuild/linux-x64@0.28.2` and the **native binary** inside it,
   whose computed sha256 matches the digest esbuild itself publishes for that file; and
4. two **recorded executions** of that exact binary (`--version`, `--help`) plus the corpus's
   own archived receipt from run `31971767617`.

This is strictly stronger than the corpus's original coordinate, and it changed the answers. The
supplement adds **seven operations the imported inventory does not contain at all**, splits three
imported rows that were carrying two publication laws each, and reclassifies one row (E12) from
"private implementation detail" to "public operation plus five architecture laws".

What this pass **may not** claim: no probe was implemented and no behavior was executed beyond
`--version` and `--help`. Declarations and source establish *advertised shape, structure, and
control flow*. They do not establish cancellation outcomes, race resolutions, partial-write
remnants, cleanup, timing, or supported coordinates. Every such question below is left as
`requires-runtime-proof` with a named probe.

Deliverables: `ATOMIC-CLAIMS.csv` (119 rows), `PROVIDER-OPERATIONS.csv` (19 rows),
`EVIDENCE-COORDINATES.csv` (25 rows), this report, and `MANIFEST.sha256`.

## 1. Complete native surface at 0.28.2

### 1.1 Every public member of the JavaScript API

The tagged declarations export exactly twelve public members. The imported inventory named four
of them.

| Member | In imported inventory? | Classification here |
|---|---|---|
| `build` | E01 (as one mixed row) | three operations — memory, direct-write, host-stdout |
| `context` | E03 | two operations — memory, direct-write |
| `transform` | E02 | one operation |
| `analyzeMetafile` | E10 (merged with metafile) | one operation |
| `formatMessages` | **no** | one operation |
| `buildSync` | **no** | two operations (memory, direct-write) |
| `transformSync` | **no** | one operation |
| `analyzeMetafileSync` | **no** | one operation |
| `formatMessagesSync` | **no** | one operation |
| `initialize` | **no** | one operation |
| `stop` | **no** (E12 covered the child, not its public control) | one operation |
| `version` | **no** | runtime capability |

Plus the command lane (E11), which decomposes into four operations, and the plugin surface (E09),
which decomposes into seven sub-operations and a request-mode family.

Nineteen operations total. `PROVIDER-OPERATIONS.csv` carries the complete key, request and result
types, sub-operations, modes, holes, and disposition for each.

### 1.2 The three splits the imported rows were hiding

**E01 carried three publication laws, not one.** `write` defaults to `streamIn.hasFS` — that is,
**true** on Node — so direct-write is the *default* mode and memory mode requires an explicit
`write: false`. And there is a third mode the corpus and `RECONCILIATION.md` §3 both miss
entirely: with `write: true` and neither `outfile` nor `outdir`, the native child returns a
`writeToStdout` payload and the JavaScript layer prints it to the **host process stdout** with
`console.log`. The bundled bytes are then neither a returned value nor a file. That mode is
ESB-OP-19 and it is rejected.

**E03–E08 carried two publication laws.** A context created with `write: true` republishes into a
caller-selected destination on every rebuild and on every watch-triggered rebuild. Its failure and
remnant laws differ from a memory context, so §1 of `RECONCILIATION.md` forces the split.

**E11 carried four operations.** At argv level `--watch` and `--serve` are *modifiers* on an
ordinary build invocation, not subcommands — they compose with each other and with `--outdir`.
But because they change lifetime and publication, the same §1 rule promotes them into separate
semantic identities. The command lane therefore yields: stdout one-shot, direct-write one-shot,
watch (scoped-process), serve (scoped-process).

### 1.3 Host applicability

The same twelve members do not exist on the same four hosts. This table is read from the three
host modules at the tag.

| Operation family | node | bun (npm pkg) | deno | browser (wasm) |
|---|---|---|---|---|
| `build` memory / `transform` / `analyzeMetafile` / `formatMessages` | yes | unproven | yes | yes |
| `build` direct-write | yes | unproven | yes | **throws** (`hasFS: false`) |
| `context` acquisition | yes | unproven | yes | yes |
| `context.watch` / `context.serve` | yes | unproven | yes | **throws** |
| all four `*Sync` members | yes | unproven | **throws** | **throws** |
| `initialize` | near no-op | unproven | near no-op | **mandatory first call** |
| `stop` | resolves immediately | unproven | awaits child exit | yes |
| selected command | yes | yes | yes | n/a |

"unproven" is not a guess that Bun works. effect-build composes esbuild under Node **and** Bun
hosts, and every Bun cell above depends on Bun's `child_process.spawn`, `unref`, and
`worker_threads` behaviour, none of which is executed at any coordinate in this programme. This
is a D13 host-matrix gap, not a documentation gap.

## 2. Ownership and lifecycle analysis

### 2.1 The context is the only earned scoped handle

`BuildContext` owns a real provider lifetime: options are captured once at acquisition and are
immutable thereafter, a `buildKey` is registered in the channel, `refs.ref()` is taken against the
shared child, and `dispose()` is the terminal release that drops both. Effect `Scope` closure maps
cleanly onto `dispose()`. This satisfies the lifecycle lane's scoped-provider-context row and the
breadth lane's service test.

Per the session scope, `rebuild`, `watch`, `serve`, `cancel` and `dispose` stay **methods of that
one state owner** (LAW-ESB-04). Nothing at 0.28.2 gives any of them an independent acquisition, an
independent release, or a key of its own. The falsifier is explicit and cheap to check on any
future version: an upstream handle that can be released without `dispose()` would promote that
method to an operation. `serve` is the strongest candidate — it owns sockets, TLS material and a
request callback, and `ServeResult` is `{ port, hosts }` with **no** stop member — but at this
version it is still released only by disposing the whole context.

### 2.2 Five ownership facts the declarations do not show

These come from the shipped implementation and each one contradicts a comfortable assumption.

**The native child is process-global, not per-context.** One module-level `longLivedService` is
shared by every one-shot call, every transform, and every live context in the host process —
including contexts created by libraries effect-build does not own. `stop()` destroys its stdio and
sends `child.kill()`. Calling `stop()` from a Scope finalizer would therefore terminate the engine
underneath somebody else's live context. (LAW-ESB-01; the reason ESB-OP-13 is rejected.)

**`stop()` is a reset, not a terminal release.** It clears `longLivedService`, so the very next API
call transparently respawns a new child. On Node it also returns `Promise.resolve()` without
awaiting exit; on Deno it awaits. Two hosts, two contracts.

**`dispose()` resolving does not mean cleanup finished.** Plugin `onDispose` callbacks are
scheduled with `setTimeout(cb, 0)` *after* the dispose promise settles. A Scope finalizer that
awaits `dispose()` has no basis for claiming plugin resources are released. (LAW-ESB-05.)

**`rebuild()` coalesces.** Concurrent calls share a single `latestResultPromise`; internally the
implementation re-issues the rebuild request in a loop until an `on-end` packet settles it. N
concurrent calls therefore yield one result value, not N builds. effect-build must not promise
per-call build identity or ordering. (LAW-ESB-06.)

**`cancel()` never fails.** It resolves on any response, never rejects, and silently resolves after
dispose. It is best-effort context control, not a cancellation guarantee. (LAW-ESB-07.)

### 2.3 Post-dispose behaviour is the largest hole in the surface

`didDispose` guards **only** `cancel` and `dispose`. `rebuild`, `watch` and `serve` after dispose
are not guarded at all: they send a request carrying a `buildKey` whose callback table entry has
already been deleted, and the outcome is decided by the native child, not by a typed JavaScript
error. Nothing upstream documents that outcome.

The corpus receipt makes this sharper rather than softer. Run `31971767617` asserts
`afterCloseRejected: true` for **Rolldown** and carries no equivalent assertion for esbuild. So the
one provider whose post-release rejection the programme actually observed is not this one.
(LAW-ESB-08; probe P-ESB-02.)

### 2.4 Publication

Every esbuild write mode is `provider-direct-durable`. There is no staging, no atomic rename, no
all-or-nothing set, and no rollback. The gates' lifecycle-specific-publication rule and Law D2 of
the lifecycle lane both apply directly: a sequence of provider writes is not an atomic set, and
failure or interruption may leave partial durable output.

Upstream says exactly one thing about this, added in 0.28.2: input files are protected from
overwrite without `--allow-overwrite` "by not writing out any files when a build error is
encountered". That is a statement about **build errors**. It says nothing about interruption, and
the changelog also records that the protection had been broken since 0.17.0 — a behavioural hole
spanning 0.17.0 through 0.28.1 inclusive that is discoverable only from release notes (CLM-085).

### 2.5 Cancellation and interruption

No one-shot esbuild operation is cancellable. Only a context can `cancel()`, and only
best-effort. For every one-shot operation the honest documentation is the lifecycle lane's exact
phrasing: **the fiber stops awaiting; the provider's work continues.** (LAW-ESB-10.)

## 3. Provider information that must remain native

Normalising any of the following would reproduce the exact losses the imported
information-loss ledger catalogues.

- **`Metafile`.** Per-input bytes; imports with `kind` and optional `external`/`original`/`with`;
  optional `format`; per-output bytes, per-input byte attribution, imports including the synthetic
  `file-loader` kind, `exports`, `entryPoint`, and `cssBundle`. This is a graph-accounting schema
  with no portable peer.
- **`Message` / `Note` / `Location`.** Including `id` (which `logOverride` keys on), `pluginName`,
  the caller's own unmodified `detail`, and `location.column`/`length` as **byte** offsets — any
  effect-build renderer that assumes characters is wrong. `formatMessages` is upstream's own
  renderer and the only way to reproduce esbuild's exact output.
- **`OutputFile`.** `path`, `contents`, `hash`, and a lazily decoded `text` getter that re-decodes
  when `contents` is replaced. Note for D12: `hash` carries **no declared algorithm**, so it cannot
  serve as an algorithm-qualified digest without independent identification (probe P-ESB-16).
- **Resolution authority.** `external`, `packages`, `alias`, `conditions`, `mainFields`,
  `resolveExtensions`, `preserveSymlinks`, `nodePaths`, `tsconfig`/`tsconfigRaw`. Forward, do not
  reinterpret.
- **Plugin authority.** Namespaces, `RegExp` filters (translated into Go regexps by flag
  prefixing), `pluginData` round-tripped through a process boundary by an object stash, `suffix`,
  import attributes, and plugin-contributed `watchFiles`/`watchDirs`. Note that `PluginBuild`
  hands every plugin a **complete copy of the library** — including the blocking sync variants —
  so plugin authority cannot be bounded by effect-build (CLM-088).
- **`target` and `platform`.** esbuild's `target` is syntax/engine lowering and `platform` is a
  syntax-and-resolution environment. Neither is Bun's OS/arch/libc executable target nor Node SEA's
  base-executable coupling. Three different axes, one English word.
- **`transform`.** Text-to-text over one source unit. It accepts no `entryPoints`, no `bundle`, no
  plugins, no `outdir` and no `external`, and must never be presented as a degenerate build.

## 4. Package / API / platform-package / native-binary coherence

This is the R3 input the programme asked for, and it is now grounded in bytes.

**What holds.** The tagged `lib/shared/types.ts` at `v0.28.2` is **byte-identical** to the
published `lib/main.d.ts` (both sha256 `e078310f…`). `esbuild@0.28.2` publishes sha256 digests for
its platform binaries under `esbuild.binaryHashes`, and the `@esbuild/linux-x64@0.28.2` binary's
computed sha256 (`e1698a3d…`) matches its published entry exactly. That binary reports `0.28.2`.
At run time, the JavaScript API refuses to start when the child's first packet does not carry the
host package's exact version, raising `Cannot start service: Host version "0.28.2" does not match
binary version …`. One cell of the coherence relation is therefore closed end to end.

**Six holes.**

1. **Three of 26 platform packages have no published hash** — `@esbuild/android-arm`,
   `@esbuild/android-x64`, `@esbuild/openharmony-arm64` — and they are exactly the WebAssembly
   fallback platforms, where the "native binary" is a WASM module executed by `node`.
2. **The hash is checked only on the fallback acquisition paths.** A binary resolved normally
   through `require.resolve` is never hashed, and the whole `postinstall` step is skipped under
   `--ignore-scripts`. A published hash existing is not the same as it having been checked.
3. **`esbuild.binaryHashes` exists only from 0.28.0**, introduced as a breaking change. Any
   coordinate below that has no coherence mechanism at all.
4. **The installed `bin/esbuild` is not the published `bin/esbuild`.** On non-Windows, non-yarn,
   non-WASM installs, `install.js` hardlinks the native binary *over* the Node shim. The same
   conventional path is therefore sometimes a Node process wrapping a child and sometimes the
   native executable — with different signal delivery, process-tree shape and exit reporting.
5. **`ESBUILD_BINARY_PATH` rewrites the installed library.** Set at install time, `install.js`
   rewrites both `bin/esbuild` and `lib/main.js` in place. A digest of the published tarball does
   not authenticate an installed tree.
6. **The declarations and the binary disagree about loaders.** The CLI enumeration includes
   `global-css` and omits `default`; the TypeScript `Loader` union includes `default` and omits
   `global-css`; and the JavaScript layer validates loader values only as strings. Two official
   artifacts of the same version, in disagreement in both directions.

Consequence for D9: esbuild's `provider-implementation-identity` has at least five components —
package version, declaration bytes, platform-package identity, native-binary digest, and (per the
0.28.0 notes) Go toolchain revision. A version string alone is not that identity, exactly as
`RECONCILIATION.md` §1 already requires. And for a selected command, the identity must be the
**content of the file actually selected**, because the conventional path's meaning is decided at
install time (LAW-ESB-13).

Two operation- and host-specific holes are also now pinned: GHSA-g7r4-m6w7-qqqr (serve path
traversal, Windows only, first patched 0.28.1, CVSS 2.5) and GHSA-gv7w-rqvm-qjhr (**Deno host
only**, unverified binary download, ≥0.17.0 to 0.28.1, CVSS 8.1). The second is recorded so a
future Deno-hosted esbuild composition is not admitted by inheritance from the Node host's
verdict.

## 5. Dispositions — every candidate

`RESEARCH-PROGRAM.md` R2 requires an explicit `ship | defer | reject` for each. These are research
recommendations under D5's evidence gate, not decisions; every "ship" is ship-**if**-pass on the
listed probes, and certification may still fail a candidate without silently removing it.

### Ship (10)

| Operation | Why |
|---|---|
| ESB-OP-01 `build-memory` | The core scoped JavaScript-bundle capability `AGENTS.md` already assigns to esbuild. Caller-owned result, no publication law to get wrong. |
| ESB-OP-02 `build-direct-write` | Native, default, and the only way to get esbuild's own output topology. Ships **only** with an explicit provider-direct-durable / no-rollback law. |
| ESB-OP-03 `transform` | Distinct provider-only domain, no portable peer, publishes nothing. |
| ESB-OP-04 `analyze-metafile` | Genuinely distinct operation; its one law is preserve the schema and never parse the text. |
| ESB-OP-05 `format-messages` | D2 obliges preserving native diagnostics; this is upstream's own renderer. Low priority. |
| ESB-OP-11 `context-memory` | D7 explicitly authorises esbuild context watch and serve as 0.4 native operations; the only operation in the corpus that genuinely earns a scoped handle. |
| ESB-OP-12 `context-direct-write` | Split from the above on publication law; it is the mode watch and serve actually need. |
| ESB-OP-15 `build-stdout` (command) | Selected-binary authority is a real semantic distinction (D2, D5), and this lane is the only one that lets a consumer pin an exact executable. |
| ESB-OP-16 `build-direct-write` (command) | As above, split on publication law. |
| ESB-OP-17 `build-watch` (command) | D7 authorises raw scoped command watch as a process handle with byte streams and says it does not wait for the typed-protocol research. |

All three command-lane ships share one mandatory preflight condition: the operation must record
which of the two possible `bin/esbuild` forms it selected, by content digest (LAW-ESB-13).

### Defer (1)

**ESB-OP-18 `serve` (selected-command).** A serve operation whose caller cannot learn the bound
port is close to useless, and at 0.28.2 the CLI reports the address only as human text — which
REC-006 and D7 forbid parsing. That leaves it honest only when the caller pins an exact port.
GHSA-g7r4-m6w7-qqqr also shows the served directory is a real attack surface with a host-specific
hole, and no serve behaviour has been executed at any coordinate in this programme. Unblocked by
either an upstream machine-readable address channel or an explicit product decision that the
operation requires a pinned port.

### Reject (8)

| Operation | Why |
|---|---|
| ESB-OP-06…10 (all five `*Sync`) | Blocking and non-interruptible, so an Effect wrapper would make a false interruption promise against `AGENTS.md`'s interruption law. They also refuse plugins, impose an undocumented 16 MiB output ceiling, and do not exist on two of four hosts. The async peers are complete migration targets. |
| ESB-OP-13 `stop-shared-service` | Process-global. Calling it — especially from a finalizer — would terminate the native engine underneath every other live esbuild context in the process. Not a resource release. Must remain uncalled and unexposed. |
| ESB-OP-14 `initialize-shared-service` | On Node and Bun it does nothing a first API call would not do, and it consumes a once-only global latch: if effect-build calls it, a consumer's later `initialize()` throws. A library must not spend a global token on its user's behalf. |
| ESB-OP-19 `build-host-stdout` | Writes the consumer's build output onto the consumer's stdout via `console.log`. No value to return, no publication to own or clean up. Preflight must make it unreachable as a **typed refusal**, never by silently rewriting the caller's options. |

Rejections are recorded as falsifiers with their reasons, per the standing ship-if-pass rule; none
of them is a claim that upstream is wrong, only that the operation cannot be exposed truthfully
under this product's laws.

## 6. Empirical gaps

Ranked by how much a wrong guess would cost.

1. **Post-dispose `rebuild`/`watch`/`serve`.** Untyped, undocumented, and unobserved for esbuild
   specifically while observed for Rolldown in the same receipt.
2. **Every context race.** `cancel` against an active `rebuild`; `dispose` during an active watch;
   `dispose` during an active serve with in-flight requests; concurrent `rebuild`. One linear
   sequence was executed, once, on one host.
3. **Direct-write remnants.** No execution of any direct-write mode exists at any coordinate — not
   for the one-shot lane, not for the context lane, not for the command lane. The publication law
   in §2.4 is derived entirely from source and release notes.
4. **Interruption.** No interruption of any esbuild operation has ever been executed.
5. **Watch and serve, entirely.** `context.watch`, `context.serve`, CLI `--watch` and CLI
   `--serve` have zero executions at any coordinate, on any host.
6. **Plugins, entirely.** No plugin, callback, namespace, `pluginData` round-trip, or
   `onDispose` cleanup has been executed.
7. **`transform`, `analyzeMetafile`, `formatMessages`.** No executions.
8. **The Bun host.** Every Bun cell in §1.3 is unproven, and effect-build targets Bun.
9. **Hosts other than `ubuntu-24.04`.** D13 names five certification hosts. esbuild evidence
   exists on one.
10. **Platform coherence beyond linux-x64.** One of 23 hashed cells verified; three unhashed cells
    unexamined.
11. **`OutputFile.hash`'s algorithm.** Undeclared, and D12 requires algorithm-qualified digests.
12. **The `global-css` / `default` loader divergence.** Which artifact is authoritative at a call
    site is unresolved.

## 7. Adversarial probe specifications

Specifications only — **no probe was implemented and none may be treated as evidence until a
receipt exists.** Each receipt must carry the fields the imported
`runtime-probe-specifications.md` already mandates: source commit, run identifier, UTC time, host
OS/arch/libc, exact executable paths/digests/versions, environment, complete fixture hash, the
request, a lifecycle timeline, stdout/stderr bytes, structured diagnostics, an output-tree
manifest with digests, the oracle, cleanup observation, and limitations. A passing fixture
certifies exactly one cell.

Baseline matrix for all probes unless narrowed: esbuild 0.28.2 (package digest and
platform-binary digest both recorded), on the five D13 hosts, under **both** the Node and Bun
runtimes.

### Context lifecycle and races

| ID | Question | Procedure | Falsifier |
|---|---|---|---|
| P-ESB-01 | Do `rebuild`, `cancel` and `dispose` race safely? | Slow plugin holding `onLoad`. Randomised schedules interleaving `rebuild`, `cancel`, `dispose`. Record every promise settlement, order, child liveness, sockets, outputs, plugin callback entries/exits. Repeat ≥200 schedules per host. | The scoped-handle invariant fails on any post-dispose activity, leaked child, leaked socket, or unsettled promise. |
| P-ESB-02 | What happens to `rebuild`/`watch`/`serve` after `dispose`? | Dispose, then call each of the three. Record settle/reject, error identity, whether a request reached the child, and whether the child logged anything. | If any resolves as though live, effect-build's released-state error is a fiction and must be replaced by an honest "outcome decided by the provider" statement. |
| P-ESB-03 | Does `dispose` cleanly stop an active watch and an active serve? | Start watch; mutate sources continuously; dispose mid-rebuild. Separately: start serve; hold in-flight HTTPS and HTTP requests; dispose. Record file-watch handles, listening sockets (via host tooling), client-visible behaviour, and output tree. | Cleanup invariant fails if a watcher, socket or port survives `dispose`. |
| P-ESB-04 | Does `rebuild` coalesce as the implementation suggests? | Issue N concurrent `rebuild()` calls with a source mutation between issuance and settlement. Count actual builds via `onStart`/`onEnd` and compare to N; compare returned identities. | LAW-ESB-06 is falsified if calls map one-to-one to builds, and *also* falsified if a caller can observe a stale result — record which. |
| P-ESB-05 | Does `dispose()` settling imply plugin cleanup? | Plugin whose `onDispose` writes a marker and sleeps. Await `dispose()`, then immediately observe the marker; also close the host process immediately after `dispose()` resolves. | LAW-ESB-05 is confirmed if the marker is absent at dispose-settlement; the size of the window and whether it survives process exit are the deliverable. |
| P-ESB-06 | Does a leaked context hold the host event loop open? | Create a context, drop the reference, do not dispose. Measure process exit. Repeat under Bun. | If the process exits, the `refs.ref()` model differs from the reading in §2.2 and must be corrected. |
| P-ESB-07 | What remains after interrupting a watch-triggered rebuild mid-write? | Direct-write context under watch, large multi-output graph, interrupt the fiber and separately kill the host during a write. Hash the tree before and after. | The direct-write law is falsified if the tree is ever atomic, and confirmed with a concrete remnant catalogue if it is not. |
| P-ESB-08 | Can an observer see a mixed-generation output tree during an active watch? | Continuous recursive manifest while watch rebuilds repeatedly. | Confirms or refutes the lifecycle lane's `observationComplete: false` requirement for this provider. |
| P-ESB-09 | Does the unref'd shared child block host exit under Bun? | Run one build, then exit, under Node and Bun. | If Bun does not honour `unref`, ESB-OP-13's rejection creates a hang and the disposition must be revisited with an explicit product decision. |
| P-ESB-10 | Exactly which `BuildOptions` combinations reach the `writeToStdout` path? | Enumerate `write` × entry-point count × `outfile`/`outdir` presence, capturing host stdout. | Preflight must refuse precisely that set and nothing more; over-refusal is as wrong as under-refusal. |

### One-shot build, transform, diagnostics

| ID | Question | Procedure | Falsifier |
|---|---|---|---|
| P-ESB-11 | What does Effect interruption actually do to a one-shot build? | Slow plugin. Interrupt before plugin entry, inside the plugin, during writes, and after completion. Record fiber `Exit`/`Cause`, child liveness, whether the build finished anyway, and the output tree. | Any claim that interruption stops the build is false if work or writes continue. |
| P-ESB-12 | Do plugin resources leak when a build is interrupted? | Plugin acquiring a file handle and a socket in `onStart`, releasing in `onDispose`. Interrupt at each phase. | Cleanup invariant fails on any leak; the result decides whether effect-build must own plugin lifetime itself. |
| P-ESB-13 | What durable remnants does a failed direct-write build leave? | Induce failure after some outputs are written (failing `onEnd`, permission-denied output path, disk-full via a size-capped filesystem). Hash the destination before and after. | Confirms the no-rollback law with an enumerated remnant set, or falsifies it. |
| P-ESB-14 | Same, under interruption rather than error. | As P-ESB-13 but interrupting instead of failing. | 0.28.2's "no files written on build error" statement does **not** extend to interruption; this probe determines whether it happens to. |
| P-ESB-15 | Does `allowOverwrite` behave as 0.28.2 claims, and did ≤0.28.1 differ? | `esbuild input.js --outfile=input.js` with and without the flag, at 0.28.2 and 0.28.1, hashing the input before and after. | Directly tests the CLM-085 regression window; a difference pins the hole's upper bound by execution rather than release note. |
| P-ESB-16 | What algorithm is `OutputFile.hash`? | Compare against sha256/sha512/xxhash/fnv of the same bytes across many outputs and sizes. | If unidentifiable, D12 forbids using it as a provenance digest and effect-build must traverse the bytes itself. |
| P-ESB-17 | What is the large-input temp-file threshold, and is the file cleaned on failure and interruption? | Transform inputs across sizes; watch `os.tmpdir()`; fail and interrupt at each phase. | A leaked temp file per interrupted transform is a resource-exhaustion defect that must be documented or worked around. |
| P-ESB-18 | What is the exact shape of `TransformFailure`? | Induce syntax, loader and target errors. | Confirms diagnostics are reachable as structured `Message` values rather than only as text. |
| P-ESB-19 | Does anything in `analyzeMetafile`'s output carry a machine contract? | Diff outputs across inputs and across `verbose`. | If effect-build ever derives structure from it, that is a violation to be caught here. |
| P-ESB-20 | Does `formatMessages` do anything beyond string rendering? | Round-trip messages; compare `logStyle` variants at 0.28.1 and 0.28.2. | Confirms `visualstudio` is a 0.28.2+ coordinate. |

### Selected-command lane

| ID | Question | Procedure | Falsifier |
|---|---|---|---|
| P-ESB-21 | Can stdout and stderr be bounded independently without deadlock? | Force very large stdout with concurrent stderr diagnostics; apply independent caps; record truncation facts and whether stream completion is observed separately from exit. | Awaiting `exitCode` alone races open stdio; a bounded-capture claim is false if either stream can be lost. |
| P-ESB-22 | Do signals behave identically through both `bin/esbuild` forms? | Construct both installs (npm non-yarn → hardlinked native binary; yarn → Node shim). Send SIGINT and SIGTERM. Record direct-child exit, descendant survival, exit status. | LAW-ESB-13 is confirmed if the two forms differ; if they differ, a selected-command operation must record which form it selected. |
| P-ESB-23 | Does stdin-fed CLI build work as `--help` describes? | `esbuild --loader=ts < input > output` with and without `--bundle`. | Establishes the stdout one-shot operation's real request shape. |
| P-ESB-24 | What remains after signalling a direct-write CLI build mid-run? | Large multi-output build; signal at randomised offsets; hash the tree. | Same falsifier as P-ESB-13 for the command lane. |
| P-ESB-25 | How do `--metafile=PATH` and `--mangle-cache=PATH` publish? | Pre-existing file, read-only file, missing parent directory, failing build. | Determines whether these are safe to expose as modifiers or need their own publication law. |
| P-ESB-26 | Are stdin-closure and signalling equivalent terminations for `--watch`? | Close stdin only; signal only; both; and `--watch=forever` with stdin closed. Record exit status, exit timing, and durable output state. | If they differ, Scope closure must choose and document one, and the choice becomes part of the operation's contract. |
| P-ESB-27 | Are descendants reaped when the selected bin is a Node shim? | Watch through the shim; terminate; enumerate surviving processes. | The shared lifecycle code's process-tree termination is falsified for this provider if the native grandchild survives. |
| P-ESB-28 | What durable state remains after abrupt termination mid-rebuild under `--watch`? | As P-ESB-24 but during a watch-triggered rebuild. | As P-ESB-24. |
| P-ESB-29 | How does CLI serve bind and release its port? | Pinned port, port 0, already-bound port; terminate and immediately rebind. | Determines whether the deferred ESB-OP-18 could ever be honest with a pinned port. |
| P-ESB-30 | What happens to in-flight requests when a CLI serve process is terminated? | Hold slow requests; terminate; observe client-visible behaviour. | Same. |

### Coherence

| ID | Question | Procedure | Falsifier |
|---|---|---|---|
| P-ESB-31 | Does the coherence relation hold on all 23 hashed platform cells? | Download each platform package; compute sha256; compare to `esbuild.binaryHashes`. | Any mismatch is a supply-chain finding, not a compatibility one, and must be escalated rather than recorded as a support hole. |
| P-ESB-32 | What happens when package and binary versions disagree? | Compose `esbuild@0.28.2`'s `lib` against `@esbuild/linux-x64@0.28.1`'s binary. Call `build`. | Establishes exactly when and how the first-packet version check fires, and whether the failure is catchable by a caller or thrown asynchronously inside a stdout handler. |
| P-ESB-33 | Is `global-css` accepted at run time despite being absent from the `Loader` union? | Pass it through the API and through the CLI. | Resolves CLM-082 in one direction or the other; either answer is a correction to one official artifact. |

## 8. Handoffs

### To R3 — minimum compatibility evaluator proof

- **Provider-implementation-identity for esbuild is the five-tuple in §4**, not a version string.
  For the in-process lanes the identity is package version + declaration bytes + resolved platform
  package + native-binary digest; for the selected-command lane it is the **content digest of the
  selected file**, because the conventional path's meaning is decided at install time
  (LAW-ESB-13, CLM-079, CLM-080).
- **Known holes to encode**, with exact coordinates: GHSA-g7r4-m6w7-qqqr (serve, Windows, patched
  0.28.1 — lower bound unresolved between the advisory and the imported matrix, and R3 must
  resolve it rather than pick one); GHSA-gv7w-rqvm-qjhr (Deno host only, ≥0.17.0–0.28.1); the
  input-overwrite regression 0.17.0–0.28.1 (CLM-085); no `esbuild.binaryHashes` below 0.28.0;
  no hash at all for the three WASM-fallback platforms.
- **Lane-mismatch holes are not version failures.** The imported matrix already records that the
  CLI has no rebuild API. Add: plugins have no command-lane form at all (CLM-040); all `*Sync`
  members are absent on Deno and browser; `write`, `watch` and `serve` are absent on browser.
- **Evaluation timing.** The coherence check that actually fires is the child's first-packet
  version comparison — it happens at **first use**, not at Layer acquisition, and it throws inside
  a stdout data handler rather than rejecting the pending request (CLM-078). R3's evaluation-timing
  map must not place it at layer acquisition.
- **Ambient inputs outside the selected-tool model**: `ESBUILD_BINARY_PATH`,
  `ESBUILD_WORKER_THREADS`, `ESBUILD_MAX_BUFFER`, and (Deno host) `NPM_CONFIG_REGISTRY`.
- **The escape flag.** `allowUntestedVersion` may convert *unknown coordinate + capabilities
  present + relations satisfied* only. It must **not** be able to convert a failed binary-digest
  relation, a known GHSA hole, or a lane mismatch.

### To R4 — core lifecycle and author-primitive laws

- **`Author/BorrowedOutput` acquire/close race**: esbuild's context supplies a concrete adversary.
  Laws B3 and B8 need an in-flight policy that survives `rebuild` coalescing (LAW-ESB-06) and the
  `onDispose`-after-`dispose` window (LAW-ESB-05). R4 must decide drain, interrupt, or
  forbid-concurrency with this provider's actual behaviour in hand.
- **Handle concurrency, cancellation, dispose and post-release rejection** — R4's own bullet —
  cannot be closed from declarations for esbuild. P-ESB-01 and P-ESB-02 are its inputs.
- **Provider-direct partial writes and interruption remnants**: P-ESB-13, P-ESB-14, P-ESB-07.
- **`Author/Tool`**: LAW-ESB-13 is a hard requirement on the Tool contract — an external adapter
  must be able to supply a *content* identity for a selected command, not a path plus a version
  string, and the two `bin/esbuild` forms are the demonstration that a path is insufficient.
- **`Author/Executable`**: esbuild produces no executable. It exercises none of that primitive,
  which is itself evidence for the rent audit — a primitive that only one provider touches should
  justify itself on that provider alone.
- **Hashed versus unhashed observation sums**: `OutputFile.hash` is an upstream-supplied digest
  with **no declared algorithm** (CLM-067). R4 must decide whether an unqualified provider digest
  can populate a hashed variant at all. This report's reading is that it cannot, under D12.

### To R5 — portable-role proofs

- **Node sealed main**: esbuild is one of the three named producers. One direct-main fixture
  previously matched between Bun and esbuild while imported-module semantics diverged (CLM-102).
  The role's domain boundary — direct main only, never importable module — is consistent with
  everything found here and is not weakened by this pass.
- **`IncrementalNodeMain`**: the esbuild context conformed in one recorded execution, but that
  receipt asserts `afterCloseRejected` for Rolldown and **not** for esbuild (CLM-103). R5 must not
  read esbuild's conformance as including post-release rejection. Per D15 the profile gate stays
  independent of any provider package gate in both directions.
- **`BrowserModulePayload`**: esbuild is a candidate producer with **zero** browser-role executions
  at any coordinate (CLM-104). Note for the role's law matrix: `Metafile.outputs[].cssBundle` and
  the synthetic `file-loader` import kind are exactly the module-owned-edge information the role
  needs, and they are esbuild-native — the role must consume them without flattening them.
- **Do not broaden either role to make esbuild look conformant.** The `--watch=forever`,
  stdin-closure, and serve-address findings all show that this provider's honest surface is
  narrower than its English vocabulary suggests.

### To the surface freeze (R1 / R7)

The nineteen operation identities in `PROVIDER-OPERATIONS.csv` are offered as the esbuild portion
of the complete canonical crosswalk. Three of them (`format-messages`, `stop-shared-service`,
`initialize-shared-service`) and the five `*Sync` operations and `build-host-stdout` do not appear
in `RECONCILIATION.md` §3 at all, so §3's esbuild table is **incomplete** and should be replaced
rather than appended to. The gate-closure table's "Complete canonical operation map — Open" row
remains open for the other providers; for esbuild it is closable once R1's reviewers accept these
identities.

## 9. Honest limits of this report

- No probe was implemented; no runtime proof is claimed from declarations or source. Every
  behavioural statement above is either a control-flow reading of shipped code (labelled as such)
  or a `requires-runtime-proof` gap.
- `https://esbuild.github.io/api/` — the imported corpus's primary esbuild coordinate — was
  unreachable from this environment. Its content is neither confirmed nor contradicted here.
- Coherence was verified at exactly one platform cell (linux-x64) on one host.
- The GHSA-g7r4-m6w7-qqqr lower bound is genuinely unresolved between two sources and is recorded
  as unresolved rather than reconciled by preference.
- Bun-host applicability is unproven throughout, and effect-build targets Bun.
- Recommendations are research dispositions under D5's evidence gate. They do not authorise
  implementation, freeze any surface, select a version range, name any export, or certify
  anything. Per `GOVERNANCE.md`, the only valid path forward remains: complete the crosswalk →
  record every disposition → answer the maintainer questions → authorise the instruction cutover →
  freeze → rewrite Plans 039–044 → implement → certify.

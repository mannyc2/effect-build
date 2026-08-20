# Ship / defer / reject — shadow synthesis dispositions

Date: 2026-08-20.
Status: **blind shadow synthesis work product.** These are semantic dispositions for the
pre-freeze crosswalk under D5's evidence gate. They are not release decisions, support
commitments, implementation authorizations, or certifications. Judgment axes remain separate:
every entry names its evidence basis and its remaining empirical gate. **Explicit `unknown`
is valid coverage but can never justify shipping**; every ship below is ship-*if-pass* on the
probes named in `EXECUTABLE-PROBE-QUEUE.md`, and certification may still fail a candidate
without silently removing it (D5).

Vocabulary:

- **ship-identity** — the canonical identity is sound and complete; include it in the 0.4
  candidate crosswalk; public support cells remain unadmitted until execution.
- **defer** — the identity is recorded but must not enter the freeze candidate set until a
  named gate resolves.
- **reject** — the identity must not be exposed; the rejection and its falsifier are the
  durable record.

## Bun

| Operation | Disposition | Basis / remaining gate |
|---|---|---|
| CO-BUN-01 create-transpiler | ship-identity | source-established; GC/native-lifetime probes remain |
| CO-BUN-02 transpile-async | ship-identity | interruption/threadpool probes remain |
| CO-BUN-03 transpile-sync | defer | async twin exists; only an honest non-interruptible wrapper is truthful (MSD-10); demonstrated need required |
| CO-BUN-04 scan-source | ship-identity | honest sync law required; no async twin exists |
| CO-BUN-05 scan-imports | ship-identity | as CO-BUN-04; accuracy-tradeoff probe queued |
| CO-BUN-06 build-memory | ship-identity | retention/plugin/cancellation probes remain |
| CO-BUN-07 build-direct-write | ship-identity | partial-write/remnant/pre-existing-output probes remain |
| CO-BUN-08 build-stdout | ship-identity | bounded-capture/stdout-topology probes remain |
| CO-BUN-09 build-direct-write (cmd) | ship-identity | config/env/signal/remnant probes remain |
| CO-BUN-10 build-watch | ship-identity | raw handle only; termination/reap/remnant probes remain; typed events stay rejected |
| CO-BUN-11 compile-executable (api) | ship-identity | output-topology/acquisition/interruption probes remain |
| CO-BUN-12 compile-executable (cmd, staged) | ship-identity | released wrapper identity; target-matrix and interruption probes remain |
| CO-BUN-13 plugin-register-global | reject | ambient mutable authority without scoped ownership; falsifier: upstream scoped registration handle |
| CO-BUN-14 plugin-clear-global | reject | global clear cannot be scope-safe; same falsifier |

HTML graph, full-stack, and standalone-HTML are request modes riding CO-BUN-06/07/09/11/12;
their adversarial closure probes gate those modes, not separate identities. Bytecode is a
modifier gated on mismatch/fallback probes. Macro-enabled presets and native `onBeforeParse`
defer. Source-only target branches (FreeBSD/Android/version tokens) defer. Range inference
from 1.3.9+1.3.14 stays rejected.

## Deno

| Operation | Disposition | Basis / remaining gate |
|---|---|---|
| CO-DEN-01 bundle-memory | defer (experimental candidate) | v2.9.5 permission/interruption execution missing; D6 experimental status |
| CO-DEN-02 bundle-direct-write | defer (experimental candidate) | partial-write/remnant execution missing |
| CO-DEN-03 bundle-stdout | defer (experimental candidate) | framing/stderr/interruption receipt missing |
| CO-DEN-04 bundle-direct-write (cmd) | defer (experimental candidate) | project-authority + partial-write execution missing |
| CO-DEN-05 bundle-watch | defer (experimental candidate) | termination/reap/rebuild execution missing |
| CO-DEN-06 bundle-declarations | defer (experimental candidate) | closure/topology adversarial execution missing |
| CO-DEN-07 transpile-stdout | ship-identity | stable; support cells pending execution |
| CO-DEN-08 transpile-direct-write | ship-identity | stable; no atomic-tree claim; remnant probes remain |
| CO-DEN-09 transpile-declarations | ship-identity | stable; declaration-topology probes remain |
| CO-DEN-10 compile-executable | ship-identity | stable; acquisition/offline/target/permission matrix remains; provider-native publication is provider-direct until proven otherwise |
| CO-DEN-11 compile-watch | defer | rebuild/coalescing/termination laws entirely empirical |
| RC-DEN-01 compiled-runtime bundle | reject as surface | unavailable at both observed identities; re-probe per new identity only |

The Deno supplement's defer-everything-experimental posture is adopted unchanged; its
ship set (transpile ×3, compile) is adopted with the publication correction (MSD-02).

## esbuild

| Operation | Disposition | Basis / remaining gate |
|---|---|---|
| CO-ESB-01 build-memory | ship-identity | interruption/plugin-cleanup/hash-algorithm probes remain |
| CO-ESB-02 build-direct-write | ship-identity | ships only with explicit no-rollback law; remnant probes remain |
| CO-ESB-03 transform | ship-identity | temp-file lifecycle probes remain |
| CO-ESB-04 analyze-metafile | ship-identity | never parse returned text |
| CO-ESB-05 format-messages | ship-identity (low priority) | D2 diagnostics preservation |
| CO-ESB-06..10 all *Sync | reject | non-interruptible blocking calls; false interruption promise; lost plugins; 16MiB ceiling; two hosts absent; async twins complete (MSD-10) |
| CO-ESB-11 context-memory | ship-identity | race/post-dispose/coalescing probes remain; D7 authorizes context watch/serve |
| CO-ESB-12 context-direct-write | ship-identity | plus mixed-generation-tree probes |
| CO-ESB-13 stop-shared-service | reject | terminates the process-global engine under foreign owners; must remain uncalled |
| CO-ESB-14 initialize-shared-service | reject | consumes the consumer's once-only global latch |
| CO-ESB-15 build-stdout (cmd) | ship-identity | bounded-capture/bin-form probes remain; selected-file content digest mandatory |
| CO-ESB-16 build-direct-write (cmd) | ship-identity | remnant + metafile/mangle-cache publication probes remain |
| CO-ESB-17 build-watch (cmd) | ship-identity | stdin-vs-signal termination choice must be made and documented |
| CO-ESB-18 serve (cmd) | defer | honest only with a pinned port; unblocked by upstream machine-readable address or explicit product decision; Windows GHSA hole encoded |
| CO-ESB-19 build-host-stdout | reject | writes consumer output onto host stdout; typed preflight refusal required |
| RC-ESB-01 version-export | capability-map only | never an identity input |

## Node SEA

| Operation | Disposition | Basis / remaining gate |
|---|---|---|
| CO-SEA-01 assemble-direct | ship-identity | identity/relation model ships; every host/target/version cell unadmitted; exact-binary LIEF/SEA capability probes remain |
| CO-SEA-02 generate-preparation-blob | ship-identity (internal stage) | not an independent public export; generator/base relation probes remain |
| CO-SEA-03 inject-preparation-blob | ship-identity | no injector or target cell admitted; exact injector identity selection is an open R3 gate |
| RC-SEA-01..03/05 runtime lookups | ship-identity (capability map) | encoding/missing-key/lifetime probes remain |
| RC-SEA-04 get-raw-asset | ship-identity (capability map); **reject mutation** | runtime-borrowed-view; write-through is a rejected use |

Rejected outright: one merged `buildSea` identity hiding the routes; any fallback between
routes; unpinned `npx postject` as an injector identity; historical `NODE_JS_CODE` raw
injection as the modern operation; version-range inference from tags or upstream CI; overrides
of the non-overridable relations; publication before repair/validation; any universal signing
abstraction or Apple distribution work inside this canon (R9/M4). Deferred: every
version/host/target cell, ESM/cache/snapshot/native-addon certification, cross-target cells,
injector candidates, and the entire lifecycle guarantee set.

## Rolldown

All Rolldown dispositions sit under the independent D15 provider-package gate; nothing here
pre-judges the `IncrementalNodeMain` profile gate (independent in both directions).

| Operation | Disposition | Basis / remaining gate |
|---|---|---|
| CO-ROL-01 build-context | ship-identity (D15 candidate core) | archived generate/close seed; concurrency/close-race/post-close probes remain |
| CO-ROL-02 context-generate | ship-identity (D15 candidate core) | external-memory/retention probes remain |
| CO-ROL-03 context-write | defer | direct-write remnant/collision probes required first |
| CO-ROL-04 build-memory (one-shot) | defer | finally-cleanup interruption probes |
| CO-ROL-05 build-direct-write (one-shot) | defer | as CO-ROL-03 |
| CO-ROL-06/07 watch modes | defer | event order/skipWrite/close-during-rebuild probes |
| CO-ROL-08..10 CLI stdout/write/watch | defer | selected-command identity + stdout topology + termination probes |
| CO-ROL-11 transform / CO-ROL-13 minify | defer | experimental; demand-gated |
| CO-ROL-12 parse | defer | public utility; demand-gated |
| CO-ROL-14 create-resolver | defer | release-protocol discovery probe |
| CO-ROL-15 scan | defer | cleanup/interruption probes |
| CO-ROL-16 emit-isolated-declaration | defer (rejected from current profile) | separate contract required |
| CO-ROL-17 module-runner-transform | reject | deprecated Vite-only |
| CO-ROL-18 load-config | defer | executes caller code; trust-boundary policy required |
| CU-ROL-01 dev-engine | reject-current / hold | cannot receive a complete key until publication mode split (schema F6) |

## Cross-provider

- Portable roles: NodeMainProgram and BrowserModulePayload remain **proof programs**
  (ship-if-pass under D8); RuntimeExecutable and CLI-text TypedWatchEvents remain
  **falsified**; the operation-owned surface boundary (R05) is **adopted**.
- `compileExecutableMatrix`: outside this canon; pending-maintainer (MSD-17).
- `withJavaScriptBundle`: removed at the hard cut (D16); capability survives as CO-BUN-09
  plus borrowed-output laws.
- Typed cross-provider watch events: rejected everywhere; D7 routes are the only path.
- Distribution trust (Developer ID, notarization, containers, stapling, Gatekeeper):
  excluded from this canon to R9/M4.

## Consistency notes

1. The sync-operation law is applied uniformly (MSD-10): esbuild's five rejections upheld;
   Bun's sync transpile deferred; Bun scans kept only because no async twin exists and only
   under an honest non-interruptibility contract.
2. Every watch surface has the same shape: raw scoped handle, provider-direct publication,
   no typed events.
3. No disposition converts an evidence coordinate into a support range; nothing labeled
   `unknown` is shipped; nothing rejected is silently dropped — each rejection carries its
   falsifier in `MERGE-SPLIT-DECISIONS.csv` or the canon row.

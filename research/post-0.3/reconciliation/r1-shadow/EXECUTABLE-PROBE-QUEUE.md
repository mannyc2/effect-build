# Executable probe queue — shadow synthesis

Date: 2026-08-20.
Status: **specifications only.** No probe was implemented or executed by this synthesis.
Documentation and tagged source establish advertised shape; only receipts at exact evidence
coordinates can close the gates below. Each receipt must record: provider implementation
identity (content digest where a command is selected), host, requested target, option mode,
evaluation phase, request, lifecycle timeline, streams, exit/error shape, output-tree
manifest with algorithm-qualified digests, remnants, cleanup observation, and limitations.
A passing fixture certifies exactly one cell; no range is ever inferred.

The queue consolidates the five supplements' probe programs (Bun P01–P26; Deno
P-DENO-01..09; esbuild P-ESB-01..33; Node SEA falsifier families 1–14; Rolldown probes 1–19)
into cross-provider families, deduplicated. Supplement probe IDs remain the authoritative
per-provider procedures; this queue orders them by which architectural law they gate.

## PF-1 — Interruption and remnant family (gates every direct-write ship)

Interrupt each direct-write operation at controlled phases; hash destination trees before and
after; enumerate remnants; verify no atomicity claim survives.

- Bun: P07–P10, P18–P20 (build-direct-write, watch in-flight write, api/cmd compile).
- Deno: P-DENO-02 (bundle output/remnant matrix), compile interrupt (new: mid-write
  destination inspection — added by shadow finding F2/MSD-02), P-DENO-05 watch remnants.
- esbuild: P-ESB-07, P-ESB-13, P-ESB-14, P-ESB-24, P-ESB-28.
- Node SEA: lifecycle falsifier family 10 (interrupt before/during/after every child and
  write; ignored signals; descendants; cleanup failure; Windows locks).
- Rolldown: probes 7, 8, 12.

Blocking: CO-BUN-07/09/11/12, CO-DEN-02/04/08/10, CO-ESB-02/12/16, CO-SEA-01/03,
CO-ROL-03/05 dispositions.

## PF-2 — Scoped-handle race family (gates every scoped-context ship)

Race release against active work; verify post-release behavior; measure coalescing.

- esbuild: P-ESB-01..06 (rebuild/cancel/dispose races; post-dispose outcomes; onDispose
  window; leaked-context liveness) — the corpus's largest untyped hole (LAW-ESB-08).
- Rolldown: probes 2–6, 10 (concurrent generate/write, close races, close idempotency,
  external-memory release, watcher close during rebuild).
- Bun: P02/P03 (Transpiler retention and parallel calls).

Blocking: CO-ESB-11/12, CO-ROL-01/02, CO-BUN-01 dispositions.

## PF-3 — Watch lifecycle family (gates every raw watch ship)

Readiness boundary, failed-rebuild recovery, rapid-edit coalescing, rename/delete, signal
escalation, descendant reaping, stdin-vs-signal termination equivalence.

- Bun: P15–P18. Deno: P-DENO-05. esbuild: P-ESB-26..28 (including `--watch=forever` and the
  node-shim bin form). Rolldown: probes 9–10, 12.

Blocking: CO-BUN-10, CO-DEN-05, CO-ESB-17, CO-ROL-06/07/10, CO-DEN-11.

## PF-4 — Selected-command identity and TOCTOU family (gates every command lane)

Content-digest observation at acquisition, replacement between acquisition and launch,
same-length replacement, dual bin forms.

- esbuild: P-ESB-22 (both bin/esbuild forms), P-ESB-32 (version-mismatch first-packet
  failure shape). Deno: P-DENO-09. Node SEA: TOCTOU family 11 (symlink/rename swap, candidate
  replacement between validation/digest/rename). Rolldown: probe 18. Bun: selected-command
  replacement variant of P20.

Blocking: all selected-command operations; R3 launch-boundary law.

## PF-5 — Acquisition and offline family

Cold/warm/corrupt cache, no-network, proxy/TLS, explicit override, hidden-substitution
refusal.

- Bun: P21–P23 (compile target runtime acquisition). Deno: P-DENO-06 (denort per target ×
  cache states × DENORT_BIN), esbuild-helper acquisition variant. esbuild: platform-package
  coherence P-ESB-31 (all 23 hashed cells; escalate mismatches as supply-chain findings).

Blocking: CO-BUN-11/12, CO-DEN-10, esbuild coherence relation (SC-E-35).

## PF-6 — Permission and authority family

- Deno: P-DENO-01 (deny-all/no-prompt/read/import/write matrix at v2.9.5 exact identity —
  resolves the 2.9.3 falsifier's successor question), P-DENO-03 (project authority: host API
  vs selected command against conflicting cwd/config/import-map/lock/npm/env).
- esbuild: plugin-authority probes P-ESB-12 (plugin resource leaks under interruption).
- Rolldown: probe 13 (plugin ordering/failure/close cleanup); loadConfig trust boundary.

Blocking: CO-DEN-01..06 experimental candidates; plugin request-mode laws.

## PF-7 — Output topology and result-contract family

- Bun: P05 (scan vs scanImports adversarial accuracy), P06 (BuildArtifact retention), P25
  (HTML/full-stack adversarial closure: nested assets, chunks, CSS URLs, workers, externals),
  P11–P14 (plugin ordering, deferred onLoad, onEnd-after-outputs, recursion limits).
- Deno: P-DENO-04 (bundle vs transpile declaration topology; no invented equivalence).
- esbuild: P-ESB-10 (exact writeToStdout option set for the typed refusal), P-ESB-15
  (allowOverwrite at 0.28.2 vs ≤0.28.1), P-ESB-16 (OutputFile.hash algorithm — D12 gate),
  P-ESB-17..21, P-ESB-23, P-ESB-25, P-ESB-33 (loader divergence resolution).
- Rolldown: probes 1, 11, 14–15 (repeated-generate determinism, CLI stdout topology,
  resolver reuse, scan cleanup).

## PF-8 — Executable assembly family (Node SEA + cross-target)

- Route identity (falsifier 1: marker-binary proof that only the selected route launches).
- Direct capability (falsifier 2: `--without-lief` refusal; version-only admission fails).
- Default-base argv0 (falsifier 3: v25.5/25.6 vs v25.7+).
- Builder/base matrix (falsifier 4: equal/adjacent/custom/SEA-disabled).
- Mode boundaries (falsifier 5: v25.7 ESM, v25.8 ESM+cache refusal, v25.9 success,
  ESM+snapshot refusal, CJS snapshot+cache canonicalization).
- Loader closure, assets, injector identity matrix, cross-target construct+launch,
  macOS repair ordering, publication/concurrent-reader, receipt-independence
  (falsifier families 6–9, 12–14).
- Bun executable peers: P24 (every documented tuple self-reports on matching host), P26
  (bytecode mismatch + post-publication signing ordering).
- Deno: P-DENO-07 (host × six targets; builder-produced bytes vs target-host execution),
  P-DENO-08 (embedded runtime contract incl. bundle-API absence).

## PF-9 — Host-matrix family (D13)

Every applicable cell on Linux x64/arm64, macOS arm64/x64, Windows x64; esbuild and Rolldown
additionally under both Node and Bun host runtimes (every Bun-host cell is currently
unproven); browser engines only via the D8 role program.

## Ordering

PF-4 and PF-1 gate the most ship-identity dispositions and run first; PF-2 next (they decide
the scoped-handle laws R4 must write); PF-8 runs per-cell as R3 builds the SEA decision
tables; PF-9 spans all families as the widening matrix, never as a bulk admission.

# Plan 040: Implement the admitted Esbuild operations

## Status

- Priority: P1 provider implementation
- Effort: L
- Risk: HIGH native callback and scoped-context lifecycle
- Depends on: Plan 039
- Status: DONE
- Publication authority: NONE

## Authority and objective

Stage exactly the `effect-build-esbuild/Build` and
`effect-build-esbuild/Context` namespaces and members selected in
`research/post-0.3/freeze/SURFACE.json`: provider-native in-memory
`Build.build` and scoped `Context.make`. Keep them export-inert until Plan 044
performs the coordinated public hard cut.

Every released 0.3 identity follows its exact disposition in
`research/post-0.3/freeze/MIGRATION.json`.

Preserve Esbuild's own option, result, plugin, diagnostic, warning, and output
types, with `write` fixed to the literal `false` for both selected operations.
Do not normalize the operations into a provider-neutral builder or add a
command twin. The public lane is `installed-library-api`; the mechanism is
Esbuild's package-owned, long-lived native service child. Do not describe it as
same-process execution or an in-process compiler.

## Required implementation

1. Bind the exact installed Esbuild package/declarations/platform binary/native
   binary/host identity and evaluate the finite R3 admission policy before
   operation work. Before claiming default support, exact executable receipts
   must contribute the concrete admission keys to immutable provider policy;
   the frozen reviewed-key set is empty and observed coordinates cannot
   self-admit.
2. `Build.build` delegates to the provider API with `write: false` and returns
   the native in-memory result. Fiber interruption stops the Effect consumer
   but does not falsely claim that Esbuild canceled an already-running
   one-shot build; delayed provider/plugin completion remains possible and
   observable.
3. `Context.make` acquires the real `write: false` Esbuild context in Scope.
   Its public state owner preserves native `rebuild`, `watch`, `serve`, and
   `cancel`; these are methods of the one selected context operation, not
   separately acquired operations. Concurrent rebuild, cancel,
   active-dispose, delayed `onDispose`, repeated release, and post-dispose
   behavior must match the R4 receipt.
4. Scope finalization owns native `dispose` exactly once and does not expose it
   for caller-owned release. Keep provider `cancel` and `dispose` meanings
   distinct; do not publish a generic handle protocol.
5. Stage only the frozen subpaths and namespace-only root keys. Prepare the 0.3
   `withJavaScriptBundle` continuation and errors for exact removal, but keep
   the released export map unchanged until Plan 044; add no alternate alias or
   delegate.

Provider-direct `write: true` build/context modes, Transform,
AnalyzeMetafile, FormatMessages, separately acquired serve/watch operations,
Esbuild command lanes, profiles, and Rolldown are not in this plan. Native
context `watch` and `serve` remain methods of the admitted scoped context.

## Tests and certification

- Type-check against the exact installed Esbuild declarations.
- Reproduce the one-shot delayed-plugin interruption continuation.
- Reproduce context coalescing/races, cancel without dispose, delayed plugin
  cleanup, post-dispose rejection, and idempotent finalization.
- Prove the admitted exact host/version cells. Reject every unadmitted
  coordinate before provider work unless the sole refusal is `SupportUnknown`
  and the caller explicitly selects the frozen untested-version override;
  holes, missing or indeterminate capabilities, relations, peers, identity
  replacement, and denied coordinates remain blocked.
- Exercise a nonpublishable source-level consumer of the staged modules. Plan
  044 owns the real package export and once-packed consumer.
- Run `bun run verify`, the exact Esbuild lifecycle probes, and a Plan 040
  implementation receipt on the exact implementation head. Authenticate the
  immutable freeze receipt separately; do not weaken its research-only scope.

## Stop conditions

Stop if the implementation must claim underlying one-shot cancellation, erase
native options/results, expose manual ownership release, infer support from a
version range, introduce a sibling-provider dependency, or add any export not
present in `SURFACE.json`.

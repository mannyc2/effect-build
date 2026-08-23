# Plan 042: Implement the frozen Deno executable lane

## Status

- Priority: P1 provider implementation
- Effort: L
- Risk: HIGH runtime acquisition, cache/offline behavior, and target identity
- Depends on: Plan 039
- Status: DONE
- Publication authority: NONE

## Authority and objective

Stage only `effect-build-deno/CompileExecutable` and its future namespace-only
root re-export as frozen in `research/post-0.3/freeze/SURFACE.json`. Keep the
released export map unchanged until Plan 044 performs the coordinated cut.
Every released 0.3 identity follows its exact disposition in
`research/post-0.3/freeze/MIGRATION.json`.

The admitted operations are selected-command `compileExecutable` and
`compileExecutableMatrix`. Deno permissions, runtime/engine selection,
includes, cache/offline behavior, configuration, diagnostics, and target
relations remain Deno-specific. The matrix uses Plan 039's new report.

## Required implementation

1. Select and bind one Deno executable with `Author/Tool`; reauthenticate it at
   launch and apply the exact finite compatibility policy.
2. Preserve Deno CLI project/environment/cache behavior. Model the Deno/denort
   relation explicitly and fail before mutation when runtime acquisition or
   offline requirements are unsatisfied.
3. Route the scalar candidate through `Author/Executable` and preserve typed
   provider diagnostics without translating interruption.
4. Admit the exact Deno/denort, provider-host, and target coordinates in
   `SURFACE.json` only after exact executable receipts contribute their
   concrete admission keys to immutable provider policy. The frozen
   reviewed-key set is empty and observed coordinates cannot self-admit.
   Reject every inferred range or unsupported musl cell, and
   reject every other coordinate unless the sole refusal is `SupportUnknown`
   and the caller explicitly selects the frozen untested-version override;
   holes, missing or indeterminate capabilities, relations, peers, identity
   replacement, and denied coordinates remain blocked.
5. Implement `compileExecutableMatrix` as bounded calls to the exact scalar
   operation with ordered cell results and independent commits.
6. Prepare the flat 0.3 root surface and every migrated name for the exact
   deletion set. Do not remove it or add an alias before Plan 044.

The unstable Deno host bundle API, command bundle/transpile/declaration/watch
operations, runtime acquisition as a standalone public operation, and browser
profiles are deferred. An experimental label does not authorize them.

## Tests and certification

- Reproduce exact real compile, execution, target, cache/offline, denort,
  permissions/config, diagnostics, interruption, replacement, and digest laws.
- Exercise the full admitted target table with an independent binary oracle.
- Exercise the redesigned matrix contract and all Cause/commit boundaries.
- Add negative tests for unadmitted versions, relations, hosts, targets,
  package roots, subpaths, and exports.
- Exercise a nonpublishable source-level consumer of the staged module. Plan
  044 owns the real package export and once-packed consumer.
- Run `bun run verify`, Deno real-tool/target jobs, and a Plan 042
  implementation receipt on the exact implementation head. Authenticate the
  immutable freeze receipt separately; do not weaken its research-only scope.
- The Plan 042 receipt and certificate record the content-addressed source
  origin of their policy, expected claims, verifier, pinned tool provisioner,
  and workflow. That is ancestry-pinned accidental-drift protection, not an
  independently protected certifier. A separately reviewed protected workflow
  or app with an externally pinned verifier is required before claiming
  independent certification authority.

## Stop conditions

Stop if the implementation must auto-download an unobserved runtime, infer a
Deno/denort relation, bypass offline policy, translate interruption, preserve a
legacy alias, or add any deferred Deno operation.

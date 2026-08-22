# Plan 041: Implement the frozen Bun executable lane

## Status

- Priority: P1 provider implementation
- Effort: L
- Risk: HIGH target identity, selected-tool authority, and publication
- Depends on: Plan 039
- Status: DONE
- Publication authority: NONE

## Authority and objective

Stage only `effect-build-bun/CompileExecutable` and its future namespace-only
root re-export as frozen in `research/post-0.3/freeze/SURFACE.json`. Keep the
released export map unchanged until Plan 044 performs the coordinated cut.
Every released 0.3 identity follows its exact disposition in
`research/post-0.3/freeze/MIGRATION.json`.

The admitted operations are selected-command `compileExecutable` and
`compileExecutableMatrix`. They retain Bun-runtime-specific inputs, targets,
diagnostics, and artifacts. The matrix adopts Plan 039's ordered independent
cell report; it does not retain the 0.3 aggregate error shape.

## Required implementation

1. Preserve one selected Bun command for the Layer lifetime using
   `Author/Tool`; explicit absolute path wins, otherwise use one deterministic
   PATH search. Reauthenticate content at every launch.
2. Preserve Bun project configuration and environment behavior. No raw argv,
   install, retry, alternate executable, or fallback is public.
3. Route scalar output through `Author/Executable`: same-parent staging,
   target/native/runtime inspection, optional digest, and atomic rename.
4. Support the exact Bun version, provider host, and target cells listed in
   `SURFACE.json` only after exact executable receipts contribute their
   concrete admission keys to immutable provider policy. The frozen
   reviewed-key set is empty and observed coordinates cannot self-admit.
   Reject every other coordinate before output mutation unless
   the sole refusal is `SupportUnknown` and the caller explicitly selects the
   frozen untested-version override; holes, missing or indeterminate
   capabilities, relations, peers, identity replacement, and denied
   coordinates remain blocked.
5. Build `compileExecutableMatrix` solely by invoking the admitted scalar once
   per started cell under the frozen Matrix laws.
6. Prepare the flat 0.3 root API, `withJavaScriptBundle`, bundle errors, and old
   aliases for the exact `MIGRATION.json` deletion set. Do not remove or add a
   public delegate before Plan 044.

Bun host Build/compile mode, Transpiler, scan, direct-output build, command
build/watch, HTML/full-stack modes, and portable profiles are explicitly
deferred. Do not hide them behind `Options` or an experimental escape hatch.

## Tests and certification

- Preserve and restamp scalar target, real-tool, project-config, diagnostics,
  interruption, staging-cleanup, replacement, digest, and execution tests.
- Test the new matrix report for ordering, bounded concurrency, typed cell
  failure, Cause preservation, queued-cell suppression, and durable commits.
- Verify the exact foreign-target table with an independent binary oracle.
- Add negative root/subpath/export and unadmitted-version/host/target tests.
- Exercise a nonpublishable source-level consumer of the staged module. Plan
  044 owns the real package export and once-packed consumer.
- Run `bun run verify`, Bun real-tool/target jobs, and a Plan 041
  implementation receipt on the exact implementation head. Authenticate the
  immutable freeze receipt separately; do not weaken its research-only scope.

## Stop conditions

Stop on target ambiguity, content replacement, inability to preserve
interruption, non-atomic publication, a need for hidden fallback, or any demand
to add a deferred Bun operation. Change the frozen surface explicitly instead
of silently widening this plan.

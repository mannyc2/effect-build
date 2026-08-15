# Plan 029: Preserve interruption through the Bun bundle continuation

## Status

- Priority: P0
- Effort: S
- Risk: HIGH correctness, small diff
- Depends on: 027
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Problem and invariant

`packages/effect-build-bun/src/Bundle.ts::makeService` currently calls:

```ts
(main) => Effect.result(use(main))
```

then `Effect.fromResult`. On Effect rc.108 a cause combining caller failure and
interruption becomes `Result.Failure` with the interrupt component gone.
`CompileExecutableMatrix.captureCellResult` exists because generic capture is
not correct for this case.

The operation must map only the three core JavaScript-bundle error classes to
Bun errors, preserve arbitrary caller `E` by identity, and preserve every
Cause interruptor. Cleanup still runs on success, typed failure, defect, and
interruption.

## Scope

- `packages/effect-build-bun/src/Bundle.ts`
- `test/unit/bun-bundle.test.ts`
- `typetest/bun-provider.tst.ts` if environment/error assertions need updating
- `test/architecture/import-boundaries.test.ts` only if an ownership assertion
  is necessary
- this plan and `plans/README.md`

## Steps

1. Add deterministic red tests using `Cause.combine(Cause.fail(...),
   Cause.interrupt(...))`, `Fiber`, `Deferred`/`Latch`, and a fake Bun command.
   Assert the exit retains both the user failure and interruptor and that the
   owned temp root/context cleanup completes. Add a user error with the same
   `_tag` as a Bun/core error and assert it passes through unchanged.

2. Remove the `Effect.result`/`Effect.fromResult` round trip. Structure the
   owned producer effect so identity-safe `catchIf` guards map only
   `JavaScriptBundle.InvalidJavaScriptBundle`,
   `JavaScriptBundleAccessFailed`, and
   `JavaScriptBundleTemporaryDirectoryFailed` before or outside the arbitrary
   caller effect. Never use broad `catchTags` over `use(main)`.

3. Retain `Effect.fn("Bun.withJavaScriptBundle")`; do not add a public error
   envelope, custom monad, or second liveness wrapper.

4. Verify:

   ```sh
   bun run build
   bun x vitest run test/unit/bun-bundle.test.ts test/unit/bun-node-sea-pipeline.test.ts
   bun run test:types
   bun run verify
   bun run verify:effect
   git diff --check
   ```

   Expected: mixed cause is still mixed at both Effect endpoints; ordinary
   success/errors and bundle cleanup tests remain green.

## STOP conditions

- the fix requires catching caller errors by `_tag`;
- interruption appears in `BunBundleError`;
- cleanup becomes detached/forked or unawaited.

## Maintenance / compression ledger

Deletes the parallel Result representation of arbitrary Effect completion.
Adds no public state.

## Receipt

- **Implementation source SHA**:
  `86b9dd2f8fad14c23007c23e6059457cde642dbd`.
- The focused test was added first. Against the old implementation it retained
  the exact caller failure but failed with `expected [] to include 29029`,
  proving that `Effect.result` had erased the sibling interruptor.
- The callback is now captured as a full `Exit` inside the owned bundle scope,
  cleanup completes, and the same Exit is replayed directly. A gated
  Fiber/Deferred/Latch test proves the bundle exists while the callback is
  live, then retains the identical caller failure plus interruptor `29029` and
  proves the owned path is removed.
- Installed Effect `4.0.0-rc.108` source confirmed that `Exit` is yieldable and
  that `catchIf`/`mapError` may select one Fail from a mixed cause. Producer-
  owned core failures are therefore mapped outside the isolated caller Exit
  with identity-safe branded guards plus `Cause.map`/`Effect.failCause`, which
  preserves Die and Interrupt reasons. Existing plain-tag and genuine-core-
  error caller collision tests remain green and reference-identical.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). `bun run build` passed;
  the focused Bun bundle/Node SEA run passed 27 tests; and `bun run test:types`
  passed five files.
- Final `bun run verify` passed 183 unit tests with one intentional skip,
  14/14 once-packed consumers, 41 architecture tests, lint, and formatting.
  Final `bun run verify:effect` passed both `4.0.0-beta.104` and
  `4.0.0-rc.108`, each with 183 unit tests, one intentional skip, and 14/14
  packed consumers.
- `git diff --check` passed. The implementation changed only `Bundle.ts` and
  its focused unit test, and the worktree was clean immediately after the
  source commit. This receipt and README status are plan-only evidence.

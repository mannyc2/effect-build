# Plan 030: Make scalar executable input preflight total

> This is the only intentional public request-behavior tightening in the
> correctness program. It preserves valid call shapes and result behavior.

## Status

- Priority: P0
- Effort: M
- Risk: MEDIUM public behavior
- Depends on: 027; may run after 028
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

## Problem and invariant

`CompilerEngine.ts` already has total matrix input validation around lines
132-264, including `digest`. The scalar path near lines 374-389 validates
target/options but forwards `entrypoint`, `outfile`, `cwd`, and `digest`
directly. Existing tests prove `digest: "yes"` is silently treated as false.

After this plan, scalar and each matrix cell use one canonical field decoder.
Invalid runtime input fails before filesystem/tool execution with the existing
provider-attributed `InvalidDriverOptions`; all issues are deterministic and
ordered. Explicit `undefined` remains rejected wherever matrix behavior already
rejects it.

## Scope

- `packages/effect-build/src/standalone/internal/CompilerEngine.ts`
- `packages/effect-build/src/standalone/BuildError.ts` only if existing issue
  types cannot express scalar fields; do not add a new public error class
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-matrix.test.ts`
- `typetest/standalone-contract.tst.ts`
- `docs/api.md`, `docs/errors.md`, root/provider READMEs as needed
- `test/architecture/docs-contract.test.ts`
- this plan and `plans/README.md`

## Steps

1. Characterize scalar invalid values for: nonobject/null/array input, unknown
   fields, missing/empty/nonstring `entrypoint` and `outfile`, invalid `cwd`,
   invalid `digest`, invalid target, and provider-specific options. Assert zero
   probe/spawn/filesystem side effects.

2. Extract or parameterize one package-private total decoder used by scalar and
   matrix preflight. It may use `Result`; do not create another Valid/Invalid
   ADT or parse Schema pretty text. Preserve the current finite field/reason
   issue representation and deterministic field order.

3. Keep target and provider-options decoding provider-owned. Scalar uses the
   same prepared-cell representation as matrix after decode; do not introduce a
   second public Request or Plan type.

4. Add release notes/docs saying malformed untyped scalar inputs that were
   previously ignored now fail before tool discovery/execution. Valid TypeScript
   callers are source-compatible.

5. Verify:

   ```sh
   bun run build
   bun x vitest run test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-matrix.test.ts
   bun run test:types
   bun run test:architecture
   bun run verify
   bun run verify:effect
   git diff --check
   ```

## STOP conditions

- a valid current scalar call changes argv, destination, artifact, or cleanup;
- error ordering differs between scalar and a one-cell matrix without a named
  reason;
- implementation adds a parallel request DTO.

## Maintenance / compression ledger

Replaces scalar raw forwarding plus matrix decoding with one decoder/prepared
cell path. New behavior is only the rejection of invalid runtime values.

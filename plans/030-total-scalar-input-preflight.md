# Plan 030: Make scalar executable input preflight total

> This is the only intentional public request-behavior tightening in the
> correctness program. It preserves valid call shapes and result behavior.

## Status

- Priority: P0
- Effort: M
- Risk: MEDIUM public behavior
- Depends on: 027; may run after 028
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

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

Replaces scalar raw forwarding and duplicate common-field validation with
shared field decoders feeding the existing prepared-cell path. New behavior is
only the rejection of invalid runtime values.

## Receipt

- **Implementation source SHA**:
  `22a28ce68c8662686c531ff89cb3b61b35b45a2a`.
- The focused table was added first. Against the old scalar path, the null case
  defected with `TypeError: Cannot read properties of null`, and the combined
  common-field case returned the provider-options error instead of the first
  `entrypoint` issue. The red run had two failures while the other 65 focused
  tests stayed green.
- Scalar preflight now accepts `unknown`, rejects nonobject/null/array input
  and unknown own fields, and decodes `entrypoint`, `outfile`, target, own
  `cwd`, own `digest`, and provider options in deterministic order. Shared
  package-private `Result` field decoders also serve matrix preflight; scalar
  and matrix both assemble the existing prepared-cell representation. No
  request DTO, public error, export, package edge, or compatibility path was
  added. Matrix excess-key tolerance and existing issue order remain pinned.
- Invalid targets retain the existing `TargetUnsupported` shape and run before
  provider-option evaluation. Provider-option failures retain the adapter's
  exact existing `InvalidDriverOptions` instance and reason. The only public
  behavior change is rejection of malformed untyped fields that were formerly
  forwarded or ignored; valid TypeScript callers and successful argv,
  destination, Artifact, project-config, environment, and cleanup behavior are
  unchanged.
- A direct `makeCompilerService` harness with an injected discovered tool and
  counted FileSystem/spawner services covers 22 malformed shapes and proves
  zero selected-tool access, filesystem calls, rendering, child starts, or
  output staging. This is the truthful zero-probe seam because discovery is
  structurally absent. Fresh public Bun and Deno Layers necessarily perform
  their one selection/probe before the service sees the request; dedicated
  tests prove that boundary is probe-only with no compile/staging/output. This
  explicitly reconciles the plan's broader “before tool discovery” wording.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). `bun run build` passed;
  the focused Bun/Deno/matrix run passed 69 tests; `bun run test:types` passed
  five files; and `bun run test:architecture` passed 41 tests.
- Final `bun run verify` passed 187 unit tests with one intentional skip,
  14/14 once-packed consumers, 41 architecture tests, lint, and formatting.
  Final `bun run verify:effect` passed both `4.0.0-beta.104` and
  `4.0.0-rc.108`, each with 187 unit tests, one intentional skip, and 14/14
  packed consumers.
- Exact-SHA CI run `31861576129` completed successfully at the implementation
  SHA. All twelve jobs passed: quality `94955806642`, Effect beta.104
  `94955806668`, Deno target support `94955806670`, Windows publication
  `94955806676`, Bun target support `94955806680`, esbuild `94955806688`, macOS
  publication `94955806693`, bun-bundle `94955806702`, Ubuntu publication
  `94955806705`, node-sea `94955806707`, Effect rc.108 `94955806776`, and
  real-tools `94955806792`.
- `git diff --check` and formatting passed. The source commit changed only the
  nine files authorized by Plan 030, and the worktree was clean immediately
  after it. This receipt and README status are plan-only evidence.

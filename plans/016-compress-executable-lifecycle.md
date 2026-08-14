# Plan 016: Compress the executable lifecycle behind one validated publication boundary

> **Executor instructions**: Follow this plan step by step. This is a
> behavior-preserving internal refactor plus two pre-existing correctness
> corrections. Write characterization/failing tests first. Preserve the exact
> public Bun/Deno scalar and matrix API, scalar runtime-validation boundary,
> matrix policy, and Artifact wire shape. Do not begin esbuild or Node SEA work
> here. Run each Bun command and confirm its expected outcome before moving on.
>
> **Drift check (run first)**:
>
> ```sh
> git merge-base --is-ancestor e4257ccc84db70a6966c163700c9423659f9a4fc HEAD
> test -f plans/015-widen-effect-v4-compatibility.md
> rg -q '^\| 015 \|.*\| DONE' plans/README.md
> git diff --stat e4257cc..HEAD -- \
>   src test docs/architecture.md tooling/public-api.json package.json pnpm-lock.yaml
> git status --short
> bun run check
> bun run test:unit
> bun run build && bun run test:architecture
> ```
>
> Expected: the planning baseline is an ancestor; Plan 015 is `DONE`; its exact
> Effect/platform upgrade is present;
> the public API allowlist is unchanged; all three Bun gates pass; and every
> dirty file is understood. The planning-time worktree already had a modified
> `plans/README.md` and untracked Plan 015. Do not discard, overwrite, stage, or
> reformat unrelated work. If Plan 015 changed any API named below, reconcile
> the excerpts before proceeding and stop on a semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED overall; HIGH around rename/interruption semantics
- **Depends on**: `plans/015-widen-effect-v4-compatibility.md`
- **Category**: correctness / tech debt / test coverage / docs
- **Planned at**: commit `e4257cc`, 2026-08-13
- **Goal kind**: semantic compression; no public feature growth

## Why this matters

The current 509-line engine already implements the correct high-level order,
but that order is held only in one long control-flow block. A second native
executable producer could therefore bypass validation or fork the lifecycle.
At the same time, adding a full family of prepared/candidate/validated/published
classes would duplicate `PreparedCell` and `Artifact`. The only state split
earned here replaces the weaker commit-bearing `AtomicOutput`; it does not sit
beside it.

This plan replaces the existing commit-bearing `AtomicOutput` with one
rent-paying producer state: an adapter receives compiler-semantic input and
one opaque staged path, while the lifecycle owner privately retains the final
destination and rename authority. One validation-and-publication control-flow
owner performs the irreversible transition; a branded `Validated` wrapper is
rejected because it would have no independent typed consumer. It also removes the peer runner/service
representation, narrows internal cell errors to reachable variants, fixes fat
Mach-O endianness, and makes publication's irreversible interruption boundary
truthful. It intentionally does **not** strengthen scalar runtime preflight;
that would be a public behavior decision, not a refactor.

## Fixed behavior contract

All of these must remain true:

- Public runtime and declaration exports stay byte-for-byte equivalent to
  `tooling/public-api.json` and `test/architecture/public-api.test.ts`.
- Scalar validates runtime target and provider options before staging. It keeps
  the existing typed-only boundary for entrypoint, outfile, cwd, and digest.
- Matrix still performs total whole-request preflight, bounded concurrency,
  ordered results, collect-all pure typed failures, independent commits, and no
  rollback.
- Tool discovery/probing remains Layer acquisition; it is never a matrix-cell
  failure.
- Compiler CLI argv/config/environment behavior is unchanged.
- Interruption before publication preserves the prior destination and reaps
  children. Once rename starts, publication may linearize even if the waiting
  fiber observes interruption. No rollback or publish-mode option is added.
- A successful public result remains exactly the existing provider-correlated
  `Artifact { path, bytes, digest?, target, tool }`.

## Current state and verified excerpts

### One engine block owns every stage

`src/standalone/internal/CompilerEngine.ts:337-423` currently renders argv,
runs the child, stats and inspects the staged file, hashes it, commits it, and
constructs the Artifact. The load-bearing tail is:

```ts
const target = yield* inspectNativeExecutableFile(fileSystem, output.staged, bytes)
// ... infer/match target and map OutputInvalid ...
const digest = cell.input.digest === true
  ? yield* fileSystem.readFile(output.staged).pipe(/* SHA-256 */)
  : undefined
yield* output.commit
return {
  path: output.destination,
  bytes,
  ...(digest === undefined ? {} : { digest }),
  target,
  tool: tool.artifactTool,
} satisfies ProviderArtifact<Name, SupportedTarget>
```

`AtomicOutput` currently owns both the scoped candidate paths and commit Effect
(`src/standalone/internal/AtomicOutput.ts:4-8,43-74`):

```ts
export interface AtomicOutput {
  readonly destination: string
  readonly staged: string
  readonly commit: Effect.Effect<void, OutputLocked | PublicationFailed>
}
```

The exposed `commit` means a wrapper alone would not make early publication
unrepresentable. Replace this representation; do not place a new wrapper beside
it. The producer-facing `ExecutableCandidate` exposes only its scoped `staged`
path behind a module-private constructor and opaque identity. The same
lifecycle module privately retains destination, rename capability, and mode/
suffix policy in an identity table. `validateAndPublishExecutable` is the only
code that can retrieve/run the hidden rename after all checks. It returns a minimal
post-commit `ExecutableFile<Target> { path, bytes, digest?, target }`; the Bun/
Deno caller adds its provider `tool`, while Plan 018's named Node SEA caller adds
its exact stage tuple. There is no public state type, generic result callback,
`ValidatedExecutable` peer, or `PublishedExecutable` class.

The current adapter can see final `input.outfile` even though it normally
writes `stagedOutfile`. Plan 016 therefore also earns one prepared-executable
request:

```ts
interface PreparedExecutableRequest<ValidatedOptions, SupportedTarget> {
  readonly entrypoint: string
  readonly target?: SupportedTarget
  readonly options: ValidatedOptions
  readonly stagedOutfile: string
}
```

`CompilerAdapter.renderArgv` accepts exactly that value. It cannot see final
outfile, cwd, digest, candidate identity, or destination. The engine retains
cwd only for child execution and outfile/digest only for the lifecycle. This is
an internal request projection, not a public plan or peer public-input model.

### Scalar and matrix preparation do not share a total-validation invariant

Scalar copies common fields after validating only target/options
(`CompilerEngine.ts:426-452`):

```ts
const optionsValidation = yield* Effect.sync(() => adapter.validateOptions(input.options))
// ...
return yield* compilePreparedCell({
  input: {
    entrypoint: input.entrypoint,
    outfile: input.outfile,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.digest === undefined ? {} : { digest: input.digest }),
    options: optionsValidation.value,
  },
  // target selection
})
```

Matrix instead decodes all public fields at `CompilerEngine.ts:139-315` before
constructing cells. Preserve this distinction and correct
`docs/architecture.md:33-43` to say scalar preflights target/options, not that it
totally validates the scalar object. Do not add an `InvalidCompileInput` tag or
route common fields through `InvalidDriverOptions`.

### Runner and service are peers

`CompileExecutableMatrix.ts:70-81` defines `CompilerRunner`; `Driver.ts:17-31`
defines the same two methods as `CompilerService`. The runner's scalar input
omits the provider target parameter, and `CompilerEngine.ts:497-509` is only a
pass-through factory:

```ts
export const makeCompilerService = (...) => makeCompilerRunner(adapter, tool)
```

Use `CompilerService<Name, SupportedTarget, Options>` as the sole internal
capability. Rename the implementation factory to one canonical name and update
package-private tests. Do not change the provider `Context.Service` classes.

### Public matrix cell failures have unreachable internal variants

Discovery failures (`ToolNotFound`, `ToolProbeFailed`) occur during Layer
acquisition; target/options failures occur before prepared-cell execution. Yet
`CellFailure.error` is the full public `BuildError`. Define an internal
`CellExecutionError` union of exactly `ToolFailed | OutputMissing |
OutputInvalid | OutputLocked | PublicationFailed` for
`compilePreparedCell`/capture/fold typing. Preserve the public MatrixError schema
and wire contract in this plan; narrowing it is a later public compatibility
decision.

Keep the public schema/type declaration broad, but change
`makeMatrixFailedFor`'s package-private constructor input to the reachable union
so engine/test code cannot manufacture acquisition or preflight failures as
completed cell executions. The returned public `MatrixFailedFor` type remains
unchanged.

### Two correctness gaps are proven

1. `AtomicOutput.ts:65-71` exposes async rename. `CompilerEngine.ts:414-421`
   waits for it before returning Artifact, while `docs/architecture.md:70-76`
   says every interruption leaves the destination unchanged. An injected
   filesystem audit reproduced an interrupted Exit after destination
   replacement. The correct boundary is rename linearization.
2. `NativeExecutable.ts:106-121` reads a standard big-endian fat Mach-O magic
   through a little-endian integer, then chooses the wrong byte order for slice
   count/records. Add fixtures before correcting the selection.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run check` | exit 0, no diagnostics |
| Focused unit | `bun x vitest run test/unit/standalone-contract.test.ts test/unit/standalone-publication.test.ts test/unit/standalone-matrix.test.ts` | all runnable tests pass; one Windows-only skip is allowed |
| All unit | `bun run test:unit` | 89 existing tests plus new tests pass; only expected OS skip |
| Types | `bun run test:types` | TSTyche passes; public signatures unchanged |
| Architecture | `bun run build && bun run test:architecture` | build ignored `dist`, then exact exports/import boundaries/docs contracts pass |
| Full deterministic gate | `bun run verify` | type, unit, consumer, architecture, lint, and format-check pass |
| Real current-host tools | `test "$(bun --version)" = "1.3.9" && EFFECT_BUILD_DENO_VERSION="$(deno eval 'console.log(Deno.version.deno)')" bun run verify:real` | exact Bun baseline and locally observed Deno version drive current-host scalar evidence; pinned CI remains authoritative |
| Dirty scope | `git status --short` | only plan/source/test/doc files explicitly in scope are changed |

Use Bun as the command entry point. Do not run `pnpm install` in this plan
unless Plan 015 explicitly requires its own frozen-lock installation before it
is marked done.

## Effect conventions to match

- Keep source platform-neutral: use `FileSystem`, `Path`, `Crypto`, and
  `ChildProcessSpawner`; never import `node:*` or call `Effect.runPromise` under
  `src/`.
- Use `Effect.fn` for named stage functions when its trace name is meaningful
  and `Effect.gen` for sequential lifecycle logic.
- Resource acquisition/finalization belongs to Scope. Match
  `.agent-sources/effect/packages/tools/bundle/src/Rollup.ts:125-181`, which uses
  `Effect.fn`, `Effect.acquireRelease`, and `Effect.scoped`.
- Keep the installed Effect/platform family aligned at Plan 015's exact
  rc.108 baseline. Live rc.108 exposes `Schema.TaggedError`, not
  `Schema.TaggedErrorClass` (`.agent-sources/effect/packages/effect/src/Schema.ts:14488-14515`).
- Do not force schema classes onto internal scoped handles. A module-private
  branded interface/constructor removes the invalid transition without
  creating a serializable peer. Use `Schema.Class`/`TaggedClass` only for a
  durable decoded model with a real runtime consumer; add no new public error
  class here.

## Scope

**In scope** (only these files may be modified):

- `src/standalone/internal/CompilerEngine.ts`
- `src/standalone/internal/CompilerAdapter.ts` (narrow `renderArgv` and own the
  package-private reachable cell-error union)
- `src/standalone/internal/ExecutableLifecycle.ts` (create with the exact
  candidate/finalize symbols in Step 4)
- `src/standalone/internal/AtomicOutput.ts`
- `src/standalone/internal/NativeExecutable.ts`
- `src/standalone/CompileExecutableMatrix.ts`
- `src/standalone/Driver.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-publication.test.ts`
- `test/unit/standalone-matrix.test.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/architecture/import-boundaries.test.ts`
- `test/architecture/docs-contract.test.ts`
- `docs/architecture.md`
- `plans/README.md` (status only after completion)

**Out of scope**:

- `src/index.ts`, `src/Bun.ts`, `src/Deno.ts`, public Artifact/BuildError/
  MatrixError/Target schemas, and `tooling/public-api.json`.
- New scalar total preflight, new error tags, or public matrix schema narrowing.
- New provider targets, options, argv, discovery/probe behavior, or matrix
  failure policy.
- esbuild, Node SEA, dependencies, CI, release workflows, or package version.
- Public inspection/validation functions or lifecycle state exports.
- Generic protocols, executors, receipts, plans, snapshots, content stores,
  caching, rollback, fail-fast, or publish modes.

## Git workflow

- Suggested branch: `advisor/016-compress-executable-lifecycle`.
- Follow existing conventional commits, e.g.
  `refactor: isolate validated executable publication` and
  `fix: decode fat Mach-O headers with declared endianness`.
- Keep characterization tests and implementation in reviewable logical
  commits. Do not push, publish, tag, or open a PR without operator instruction.

## Steps

### Step 1: Freeze current public behavior and expose the two correctness gaps

In `test/unit/standalone-bun.test.ts` and
`test/unit/standalone-deno.test.ts`, extend the shared provider contract with
runtime-JavaScript characterization showing:

- non-boolean `digest` retains current behavior (`digest === true` is the only
  hashing request), rather than adding a typed error;
- invalid target/options still fail before staging/compile; and
- provider entrypoint/cwd/config/environment pass-through is unchanged.

In `test/unit/standalone-publication.test.ts`, build a deterministic injected
`FileSystem` rename barrier. Test both sides of the point of no return:

1. interruption before rename begins keeps the old destination; and
2. if rename has already replaced the destination before the Effect callback is
   observed, the fiber may be interrupted while the new destination remains.

Do not use timing sleeps as the oracle; coordinate with deferred/latch Effects
or the existing fake platform service. The test must not claim an Artifact was
returned in case 2.

In `test/unit/standalone-contract.test.ts`, add byte fixtures for:

- standard big-endian `FAT_MAGIC` (`CA FE BA BE`) with one x64 slice;
- byte-swapped `FAT_CIGAM` with one aarch64 slice;
- a two-slice universal x64+aarch64 binary, which retains the existing explicit
  `ambiguous-fat-architecture` rejection; and
- a fat binary with only unknown CPU types, which is rejected.

**Verify**:

```sh
bun x vitest run test/unit/standalone-contract.test.ts \
  test/unit/standalone-publication.test.ts \
  test/unit/standalone-bun.test.ts \
  test/unit/standalone-deno.test.ts
```

Expected: scalar and both rename-linearization characterizations pass on
current code; the standard fat Mach-O cases fail for the precise asserted
byte-order reason, not from fixture setup. The rename tests freeze observed
behavior before ownership changes; they are not red tests.

### Step 2: Correct fat Mach-O byte-order selection

In `NativeExecutable.ts`, name both fat magic encodings from their actual first
four bytes and decode the count/entries using the corresponding byte order.
Keep the current bounded count/range checks and the invariant that the
observation must reduce to exactly one recognized architecture. Do not model a
universal multi-target Artifact in this plan.

**Verify**:

```sh
bun x vitest run test/unit/standalone-contract.test.ts
```

Expected: all old ranged ELF/PE/Mach-O tests plus the four new fat cases pass.

### Step 3: Collapse `CompilerRunner` into `CompilerService`

Delete the `CompilerRunner` interface from `CompileExecutableMatrix.ts` and
remove its imports. Make one engine factory return the existing
`CompilerService<Name, SupportedTarget, Options>` directly. Keep the public
provider service tags and methods unchanged. Update unit helpers to import the
one factory/type instead of exercising the wider peer.

Do not move matrix input/error types into `Driver.ts`; this step deletes a peer,
not creates another aggregation module.

**Verify**:

```sh
! rg 'CompilerRunner|makeCompilerRunner' src test
bun run check
bun x vitest run test/unit/standalone-matrix.test.ts \
  test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
```

Expected: the ripgrep command has no matches, typecheck passes, and scalar/
matrix behavior stays green.

### Step 4: Introduce the prepared request and sole candidate owner

Move the sibling-staging/rename implementation from `AtomicOutput.ts` into
`ExecutableLifecycle.ts` (delete `AtomicOutput.ts` once imports are migrated),
with package-private operations whose conceptual shape is:

```ts
type CellExecutionError =
  | ToolFailed
  | OutputMissing
  | OutputInvalid
  | OutputLocked
  | PublicationFailed

interface ExecutableCandidate {
  readonly staged: string
  readonly [CandidateTypeId]: typeof CandidateTypeId
}

interface ExecutableFile<Target> {
  readonly path: string
  readonly bytes: number
  readonly target: Target
  readonly digest?: `sha256:${string}`
}

resolveExecutableDestination(
  path,
  { outfile, cwd? },
): string
acquireExecutableCandidate(
  ...,
  { destination, executableSuffix? },
): Effect<ExecutableCandidate, PublicationFailed, Scope>
inspectNativeExecutableFile(
  fileSystem,
  path,
  bytes,
): Effect<NativeExecutableObservation, NativeExecutableInspectionError>
validateAndPublishExecutable(
  fileSystem,
  crypto,
  candidate,
  {
    digest: boolean,
    resolveTarget: (observation: NativeExecutableObservation) => Result<Target, string>,
  },
): Effect<ExecutableFile<Target>, OutputMissing | OutputInvalid | OutputLocked | PublicationFailed>
```

The exact generic parameters may follow the repository style, but these
ownership rules are mandatory:

- The value is constructed only after existence, regular-file, executable-bit,
  safe byte-count, ranged native inspection, canonical target match, and
  optional SHA-256 have succeeded.
- `ExecutableCandidate` **replaces**, rather than wraps, `AtomicOutput`. It has
  no destination, `commit`, rename Effect, or public constructor. Destination,
  publication capability, and executable-suffix/mode policy are stored in a
  module-private identity table, not on the returned value. Registration is
  one-shot: `validateAndPublishExecutable` atomically removes the identity
  before its first validation/read/rename attempt, and the candidate Scope
  finalizer removes it if never consumed. Thus a copied/stale handle cannot
  retry publication after failure or Scope close. Missing identity is an
  internal defect.
- `resolveExecutableDestination` is one package-private pure path-policy owner:
  `path.normalize(path.resolve(cwd ?? "", outfile))`. Scalar/matrix and Node SEA
  call it once, perform any operation-specific preflight on that absolute
  destination, then pass the resolved value to candidate acquisition. Candidate
  acquisition must not resolve cwd/outfile again. Successful
  `ExecutableFile.path` is exactly that retained destination.
- Change `CompilerAdapter.renderArgv` to accept only the prepared executable
  request above. Tests prove final outfile, cwd, digest, and destination are not
  adapter-visible; both adapters render only `stagedOutfile`.
- Only `validateAndPublishExecutable` can reach `fileSystem.rename`. A raw
  candidate cannot be committed, and a structurally forged candidate is
  rejected by the module-private identity lookup as an internal defect, not
  translated to a public build error. Do not add a branded local validated
  value: with no separately typed consumer it merely renames control flow.
- `resolveTarget` is the one narrow pure policy seam: current providers close
  over requested/default/provider-table matching; Plan 018 closes over exact
  equality with the selected Node target. It returns `Result`, performs no I/O,
  and is not a generic artifact/result projector or producer adapter.
- Publication returns only `ExecutableFile<Target>`. The compiler engine
  immediately projects it to the unchanged provider Artifact by adding `tool`.
  This exact common result also serves Plan 018 without changing the lifecycle
  API again.
- No new tagged state classes, schemas, services, public exports, or format-
  specific branches appear.
- Inspection I/O and target matching have one owner usable by the named Node
  SEA consumer in Plan 018. Export package-private
  `inspectNativeExecutableFile` from the lifecycle module; pure byte parsing
  remains in `NativeExecutable.ts`. Its exact error is
  `NativeExecutableInspectionError { path: string; reason: string }`.
  Publication maps it to `OutputInvalid`; selected-Node acquisition maps it to
  `NodeSeaProbeFailed`. It retains the existing bounded-range algorithm and
  exposes no candidate/publication authority.

Define `CellExecutionError` in package-private `CompilerAdapter.ts`, not the
root-exported `BuildError.ts`. Narrow `makeMatrixFailedFor`'s input to it; do not
narrow `CellFailure`, `MatrixFailed`, or their public schemas/types in this
plan. Add a compile-time test that acquisition/preflight errors are rejected at
the internal constructor while every reachable execution error remains
accepted.

Move the relevant code out of `compilePreparedCell` without changing rendered
argv, child cwd, staging, or adapter failure behavior. Project each cell plus
candidate into `PreparedExecutableRequest` immediately before `renderArgv`;
never pass `PreparedCompileInput` or the candidate object to an adapter. Type
`compilePreparedCell` with the reachable `CellExecutionError`, then widen only
at the existing public service boundary. The public `MatrixError` schema stays
untouched.

Update `test/architecture/import-boundaries.test.ts` so package-private
lifecycle modules cannot become public entrypoints and the lifecycle module
does not import provider adapters.

**Verify**:

```sh
bun run check
bun x vitest run test/unit/standalone-publication.test.ts \
  test/unit/standalone-matrix.test.ts
rg -n '\.commit' src/standalone/internal
rg -n 'fileSystem\.rename' src/standalone/internal
```

Expected: typecheck/tests pass; `.commit` has no matches; the only executable-
publication `fileSystem.rename` is inside `ExecutableLifecycle.ts`; compile-
time assertions prove `candidate.commit`, `candidate.destination`, and final
output fields on `PreparedExecutableRequest` are unavailable; deterministic
tests prove double finalize and finalize-after-Scope-close defect before file
or rename effects; provider success still returns the exact existing Artifact
shape.

### Step 5: Specify the point of no return and accurate scalar preflight

Update `docs/architecture.md` without changing the public API:

- describe scalar preflight as target/options validation and typed field trust;
- retain matrix total preflight as a distinct guarantee;
- state that failure/interruption **before publication begins** leaves the
  destination unchanged;
- define atomic rename as the linearization point and explain that once rename
  starts, an interrupting caller may observe interruption after the destination
  has committed; and
- preserve the no-rollback rule.

Do not add a public transaction, receipt, or interruption error result.

**Verify**:

```sh
bun run build && bun run test:architecture
rg -n 'lineariz|point of no return|target.*options' docs/architecture.md
```

Expected: docs contract tests positively require the scalar target/options
boundary and rename-linearization wording, and the new boundary is explicit.

### Step 6: Run full gates and check semantic compression

Run:

```sh
bun run verify
test "$(bun --version)" = "1.3.9"
EFFECT_BUILD_DENO_VERSION="$(deno eval 'console.log(Deno.version.deno)')" \
  bun run verify:real
git diff --check
git diff --stat e4257cc -- src test docs/architecture.md
git status --short
```

Expected: all deterministic and real current-host scalar gates pass; no
whitespace errors; no public manifest/export change; and no file outside scope
is modified. This local dynamic Deno version assertion records the selected
installed tool; it does not replace required pinned CI evidence.

Then update only Plan 016's status row in `plans/README.md` to `DONE` with a
one-line note of the green commands.

## Test plan

- Scalar runtime boundary: non-boolean digest and existing target/options
  preflight behavior through both provider contract suites.
- Native parsing: both fat endiannesses, ambiguous recognized slices, unknown
  slices.
- Publication: pre-rename interruption and post-linearization interruption
  using deterministic filesystem coordination.
- Lifecycle ordering: missing, non-file, non-executable, invalid native,
  mismatch, digest, raw candidate has no commit/destination capability,
  publication failure, stale/double-finalize defects, and successful provider/
  pipeline projections.
- Producer visibility: adapters receive only entrypoint/target/options/staged
  output; final outfile/cwd/digest cannot enter argv rendering.
- Matrix regressions: stable order, collect-all typed failures, defect sibling
  interruption, queued suppression, independent commits.
- Architecture/type regressions: exact exports and provider-narrowed signatures.

## Done criteria

- [x] Plan 015 is `DONE` and the Effect/platform family is aligned at its exact
      baseline.
- [x] `CompilerRunner` and `makeCompilerRunner` have no matches in `src/` or
      `test/`.
- [x] `AtomicOutput.commit` is gone; an opaque staged-path-only candidate
      replaces it; orchestrators may transiently preflight a resolved
      destination, but only lifecycle identity retains it with rename authority,
      and identity is consumed once/deleted on Scope close.
- [x] Adapters receive one prepared executable request with no final outfile,
      cwd, digest, or destination and render only the staged output path.
- [x] One `validateAndPublishExecutable` owner performs every file/native/
      target/digest check and alone reaches rename; no rent-free validated peer
      exists.
- [x] One package-private ranged file inspector is reused by lifecycle
      publication and exact selected-Node acquisition without exposing commit.
- [x] Publication returns the provider-neutral `ExecutableFile<Target>` used
      unchanged by current providers and Plan 018's named consumer.
- [x] Standard and byte-swapped fat Mach-O fixtures pass; ambiguous universal
      output remains explicitly rejected.
- [x] Scalar runtime preflight is preserved and accurately documented.
- [x] Publication's rename linearization contract is deterministic and tested.
- [x] Public export allowlists, Artifact, BuildError, MatrixError, Bun, and Deno
      declarations are unchanged.
- [x] `bun run verify` and `bun run verify:real` exit 0.
- [x] No out-of-scope or pre-existing dirty work was modified.

## STOP conditions

Stop and report; do not improvise if:

- Plan 015 is not done or leaves Effect/platform packages misaligned.
- Correct typing requires a new public error, Artifact field, export, or schema
  change.
- Scalar characterization contradicts the documented audit evidence; do not
  silently add total scalar preflight.
- The rename barrier cannot deterministically distinguish pre-commit from
  post-linearization interruption using platform service injection.
- Correcting fat Mach-O requires representing multiple targets rather than
  retaining the explicit ambiguity rejection.
- The lifecycle cannot be shared without provider-specific imports or another
  candidate/validated/published peer type; the prepared request is allowed only
  as the strict adapter projection defined above.
- An out-of-scope file must change or a verification command fails twice after
  a reasonable correction.

## Maintenance notes

- Reviewers should reject any reintroduction of a commit-bearing producer
  handle; producer code may receive candidate paths, never rename authority.
- A future producer may reuse file validation/publication, but it may not force
  its execution/options into a generic adapter.
- If the public scalar boundary is ever made total, do it as a separate public
  compatibility plan with a new explicit error decision and type/runtime tests.
- If universal macOS artifacts become a real output requirement, introduce a
  deliberate representation then; do not weaken `ambiguous-fat-architecture`
  incidentally.

## Compression ledger

| Accepted change | Removes | Does not add |
|---|---|---|
| One `CompilerService` representation | peer `CompilerRunner`, pass-through factory, target-width mismatch | public service or method |
| Prepared executable request | adapter visibility of final outfile/digest/cwd and direct-destination write path | public plan or duplicate compile input |
| Opaque candidate plus single lifecycle control flow | exposed `AtomicOutput.commit`; adapter/direct commit-before-validation transitions | validated/published class family |
| Reachable cell execution error | four impossible internal acquisition/preflight variants | new public error tag |
| One file-level validation owner | duplicated future Bun/Deno/Node SEA validation workflow | inspector service/protocol |
| Truthful rename boundary | impossible guarantee and rollback pressure | rollback/publish switch |

The expected source-line outcome is near-neutral movement, not a quota. The
machine-checkable compression is fewer representations, one commit owner, and
one native file-validation workflow while every public test stays green.

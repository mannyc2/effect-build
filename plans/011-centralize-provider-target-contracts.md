# Plan 011: Centralize provider target authority behind the public API

> **Executor instructions**: Follow this plan in order. Add the contract tests
> before changing production types. Run every verification command and confirm
> the expected result before continuing. This plan is package-private
> preparation: do not export provider Target schemas, narrow the scalar public
> signature, or change runtime-key manifests before Plan 013 proves the tables
> and Plan 014 performs the hard cut. If a STOP
> condition occurs, stop and report instead of inventing another target model.
> When complete, update only Plan 011's status row in `plans/README.md`, unless a
> coordinating reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```sh
> git merge-base --is-ancestor eb2995c2597f6765302de2e223b643f8b9946fde HEAD
> git status --short
> git diff --stat eb2995c2597f6765302de2e223b643f8b9946fde..HEAD -- \
>   src test typetest scripts tooling docs package.json pnpm-lock.yaml
> printf '%s  %s\n' \
>   cb98345aebe7c8aa2ccae95b0da96dbfd13438c0ce69906471157a499104731f src/standalone/internal/CompilerEngine.ts \
>   4b329665484886db23ae45cbb0ec268f92932f772aba179a782c268a22998ad4 src/standalone/internal/NativeExecutable.ts \
>   | shasum -a 256 -c -
> pnpm check
> pnpm test:types
> pnpm test:unit
> ```
>
> Expected at the planning baseline: the final release-preparation commit is an
> ancestor; only plan files are dirty; both native-inspection checks print
> `OK`; `pnpm check` and `pnpm test:types` pass; and `pnpm test:unit` reports
> 46 passed tests plus one Windows-only skip. Review later commits rather than
> assuming they are safe. Any unexplained mismatch with the current-state
> excerpts below is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/010-hard-cut-public-api-and-delete-managed-proof.md`
- **Category**: architecture / internal types / correctness / tests
- **Planned at**: commit `eb2995c`, 2026-08-12
- **Effect baseline**: `effect@4.0.0-beta.107`; use the installed source under
  `node_modules/effect/src/`, not API names from a later Effect release

## Why this matters

The root target union, each adapter's target map, `supportedTargets`, and the
engine's string parser currently represent the same facts independently. That
lets TypeScript accept `Deno.compileExecutable({ target:
"linux-x64-musl" })`, forces casts around `Object.keys` and lookup, and makes a
future matrix generic over `string` instead of over the selected compiler's
actual capability set.

After this plan, target meaning and compiler support each have one authority:

1. a package-private canonical target catalog owns OS, architecture, optional
   ABI, and executable suffix; and
2. one package-private pure target table per compiler owns canonical target to
   native CLI token and can later be consumed by both its adapter and the root
   serializable Artifact schema without importing compiler execution code.

Everything else inside the engine is derived. The root `Target.Target` schema
remains the current public cross-compiler vocabulary during this plan. The
provider schemas/types remain package-private until Plan 013 supplies pinned
real evidence and Plan 014 publishes them atomically with narrowed scalar and
matrix signatures.

The only public type/schema correction in this internal plan is the
`TargetUnsupported.requested` field widening from valid `Target` to `string`, so
constructing the typed error is total for an unknown target. Provider operation
signatures, provider declarations, runtime keys, and the root Artifact schema
stay unchanged.

## Contract fixed by this plan

### Canonical target catalog

The canonical names remain exactly:

| Canonical target | OS | Architecture | ABI | Final matrix suffix |
|---|---|---|---|---|
| `macos-x64` | macOS | x64 | — | none |
| `macos-aarch64` | macOS | aarch64 | — | none |
| `linux-x64-gnu` | Linux | x64 | GNU | none |
| `linux-x64-musl` | Linux | x64 | musl | none |
| `linux-aarch64-gnu` | Linux | aarch64 | GNU | none |
| `linux-aarch64-musl` | Linux | aarch64 | musl | none |
| `windows-x64` | Windows | x64 | — | `.exe` |
| `windows-aarch64` | Windows | aarch64 | — | `.exe` |

Do not infer these facts by splitting or prefix-testing a string after the
catalog is introduced. A single audited `Object.keys` assertion inside the
catalog/table constructor is acceptable because TypeScript cannot preserve
literal object keys through `Object.keys`; repeated assertions in adapters or
the engine are not.

### Provider target tables

The exact provider projections are:

| Target | Bun token | Deno token |
|---|---|---|
| `macos-x64` | `bun-darwin-x64` | `x86_64-apple-darwin` |
| `macos-aarch64` | `bun-darwin-arm64` | `aarch64-apple-darwin` |
| `linux-x64-gnu` | `bun-linux-x64` | `x86_64-unknown-linux-gnu` |
| `linux-x64-musl` | `bun-linux-x64-musl` | unsupported |
| `linux-aarch64-gnu` | `bun-linux-arm64` | `aarch64-unknown-linux-gnu` |
| `linux-aarch64-musl` | `bun-linux-arm64-musl` | unsupported |
| `windows-x64` | `bun-windows-x64` | `x86_64-pc-windows-msvc` |
| `windows-aarch64` | `bun-windows-arm64` | `aarch64-pc-windows-msvc` |

Each provider table must derive all of the following from its keys and values:

- the provider's `Schema.Literals` runtime schema;
- the provider `Target` TypeScript type;
- the ordered `.literals` list used by callers and later matrix tests;
- runtime membership and resolution of untrusted strings;
- native CLI token lookup; and
- the `TargetUnsupported.available` values.

There is no separate `supportedTargets` property or hand-maintained supported
target array after the cut.

### Final type correlation reserved for Plan 014

The final public shape is fixed here for downstream plans, but must not be
exported by this plan:

```ts
import * as Bun from "effect-build/bun"
import * as Deno from "effect-build/deno"

Bun.Target.literals  // all eight canonical targets
Deno.Target.literals // six targets; neither musl target appears

const bun: Bun.CompileExecutableInput = {
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "linux-x64-musl"
}

const deno: Deno.CompileExecutableInput = {
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  target: "linux-x64-gnu"
}
```

`Deno.CompileExecutableInput` rejects both musl targets at compile time. Bun
accepts them. The success types are provider-specialized artifacts whose
`target` and `tool.name` fields are narrowed to the selected provider. Do not
expose generic call signatures such as `<T, string>`; shared generics are
package implementation details hidden by the concrete Bun/Deno aliases.

Keep one root runtime `Artifact.Artifact` schema as the serializable
cross-provider envelope. Plan 011 may define package-private target/tool
projections for the engine and matrix work, but it must not change the root
Artifact declaration or provider declaration files. Plan 014 strengthens the
one root runtime schema to a discriminated Bun/Deno union derived from the
proven tables and exposes type-only `Bun.Artifact` / `Deno.Artifact` aliases.

### Runtime-invalid input

TypeScript narrowing is not runtime validation. JavaScript, decoded config,
and unsafe casts can still supply an unknown value. `TargetUnsupported` must
remain a typed `BuildError`, but its `requested` and `available` schema fields
must not make error construction throw. Change only `requested` to
`Schema.String`; `available` remains `Schema.Array(Target.Target)` because it
is always derived canonical vocabulary. Non-string runtime targets must also
become a typed failure before staging or rendering; they must not become
defects.

Keep this within the existing tag: for a string, `requested` is the exact
value; for a non-string use a total, non-user-code-invoking descriptor such as
`<non-string:null>`, `<non-string:array>`, or
`<non-string:${typeof value}>`. Do not call `String(value)`, JSON serialization,
or a user object's `toString` while constructing the error, and do not add a
new BuildError tag solely for a runtime-unsafe caller.

### Omitted target on a Windows compiler host

Single compilation keeps its existing rule: the caller's final `outfile` is
exact, even when it has no `.exe` suffix. The compiler-visible staged basename
must nevertheless carry `.exe` when either the explicit target is Windows or
the probed compiler host is Windows and the target was omitted. Capture a
normalized compiler-host OS (`macos | linux | windows`) beside, not inside,
the public Artifact tool projection, and use the target catalog rather than
`startsWith("windows-")`.

After native inspection, resolve the observed canonical target back through the
selected provider table before constructing a provider-correlated internal
Artifact. This applies when the caller omitted `target` as well as when it was
explicit. A compiler that emits a canonical root target outside its own table
fails as `OutputInvalid`; it must not escape as a broad Artifact or require a
cast.

This fixes the minimal current-host Windows call without coupling the artifact
target to the runtime hosting the Effect program. The compiler reports its own
host; Node/Bun/Deno orchestration remains an independent axis. A representative
internal discovery result is `{ artifactTool: { name, version, path }, hostOs }`.
Returning an Artifact must project exactly `artifactTool`, never leak `hostOs`.

## Current state

- `src/standalone/Target.ts:3-15` independently lists the eight canonical
  strings but owns no metadata.
- `src/standalone/internal/BunAdapter.ts:7-16,40-50` owns a complete mapping,
  then reconstructs support with `Object.keys(targets) as Target[]`.
- `src/standalone/internal/DenoAdapter.ts:7-14,82-91` declares a
  `Partial<Record<Target, string>>`, widens its keys, and casts again for
  lookup. This is why a Deno musl target is currently type-correct.
- `src/standalone/internal/CompilerAdapter.ts:19-25` stores a second
  `supportedTargets` representation.
- `src/standalone/internal/CompilerEngine.ts:12-37` splits target strings with
  a tuple assertion to recover OS/architecture/ABI.
- `src/standalone/Driver.ts:6-18` accepts the broad root `Target` and returns a
  broad root `Artifact` for every compiler.
- `src/standalone/Artifact.ts:48-54` is the single runtime artifact schema and
  should remain the only one, but its independent tool/target fields currently
  decode the impossible Deno-plus-musl combination.
- `src/standalone/BuildError.ts:31-35` currently types unsupported requested
  values as the valid root Target schema, so an arbitrary runtime string can
  throw while the error object is being constructed.
- `src/standalone/internal/AtomicOutput.ts:24-28,47-50` detects Windows by
  prefix and only when a target was explicitly supplied.
- `tooling/public-api.json:3-5` and
  `test/architecture/public-api.test.ts:7-30` currently freeze three tool
  runtime keys; this plan intentionally leaves that freeze untouched.
- Installed `effect@4.0.0-beta.107` exposes `Schema.Literals(...).literals` and
  `.pick` at `node_modules/effect/src/Schema.ts:4904-4955`. Use
  `Context.Service` and `Schema.TaggedError<Self>()`, matching current source.

### Committed native-inspection baseline

The release commit was amended during this planning pass. Its final audited
form includes these green native-inspection changes:

| File | SHA-256 | Meaning to preserve |
|---|---|---|
| `src/standalone/internal/CompilerEngine.ts` | `cb98345aebe7c8aa2ccae95b0da96dbfd13438c0ce69906471157a499104731f` | reads bounded native-header ranges and maps inspection failures to `OutputInvalid` |
| `src/standalone/internal/NativeExecutable.ts` | `4b329665484886db23ae45cbb0ec268f92932f772aba179a782c268a22998ad4` | adds ranged/chunked ELF, Mach-O, and PE inspection while retaining `inspectNativeExecutable` |

Plan 011 necessarily edits `CompilerEngine.ts`; semantically merge target
catalog resolution into this ranged-reader version. Do not restore an earlier
version or reintroduce the one-megabyte-only assumption. `NativeExecutable.ts`
is outside this plan: preserve it byte-for-byte unless a later reviewed commit
changes it, in which case read the live version and re-run native-inspection
tests before proceeding. The content and behavior are the drift boundary.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm check` | exit 0, no diagnostics |
| Type contracts | `pnpm test:types` | one target file passes; all suppressions match |
| Focused units | `pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-publication.test.ts` | all non-host-specific tests pass |
| Packed surface | `pnpm test:consumer` | package builds; packed consumer verifies |
| Full deterministic gate | `pnpm verify` | exit 0 |
| Existing real lane | `pnpm verify:real` | Bun and Deno current-host builds pass with provisioned tools |

## Suggested executor toolkit

- Use the `effect-ts` skill if available, but treat the installed beta.107
  source as authoritative when the skill describes later v4 names.
- Use `recover-deterministic-architecture` to review that each target fact has
  one owner and that the change deletes representations rather than wrapping
  them.

## Scope

**Create:**

- `src/standalone/internal/TargetCatalog.ts`
- `src/standalone/internal/TargetTable.ts`
- `src/standalone/internal/BunTarget.ts`
- `src/standalone/internal/DenoTarget.ts`
- `src/standalone/internal/ProviderContract.ts` if a named package-private
  target/tool/artifact projection is clearer than keeping it in `TargetTable.ts`

**Modify:**

- `src/standalone/Target.ts`
- `src/standalone/BuildError.ts`
- `src/standalone/internal/CompilerAdapter.ts`
- `src/standalone/internal/CompilerEngine.ts`
- `src/standalone/internal/BunAdapter.ts`
- `src/standalone/internal/DenoAdapter.ts`
- `src/standalone/internal/AtomicOutput.ts`
- `src/standalone/internal/ToolDiscovery.ts`
- `src/Bun.ts`
- `src/Deno.ts`
- `test/fixtures/driver/fake-tool.mjs`
- `test/testkit/standaloneDriverContract.ts`
- `test/unit/standalone-contract.test.ts`
- `test/unit/standalone-bun.test.ts`
- `test/unit/standalone-deno.test.ts`
- `test/unit/standalone-publication.test.ts`
- `typetest/standalone-contract.tst.ts` only for the
  `TargetUnsupported.requested: string` correction and unchanged provider
  operation assertions
- `plans/README.md` only for Plan 011's status

**Out of scope:**

- `compileExecutableMatrix`, matrix input/result/error types, concurrency, and
  canonical matrix output naming; Plan 012 owns them.
- changes to package subpaths or a generic root operation;
- provider runtime exports, provider declaration narrowing, root Artifact
  correlation, runtime-key manifests, packed-consumer surface, or public docs;
  Plan 014 owns that coordinated hard cut after Plan 013 evidence;
- removal of the root `Target` or root `Artifact` runtime schema;
- a compatibility overload accepting broad `Target.Target` in Deno;
- CPU baseline/modern target variants, compiler fallback, raw native target
  strings, target auto-discovery registries, or runtime version rejection;
- any Effect dependency upgrade;
- edits to `src/standalone/internal/NativeExecutable.ts` or rollback of its
  committed ranged-inspection behavior;
- cache, task graph, watch, publication, signing, type checking, declarations,
  or standalone bundling operations.

## Git workflow

- Continue on the current branch; if creating a branch, use
  `codex/011-provider-targets`.
- Commit logical units with the repository's conventional style, for example
  `refactor!: centralize provider target contracts`.
- Do not push, tag, publish, or open a PR unless separately instructed.
- Never format or stage unrelated files.

## Steps

### Step 1: Make internal target authority and runtime safety red in tests

Add type and runtime tests before production changes:

- exact package-private Bun/Deno table schema/literal sequences;
- every provider literal renders its exact token from the table above;
- internal Bun target types accept musl while internal Deno target types reject
  it;
- unknown strings and non-string values forced through the public operation
  fail as typed `BuildError`, with zero render/spawn and no output directory;
- `TargetUnsupported` round-trips through `BuildError` encoding with an unknown
  requested string and a provider-derived canonical Target list;
- the public error declaration accepts that unknown requested string while
  provider operation inputs remain at their existing broad root Target type;
- a target omitted on a Windows compiler host stages `<basename>.exe` while
  returning the exact caller destination; and
- returned `artifact.tool` has exactly `name`, `version`, and `path`, never the
  internal host OS.

Keep provider operation/runtime-key tests unchanged and green; add only the
deliberate `TargetUnsupported.requested: string` contract assertion. Absence of
`Bun.Target` / `Deno.Target` is intentional until Plan 014.

**Verify**:

```sh
pnpm test:types
pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts test/unit/standalone-publication.test.ts
```

Expected before implementation: failures are limited to missing provider table
primitives, the safe error-field widening, and the new runtime/default-Windows
assertions. Existing provider operation/runtime-key tests remain green
throughout this plan.

### Step 2: Introduce the target catalog and provider table primitive

Implement `TargetCatalog.ts` as the sole owner of canonical target metadata.
Derive the root schema and lookup from one const definition, and make
`src/standalone/Target.ts` a narrow public projection of that schema/type.

Implement `TargetTable.ts` as a package-private constructor constrained to a
subset of canonical target keys and non-empty native tokens. Its returned
value must provide a literal-preserving schema/list, total lookup for its own
Target type, and safe membership/resolve for unknown input. Keep any necessary
key assertion inside this constructor.

Define those values in pure `BunTarget.ts` / `DenoTarget.ts` modules at the
provider-adapter boundary. Replace both adapter-local mappings with imports of
the corresponding table. Delete `supportedTargets`, both adapter-level
`Object.keys` casts, Deno's partial record, and its lookup cast. Change native
validation and Windows suffix logic to consume catalog descriptors instead of
parsing/prefix testing strings.

The pure provider target modules may import only `TargetCatalog` / `TargetTable`
and Effect Schema/type utilities. They must not import public `src/Bun.ts` or
`src/Deno.ts`, adapters, discovery, process, filesystem/path services, or argv
rendering. This purity is what permits later compiler-neutral correlated schemas
to depend on the tables without creating a provider execution cycle.

Define only package-private provider contract projections needed by the engine
and Plan 012. Do not import the tables into `Artifact.ts` or export them from
provider modules yet.

**Verify**:

```sh
rg -n 'supportedTargets|Partial<Record<Target|as Target\[\]|as keyof typeof targets|target\.split|startsWith\("windows-"\)' src
pnpm check
```

Expected: the search has no production matches and typecheck exits 0.

### Step 3: Thread provider target correlation through package-private code

Parameterize package-private shared types by tool name, provider target, and
options. A representative internal shape is:

```ts
interface InternalCompileInput<SupportedTarget extends Target.Target, Options> { /* current fields */ }
interface ProviderContract<
  Name extends Artifact.ToolName,
  SupportedTarget extends Target.Target,
  Options
> { /* adapter/runner */ }
type ProviderArtifact<
  Name extends Artifact.ToolName,
  SupportedTarget extends Target.Target
> =
  Artifact.Artifact & { readonly target: SupportedTarget; readonly tool: { readonly name: Name } }
```

The exact generic names may differ. Every internal target generic is constrained
to the root canonical vocabulary and instantiated from a provider table; no
target parameter is paired with an unconstrained `string`. The provider
tables/adapters must be concrete, while the existing public Bun/Deno
`CompileExecutableInput`, Compiler service, and broad Artifact return type stay
unchanged until Plan 014. Keep provider options distinct.

Change `TargetUnsupported.requested` to safely carry arbitrary strings while
keeping `available` a provider-derived root Target list. Use the total
descriptor rule above for
non-strings. Validate runtime target type/membership before staging. Do not use
`as Effect.Effect<...>` to erase a correlation the compiler could otherwise
prove; if one unavoidable implementation assertion remains, confine and
explain it at the shared factory boundary.

**Verify**:

```sh
pnpm check
pnpm test:types
pnpm exec vitest run test/unit/standalone-contract.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
```

Expected: all pass, including internal Deno musl rejection, runtime-safe public
failure, the intentional `TargetUnsupported.requested` widening, and otherwise
unchanged public declaration/runtime-key surface.

### Step 4: Normalize compiler-host OS for omitted-target staging

Make Bun and Deno probes report normalized compiler-host OS with path/version.
Validate it during Layer construction and carry it in a discovery wrapper
separate from `Artifact.Tool`. Update all fake probe outputs. When target is
absent, use this compiler-host OS only to select the staged executable suffix;
continue inferring/validating the artifact target from the produced native
header and continue publishing to the exact requested `outfile`.

Do not read `process.platform`, `Deno.build`, or Node APIs in shared library
source. Provider probe argv owns native observation; the engine consumes the
normalized result.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-publication.test.ts test/unit/standalone-bun.test.ts test/unit/standalone-deno.test.ts
pnpm verify:real
```

Expected: deterministic tests pass on the current host; the existing real Bun
and Deno current-host builds remain green; exact-key assertions prove host OS
does not appear in `artifact.tool`.

### Step 5: Prove the internal cut without changing the public surface

Build the declarations and explicitly prove provider runtime keys and operation
signatures are unchanged. The sole declaration delta is
`TargetUnsupported.requested: string`. `Bun.Target`, `Deno.Target`, narrowed
scalar input, provider Artifact aliases, and matrix vocabulary must be absent.
Plan 013 now owns pinned feasibility/support evidence; Plan 014 is the first
provider API cut.

**Verify**:

```sh
pnpm verify
pnpm build
node -e 'Promise.all([import("./dist/Bun.js"),import("./dist/Deno.js")]).then(([b,d])=>{for(const m of [b,d])if(JSON.stringify(Object.keys(m).sort())!==JSON.stringify(["Compiler","compileExecutable","layer"]))process.exit(1)})'
! rg -n 'compileExecutableMatrix|export .*Target|export type Artifact' dist/Bun.d.ts dist/Deno.d.ts
git diff --check
git status --short
```

Expected: the deterministic gate exits 0; runtime/declaration public surfaces
remain scalar and unchanged; only files listed in Scope plus the Plan 011
status row are modified.

## Test plan

- Use table-driven adapter tests so every target/token pair is asserted once.
- Exercise runtime-invalid values through a deliberate `unknown`/unsafe public
  boundary without narrowing its TypeScript signature yet.
- Extend publication tests for explicit Windows target and omitted target on a
  probed Windows compiler host. The final path remains the exact outfile.
- Keep real integration execution limited to current-host outputs here; Plan
  013 makes every foreign pair required.

## Done criteria

- [ ] One canonical target metadata catalog exists; engine and atomic output do
  not parse target strings.
- [ ] One target-to-token table per provider derives schema, type, literals,
  membership, lookup, and available-target reporting.
- [ ] No `supportedTargets`, partial provider target record, or adapter lookup
  cast remains.
- [ ] Internal Deno target types reject musl; the public scalar signature stays
  unchanged until evidence and Plan 014.
- [ ] Runtime-invalid targets fail through the typed channel before staging or
  spawn.
- [ ] Omitted-target Windows staging uses `.exe`; final single-build outfile
  semantics remain exact.
- [ ] Compiler host OS is internal and never appears in `artifact.tool`.
- [ ] Root `Target` and `Artifact` schemas remain the only cross-provider
  runtime representations.
- [ ] Provider runtime keys and operation declarations remain exactly at the
  Plan 010 scalar surface; the only public declaration correction is
  `TargetUnsupported.requested: string`.
- [ ] `pnpm verify` exits 0.
- [ ] Existing provisioned `pnpm verify:real` exits 0.
- [ ] No file outside Scope is modified, other than the authorized status row.

## STOP conditions

Stop and report if:

- v0.1.0 has already been published and the operator has not approved a
  breaking target-surface release;
- the live Bun 1.3.9 or Deno 2.9.3 compiler does not support a token in the
  fixed provider table;
- provider target correlation requires importing Bun/Deno modules into the
  compiler-neutral lifecycle;
- root `Artifact.Artifact` would need to be replaced rather than specialized at
  the type boundary;
- runtime validation requires converting interruption or defects into
  `BuildError`;
- an in-scope file differs from the Current state in a way not explained by
  reviewed commits after `eb2995c`; or
- any verification fails twice after a reasonable correction.

## Maintenance notes

- A new canonical platform target starts in `TargetCatalog.ts`; a provider
  supports it only by adding a token to that provider's single table and the
  required evidence in Plan 013's support matrix.
- Adding a native token to a provider table is a candidate public support
  change. It changes public `Provider.Target.literals` only when Plan 013-style
  real evidence and the Plan 014-style coordinated export cut land together.
- Root Target is vocabulary, not an assertion that every compiler supports
  every target. Do not broaden provider input back to root Target for
  convenience.
- Reviewers should scrutinize the one unavoidable object-key assertion, error
  construction for untrusted values, and omitted-target Windows staging.

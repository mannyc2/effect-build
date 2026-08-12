# Plan 007: Freeze the standalone compile contract before touching execution

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm its expected result before moving on. This
> plan creates an internal, testable contract only; it must not export a second
> public API beside the managed one. If a STOP condition occurs, stop and
> report rather than widening the API. When complete, update only Plan 007's
> status row in `plans/README.md`, unless a coordinating reviewer owns it.
>
> **Drift check (run first)**:
>
> ```sh
> test "$(git rev-parse HEAD)" = "15b6abb8c28db73b4e8aeb818755f6ffc3e05530"
> git diff --stat 15b6abb8c28db73b4e8aeb818755f6ffc3e05530..HEAD -- AGENTS.md src test typetest package.json pnpm-lock.yaml
> git status --short
> pnpm check
> pnpm test:unit
> ```
>
> Expected at the planning baseline: the commit matches, the committed diff is
> empty, `pnpm check` and `pnpm test:unit` pass, and the worktree shows the
> pre-existing documentation/example/package WIP recorded under **Dirty-worktree
> boundary**. New or changed source/test/type-test paths are a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none; supersedes the direction in Plan 001
- **Category**: direction / API / types / tests / DX
- **Planned at**: commit `15b6abb`, 2026-08-09
- **Effect baseline**: `effect@4.0.0-beta.106`, reference checkout
  `df431ae72235ad7156901caa30b053688ab40a17`

## Why this matters

The product is no longer a managed proof/record system. It is one Effect-native
operation for compiling a TypeScript or JavaScript entrypoint into a standalone
executable. Freezing that small contract before process or filesystem work
prevents the existing snapshot/plan/store vocabulary from leaking into the new
API and gives later plans a precise type-level acceptance gate.

This is an intentional pre-release hard cutover. There will be no public
compatibility wrapper, managed advanced tier, automatic driver fallback, or
generic raw-argv escape hatch.

## Product contract fixed by this plan

Per the gate decisions recorded 2026-08-11 in `plans/README.md`, the public
shape is per-tool (Alternative B). The final call shape is:

```ts
Bun.compileExecutable({
  entrypoint: "src/main.ts",
  outfile: "dist/app",
  cwd: "/optional/project/root",
  target: "linux-x64-gnu",
  options: { minify: true, bytecode: true }
})
```

Only `entrypoint` and `outfile` are required. The fundamental option split is:

| Category | Fields | Owner |
|---|---|---|
| project facts | `entrypoint`, `outfile`, optional `cwd` | core operation |
| artifact fact | optional `target` | core target vocabulary; the tool module maps it |
| result detail | optional `digest` (default false) | core operation |
| compiler semantics | optional `options` | the tool module's own option type |
| compiler provisioning | PATH discovery or explicit executable | the tool module's Layer, never the call |
| orchestrator runtime | Node/Bun/Deno platform services | application composition root, never the call |

Do not add `env`, `config`, `tool`, `strict`, `retry`, `cache`, `recordRoot`,
`contentRoot`, `workRoot`, `proof`, or `rawArgs` to `CompileExecutableInput`.
V1 follows the selected CLI's normal environment and project-config behavior;
effect-build is not a supply-chain policy engine.

The operation returns one plain serializable value only after the requested
destination has been published:

```ts
interface Artifact {
  readonly path: string                 // normalized absolute outfile
  readonly bytes: number                // safe non-negative integer
  readonly digest?: `sha256:${string}`  // 64 lowercase hex digits; present
                                        // exactly when input.digest was true
  readonly target: Target               // observed/validated output target
  readonly tool: {
    readonly name: "bun" | "deno"
    readonly version: string
    readonly path: string               // observed normalized absolute path
  }
}
```

`digest` is opt-in (gate 2): it is the only Artifact field whose cost is a
separate full read of the output, so it is computed and present exactly when
the call requested it. `path`, `bytes`, `target`, and `tool` are committed
fields — free projections of validation and probing the engine performs anyway.
What `target` reports when the native header cannot classify an ABI is defined
by Plan 008's validation policy.

There is no `ArtifactRef`, success outcome wrapper, store adoption, or later
materialization step.

## Current state

- `src/index.ts:1-20` exports twenty managed namespaces.
- `AGENTS.md:3-10` currently mandates `ResolvedBuild`, forbids discovery and
  ambient project behavior, assigns planning/persistence to core, and permits
  the unstable process import only in the old `ProcessExecutor`. Those rules
  directly conflict with the standalone direction recorded in the
  `plans/README.md` gate decisions (2026-08-11) and must be revised before
  implementation begins. Note the deletion of the managed system itself is
  *not* yet authorized: that is gate 5, owned by Plan 010.
- `src/CompileExecutable.ts:11-17` requires `BuildContextRef`, logical output,
  `CurrentHost`, and a syntax protocol rather than project paths.
- `src/Build.ts:13-41` exposes snapshot, plan, prepared execution, run, and
  materialize.
- `src/Artifact.ts:8-27` models a content-store reference and requires
  `BuildExecutor` to obtain a usable file.
- `src/BuildExecutor.ts:44-61` exposes `unknown` for every public failure.
- `src/Target.ts:4-26` contains reusable OS/architecture/ABI validation, but its
  object form is not the chosen public DX.
- `typetest/*.tst.ts` does not currently run through TSTyche; `test:types` is a
  second ordinary `tsc` invocation.

The installed Effect baseline is authoritative over the more recent API names
in the local Effect skill:

- use `Context.Service`, which exists at the pinned Effect source
  `.agent-sources/effect/packages/effect/src/Context.ts:98-224`;
- use `Schema.TaggedError<Self>()`, which exists at
  `.agent-sources/effect/packages/effect/src/Schema.ts:14454-14484`;
- do **not** use `ServiceMap.Service` or `Schema.TaggedErrorClass` unless a
  separately approved Effect upgrade first makes those symbols real and all
  plans are reconciled.

## Dirty-worktree boundary

At planning time the following user-owned WIP already exists and is out of
scope for this plan: `README.md`, `docs/architecture.md`, `docs/roadmap.md`,
`dprint.json`, `package.json`, `tsconfig.json`, untracked `docs/README.md`,
`docs/api.md`, `docs/concepts.md`, `docs/drivers.md`, `docs/errors.md`,
`docs/getting-started.md`, and `examples/`. The untracked planning/review
artifacts under `plans/` (Plans 007-010, the review brief, and
`FIRST-PRINCIPLES-REVIEW.md`) are likewise expected worktree state, edited
only through their own recorded process.

Do not format, stage, rewrite, restore, or otherwise absorb those changes.
Plan 010 owns their semantic reconciliation after the new implementation is
green. `package.json` is deliberately untouched here; invoke TSTyche directly.

## Scope

**Create:**

- `src/standalone/Artifact.ts`
- `src/standalone/Target.ts`
- `src/standalone/BuildError.ts`
- `src/standalone/Driver.ts`
- `src/standalone/CompileExecutable.ts`
- `test/unit/standalone-contract.test.ts`
- `typetest/standalone-contract.tst.ts`

**Modify only for the final status update:**

- `plans/README.md`

**Modify before any new source is written:**

- `AGENTS.md`

**Out of scope:**

- every existing file under `src/`, `test/`, `typetest/`, `docs/`, and
  `examples/` not listed above;
- root/package subpath exports;
- process spawning, filesystem staging, hashing, discovery, or real drivers;
- any temporary adapter from the managed API to the standalone API.

## Git workflow

- Continue on `feat/effect-build-foundation`; do not create another worktree.
- Preserve all pre-existing dirty files exactly.
- Commit only the new standalone contract/tests and the Plan 007 status change.
- Match the repository's conventional messages, for example
  `feat: freeze standalone compile contract`.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Ratify the migration in repository execution rules

Update `AGENTS.md` first. Replace the managed-product rules with the active
standalone direction from `plans/README.md`:

- one final public `compileExecutable` operation and no public managed tier;
- orchestrator runtime, compiler, and artifact target are independent;
- compiler is explicitly selected; PATH discovery is the default Layer and
  never a driver fallback;
- shared lifecycle uses Effect `ChildProcessSpawner`, `FileSystem`, `Path`, and
  `Crypto`; drivers own discovery/probe, target mapping, argv, and diagnostics;
- environment/project config follow normal CLI behavior in V1;
- interruption remains interruption;
- `pnpm verify` is the final handoff gate.

Record the temporary migration allowance precisely: until Plan 010 deletes the
managed implementation, the existing `src/internal/ProcessExecutor.ts` import
may remain and the new standalone process import may appear only in
`src/standalone/internal/Process.ts`; no new managed behavior may be added and
the standalone path must remain unexported. Plan 010 removes the allowance.

Do not copy the implementation plan into `AGENTS.md`; keep the rule file short.

**Verify**:

```sh
rg -n 'ResolvedBuild|no automatic discovery|ProcessExecutor\.ts' AGENTS.md
rg -n 'compileExecutable|ChildProcessSpawner|FileSystem|Path|Crypto' AGENTS.md
```

Expected: the stale-rule search returns no matches; the new invariant search
finds the concise replacement rules.

### Step 2: Define one canonical target and artifact

In `src/standalone/Target.ts`, define one Schema-backed string union:

```text
macos-x64
macos-aarch64
linux-x64-gnu
linux-x64-musl
linux-aarch64-gnu
linux-aarch64-musl
windows-x64
windows-aarch64
```

This is the only public artifact-target representation. Tool-specific target
tokens such as `bun-darwin-arm64` and `aarch64-apple-darwin` never escape their
drivers. CPU feature variants such as Bun `baseline`/`modern` are deliberately
deferred rather than silently collapsed into this model.

In `src/standalone/Artifact.ts`, define the exact plain `Artifact` and `Tool`
schemas/types above. Validate absolute paths, safe byte counts, non-empty tool
versions, and the prefixed SHA-256 syntax. Do not introduce nominal store ids or
mutable classes.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-contract.test.ts -t 'target|artifact'
```

Expected: tests reject invalid target combinations, relative artifact/tool
paths, malformed digests, and unsafe byte counts; valid JSON round-trips.

### Step 3: Define the closed failure channel

In `src/standalone/BuildError.ts`, create Schema-backed tagged errors and the
`BuildError` union:

- `ToolNotFound { tool, command }`
- `ToolProbeFailed { tool, reason }`
- `ToolFailed { tool, exitCode, diagnostics }`
- `TargetUnsupported { tool, requested, available }`
- `InvalidDriverOptions { tool, reason }`
- `OutputMissing { path }`
- `OutputInvalid { path, reason }`
- `OutputLocked { path }`
- `PublicationFailed { path, operation, reason }`

A diagnostic is serializable `{ channel: "stdout" | "stderr", text,
truncated }`. Keep actionable Platform failures as short strings; do not place
opaque JavaScript causes or host handles in the schema. Interruption is not a
member of `BuildError`.

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-contract.test.ts -t 'errors'
```

Expected: every tag decodes/encodes, the union is exhaustive, and no
`Interrupted` error exists.

### Step 4: Freeze per-tool correlation and Effect requirements

The public shape is per-tool (gate 1): each tool module exports its own
`compileExecutable`, and implementation selection lives in the Effect context,
never in a value parameter. This matches the pinned Effect source's own
pattern — the ai package's common verb takes no provider argument, provider
specifics live in provider modules, and its first-class `Model` value is a
`Layer` subtype, not a call argument. There is no `CompilerDriver` value and
no option witness: option separation holds by construction, because each tool
module declares its own unique service tag and its own concrete `Options`
instantiation.

In `src/standalone/Driver.ts`, define:

- `CompileExecutableInput<Options>` with exactly `entrypoint`, `outfile`,
  optional `cwd`, optional `target`, optional `digest`, and optional
  `options`;
- `CompilerService<Options>` with one `compileExecutable` method returning
  `Effect.Effect<Artifact, BuildError, never>`.

In `src/standalone/CompileExecutable.ts`, define the internal factory
`makeCompileExecutable(tag)`: given a tool module's unique
`Context.Service` tag for its `CompilerService<Options>`, it returns that
module's public function
`(input: CompileExecutableInput<Options>) => Effect.Effect<Artifact, BuildError, ToolCompiler>`,
which only retrieves the tag's service and delegates. It performs no discovery
and contains no registry.

The standard Layer pattern to preserve for later plans is:

```text
live tool Layer requires ChildProcessSpawner | FileSystem | Path | Crypto
-> Layer construction captures those host services
-> Layer provides Bun.Compiler or Deno.Compiler
-> Compiler method itself has R = never
-> Bun.compileExecutable requires only Bun.Compiler
```

**Verify**:

```sh
pnpm exec vitest run test/unit/standalone-contract.test.ts -t 'driver'
pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
```

Expected: two fake per-tool modules (one Bun-like, one Deno-like) built from
the factory can each be provided and return an Artifact; each function's
environment is exactly its own fake service; each option type is that module's
`Options`; and passing the other module's option object is a negative type
assertion.

### Step 5: Run the bounded contract gate

```sh
pnpm check
pnpm exec vitest run test/unit/standalone-contract.test.ts
pnpm exec tstyche --config tstyche.config.json typetest/standalone-contract.tst.ts
git status --short
```

Expected: all commands pass. Status contains only the seven new paths, the
`AGENTS.md` migration-rule edit, the Plan 007 row update, and the exact
pre-existing WIP inventory.

## Test plan

- Schema round-trip and rejection cases for `Target`, `Artifact`, and every
  error, including `digest` present-iff-requested.
- Fake per-tool module success and typed failure.
- Type assertions that `options` follows the tool module and each returned
  Effect requires exactly that module's service.
- Negative assertions for Bun-like options on a Deno-like fake module, unknown
  common fields, `Interrupted` in the error union, and store/materialization
  fields on `Artifact`.

## Done criteria

- [ ] The two-string call is valid; `cwd`, `target`, `digest`, and typed
  `options` are the only optional operation fields.
- [ ] `Artifact` is plain final-destination data with no store identity;
  `digest` is present exactly when requested.
- [ ] `BuildError` is closed and interruption is absent.
- [ ] Tool-specific options cannot be mixed at compile time.
- [ ] Each per-tool `compileExecutable` requires exactly its own Compiler
  service and nothing else.
- [ ] `AGENTS.md` authorizes the standalone migration and its exact temporary
  process-import allowance; it no longer mandates the superseded product.
- [ ] No root or package subpath export changed.
- [ ] `pnpm check`, the focused Vitest file, and direct TSTyche invocation pass.
- [ ] No pre-existing dirty file changed.
- [ ] Plan 007 is `DONE` in `plans/README.md`.

## STOP conditions

Stop and report if:

- the pinned Effect version does not expose the cited `Context.Service` or
  `Schema.TaggedError` API;
- preserving option correlation requires a universal options union or optional
  `bun`/`deno` bags;
- a plain Artifact cannot be represented without store/materialize concepts;
- any proposed common field is not a fact shared by Bun and Deno;
- source/test paths changed after the planned commit;
- execution would require touching any pre-existing dirty WIP file.

## Maintenance notes

- `Target` is deliberately smaller than every native target spelling. Add a
  canonical distinction only when Artifact must report it truthfully.
- Adding a driver option never changes the common operation input.
- Do not publish the new API until Plan 010; temporary internal coexistence is
  implementation sequencing, not a supported legacy mode.

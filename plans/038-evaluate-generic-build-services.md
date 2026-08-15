# Plan 038: Evaluate `JavaScriptBundler` and `ExecutableBuilder` promotion

> This plan is a post-release API experiment and decision gate. It does not
> presume promotion. Before changing `AGENTS.md` or public exports, send the
> parent task the comparison results and exact proposed declarations. No answer
> means keep the experiment private and record `NOT EARNED`.

## Status

- Priority: P1 architecture
- Effort: L
- Risk: HIGH public API
- Depends on: 037 (or a maintainer decision to run against an unreleased clean
  certified baseline)
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE` — decision `NOT EARNED`

## Motivation and current asymmetry

The provider verbs describe different transformations, not accidental naming:

- Bun/Deno `compileExecutable`: source entrypoint -> native executable;
- Bun/Esbuild `withJavaScriptBundle`: source entrypoint -> scoped JS bundle;
- Node SEA `createExecutable`: live JS bundle -> native executable.

Deferring a lowest-common-denominator service was correct, but two independent
bundle producers now make a real comparison possible. This plan tests a common
service without forcing Node SEA, Bun, and Deno behind an invalid union.

## Candidate model to test

1. `JavaScriptBundler` may be earned as an additive core service if one
   unchanged application program can be supplied by either Bun or Esbuild
   Layer and receives the same live `JavaScriptBundle.Artifact` contract.
   Keep direct provider operations and provider-specific errors/features.

2. Treat `ExecutableBuilder` as a protocol family parameterized by input
   topology, not one universal service:

   - `ExecutableBuilder.FromSource` / `ExecutableCompiler` for Bun and Deno;
   - `ExecutableBuilder.FromJavaScriptBundle` / `ExecutableAssembler` for Node
     SEA.

   A common structural `Service<Input, Output, Error>` type may be useful, but a
   public Context tag is earned only where callers actually swap Layers. Never
   accept `SourceInput | JavaScriptBundle` in one method.

## Evidence questions

- What exact request fields are genuinely common between Bun and Esbuild?
- Can the generic operation preserve continuation lifetime and interruption?
- What normalized error data is useful without erasing provider diagnostics?
- Can the same program typecheck under either Layer without `as`, `unknown`, or
  provider imports?
- Does a common executable-builder tag reduce any branch, or do distinct input
  topologies make it a misleading name?
- Do `ResolutionTarget`, `SyntaxTarget`, or `ExecutionTarget` gain two real
  consumers, or remain provider facts? Do not revive `Preserved`; the neutral
  artifact currently omits that failed representation entirely.

## Scope

Initially private experiment/examples/tests only. Candidate public changes, if
approved, may touch core service/diagnostic modules, Bun/Esbuild provider
Layers, docs, declarations, package export fixtures, and architecture tests.
Node SEA direct consumption remains independent; no integration imports
another. Bun/Deno scalar/matrix APIs remain.

## Steps

1. Build a named private fixture application that accepts only a
   `JavaScriptBundler` service, bundles the same ESM and CJS source, validates
   the neutral artifact, and consumes it with Node SEA. Run it once with Bun
   Layer and once with Esbuild Layer without changing application source.

2. Compare exact request capabilities, errors, diagnostics, stage observations,
   cleanup, interruption, external imports, and syntax facts. Record a rent
   table for every proposed field/method. Provider-only controls stay on
   provider APIs.

3. Test two error strategies:

   - portable tagged errors with normalized diagnostics plus retained
     provider detail/identity;
   - a generic structural service type parameterized by provider error while
     direct provider Context tags remain concrete.

   Reject any strategy that catches arbitrary caller `_tag`s, stores `unknown`
   as the only useful diagnostic, or prevents Layer swapping at the named
   consumer.

4. Separately model source compilers and bundle assemblers. Demonstrate whether
   a generic `ExecutableBuilder<I>` structural protocol helps shared
   validation/publication code beyond the already-public Integration seam.
   If no application swaps implementations with the same `I`, record NOT
   EARNED. Prefer `ExecutableAssembler` for Node SEA if that is the truthful
   role.

5. Promotion gates for `JavaScriptBundler`:

   - two integrations provide it one-way through core;
   - one named application swaps Layers unchanged;
   - common request has no provider-specific lie;
   - errors retain actionable provider detail;
   - interruption/liveness remain exact at both Effect endpoints;
   - direct APIs remain additive, not compatibility wrappers;
   - packed isolated and composed consumers pass.

6. Present the in-thread decision report and ask for the public cut. If
   approved, restamp governance, implement one hard additive surface, update
   exact export/declaration tests, and run complete certification. If not, keep
   only the evidence record; do not ship experiment code.

## Verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
git diff --check
```

If promoted, also require both real Bun/Esbuild -> Node SEA lanes and fourteen
or expanded packed consumers from one exact SHA.

## STOP conditions

- service requires a union of incompatible input topologies;
- provider diagnostics or capabilities are flattened away;
- no unchanged named consumer can swap Layers;
- generic API duplicates `Integration.produceExecutable` without removing a
  caller branch;
- promotion lacks explicit maintainer approval.

## Maintenance / compression ledger

The only acceptable new abstraction removes provider selection from a real
application while retaining direct integration value. Otherwise the plan adds
no API and records why.

## Decision receipt: NOT EARNED

Plan 037 published the exact five-package `0.3.0` release before this durable
decision was recorded. The experiment remained private and is not part of the
release source, tag, package tarballs, manifests, tooling API declarations, or
exports. No governance restamp, compatibility wrapper, target family, generic
Context tag, or experimental package was added.

The private rent test did prove implementability. One unchanged fixture
application accepted a synthetic `JavaScriptBundler` service, built both ESM
and CJS, consumed the live neutral bundle with Node SEA, and ran under either a
Bun or Esbuild Layer. Its focused runtime suite passed 18/18 and its targeted
and full type fixtures passed. Artifact liveness, cleanup, caller error
identity, mixed Fail/Interrupt/Die topology, and continuation interruption were
explicitly exercised. This establishes that an adapter can be written; it does
not establish public demand or maintenance rent.

| Proposed surface | Truthful common evidence | Provider/lifecycle rent | Decision |
|---|---|---|---|
| `JavaScriptBundler` request | Exactly three fields are common: `entrypoint`, `format: "esm" \| "cjs"`, and optional `cwd`. Both return the same continuation-owned core `JavaScriptBundle.Artifact`. | A generic portable error still needs `provider`, normalized `kind`, normalized diagnostics, provider tag, and retained provider error identity. Bun additionally owns command discovery/version/spawn and Bun-specific metafile/import reasons; Esbuild owns its process-global context/version and richer id/location diagnostics. The adapter removes no direct provider error branch and must preserve the existing Exit sandwich, cause topology, cleanup, and Layer requirements. | `NOT EARNED` |
| `ExecutableBuilder` | Source-to-executable operations exist for Bun and Deno; live-bundle-to-executable exists for Node SEA. | One name would conflate incompatible input topology and lifecycle: source requests versus a scoped live artifact. A union input would be a lie and duplicate the existing Integration lifecycle seam. | `NOT EARNED` |
| `ExecutableAssembler` | The name truthfully describes Node SEA's live-bundle-to-executable role. | It has one implementation and no application that swaps another assembler Layer. A structural type adds a second representation without removing a branch. | `NOT EARNED` |

Repository-wide production-source and example inspection found direct Bun and
Esbuild calls and application-owned Esbuild/Bun -> Node SEA composition, but no
named production consumer that asks to swap a generic bundler or assembler
Layer. The only swapping consumer was the synthetic private fixture. Existing
`effect-build/Integration` already owns the shared process, liveness,
validation, staging, and publication work, so the generic surface would add
provider/kind/diagnostic adapters without deleting shared machinery or a
caller decision.

The experiment also exposed Esbuild's pre-existing continuation-boundary bug:
provider handlers surrounded arbitrary caller effects and could capture a
genuine core error while losing a sibling interrupt. That bounded correctness
defect was fixed without adding a generic API in commit
`a989fd12c377534b36fb468a2c4e8baf00330410`; exact-SHA CI
[run `31873882878`](https://github.com/mannyc2/effect-build/actions/runs/31873882878)
passed all twelve jobs. The released descendant preserves that correction.

Reopen `JavaScriptBundler` only when a named production application must swap
Bun and Esbuild unchanged and the abstraction demonstrably removes provider
selection while retaining provider diagnostics and exact interruption/liveness
semantics. Reopen a source compiler or bundle assembler only after at least two
truthful implementations share the same input topology and a real consumer
swaps them. Until then, direct provider APIs plus the existing Integration seam
are the smaller and more accurate public architecture.

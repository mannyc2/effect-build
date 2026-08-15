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

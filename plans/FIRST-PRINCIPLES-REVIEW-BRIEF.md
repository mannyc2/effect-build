# effect-build first-principles review brief

## Purpose

This document gives a reviewer enough context to evaluate `effect-build`
without inheriting the conclusions of the latest plans. It reconstructs why the
project exists, what was built, how the discussion changed direction, what
Plans 007-010 propose, and which decisions remain genuinely unsettled.

This is a request for architectural criticism, not an implementation request.
Do not edit source code while performing this review. The reviewer is expressly
allowed to reject, merge, narrow, or replace Plans 007-010.

Most importantly: the hard deletion in Plan 010 is a conclusion reached during
planning. It was not an original user requirement. No managed source has been
deleted yet, and whether it should be deleted is one of the decisions this
review must revisit from first principles.

## The review request

Read the repository, this chronology, and Plans 001-010. Then answer:

> Are we solving a real problem for a concrete first user with the smallest
> product that earns its existence, or have we continued an abstraction and
> edge-case ratchet under a new vocabulary?

Do not begin with “how should Plans 007-010 be improved?” Begin with:

1. Who is the first user?
2. What are they trying to accomplish?
3. What is difficult or incorrect about doing it directly today?
4. Which part specifically benefits from Effect?
5. What is the minimum public API and behavioral guarantee that solves that
   problem?
6. Does that product justify modifying, retaining, or deleting the current
   managed system?

The correct answer may be that the current hard-cut plan is right. It may also
be that the package should retain a managed tier, expose thinner per-tool
wrappers, support only one compiler initially, or not exist as a library. Treat
all of those as live alternatives until evidence eliminates them.

## Repository snapshot

At the time of this brief:

- The package is private and versioned `0.1.0`.
- The branch is `feat/effect-build-foundation` at commit `15b6abb`.
- Commits `989fbe1` through `15b6abb` implemented the managed model, content
  executor, Bun driver, Deno driver, public API, and CI contract.
- Plans 002 and 003 are recorded as historically complete. The implementation
  also contains the work described by Plans 004-006, although the new plan
  index marks those directions rejected.
- Plans 007-010 are proposed and currently `TODO`; their files are untracked
  planning work.
- The existing managed implementation still exists.
- `AGENTS.md` still enforces the managed design: `ResolvedBuild` is canonical,
  tools are explicitly configured, ambient discovery is forbidden, and core
  owns planning, persistence, and publication. Plan 007 proposes changing those
  rules before implementation.
- README, documentation, package configuration, and examples contain
  pre-existing user work. Any implementation must preserve or deliberately
  reconcile it rather than overwrite it as collateral.
- The repository is pinned to `effect@4.0.0-beta.106` and an Effect source
  checkout at `df431ae`. That source uses `Context.Service` and
  `Schema.TaggedError<Self>()`; newer API names in the installed Effect skill do
  not override the pinned source.

The current plan index is `plans/README.md`. The original direction is recorded
in Plans 001-006; the proposed replacement is recorded in Plans 007-010.

## Original motivation

The initial motivation was comparatively simple:

- Provide a TypeScript API, written in Effect, for invoking build tools.
- Let developers compose build work as an Effect rather than as shell scripts
  or ad hoc subprocess code.
- Initially, runtime independence seemed important: an Effect program could be
  hosted under Node, Bun, or Deno. During discussion, this became a secondary
  architectural property rather than the primary user need.
- The primary user gradually became: a TypeScript/Effect developer who wants to
  compile a TypeScript or JavaScript entrypoint into a native executable using
  Bun or Deno.

The motivating operation was eventually narrowed to:

```ts
compileExecutable(Bun.driver, {
  entrypoint: "src/main.ts",
  outfile: "dist/app"
})
```

The presumed value over a direct subprocess call was not merely “a TypeScript
API.” A developer can already invoke a command through Effect in a few lines.
The proposed library-specific value became:

- a typed failure channel instead of interpreting exit codes and stderr at
  every call site;
- scoped interruption that actually terminates and reaps the compiler;
- cleanup of temporary output on failure or interruption;
- an atomic destination contract so the old executable survives a failed
  build;
- a typed, serializable artifact result;
- compiler services supplied through Layers, allowing tests to avoid real
  subprocesses;
- typed driver-specific options and targets rather than hand-authored argv.

Whether that collection is valuable enough to justify a library is still a
question, not an established fact.

## What was built before the redesign

The greenfield architecture in Plans 001-006 treated `effect-build` as a
managed build control plane rather than a compiler wrapper.

Its central ideas were:

- `ResolvedBuild` as the only canonical managed identity;
- decoded requests, immutable source snapshots, and resolved recipes;
- exact toolchain observations and private executable handles;
- prepared execution capabilities separated from serializable planning data;
- system-owned staging and a content-addressed artifact store;
- bounded stdout/stderr evidence;
- durable build records and truthful outcome states;
- explicit materialization from an `ArtifactRef` into a user-visible path;
- driver descriptors and generated compatibility information;
- exact, checksum-pinned real-tool fixtures in CI;
- future correctness foundations for caching or remote execution.

The design intentionally rejected ambient PATH discovery, inherited machine
state, fallback, raw shell commands, auto-installation, and caller-controlled
cacheability. Those choices make sense for a closed, managed build identity.

The resulting user workflow, however, exposed much of that machinery:

```text
request
-> snapshot
-> plan / resolve
-> prepare
-> run prepared build
-> receive an ArtifactRef in a content store
-> materialize it to the requested destination
```

That workflow was built before a concrete first-user interaction was frozen.
The architecture answered “how can a build be represented and recorded
carefully?” before firmly answering “what does the first user want to type?”

## The complaint that triggered the redesign

The user objection was not simply that the repository had too many files or
too much internal complexity. It was that the cost of the guarantees appeared
in the only public workflow:

> Users may not want to plan or materialize. They may want sensible defaults
> that behave like using the CLI directly. Defensive machinery is not worth it
> if it produces a poor API and poor developer experience.

The strongest form of the complaint was:

- Complexity may be justified internally.
- It is not automatically justified as mandatory user vocabulary.
- Ceremony should correspond to a guarantee the caller actually requested.
- Defaults should not silently impose policy flags that differ from the
  underlying compiler.
- A caller familiar with Bun or Deno should not have to understand snapshots,
  prepared handles, content roots, records, or materialization merely to obtain
  an executable.

An early response framed this as a missing cheap tier: preserve the managed
system, but add a simple API above or beside it. That was not yet a hard-cut
proposal.

## Important distinctions discovered during discussion

### Three independent axes

The repository already contained three distinct ideas that should not be
collapsed:

1. **Orchestrator runtime**: Node, Bun, or Deno hosts the Effect program.
2. **Compiler tool**: the Bun or Deno binary performs the compilation.
3. **Artifact target**: the resulting executable targets an OS, architecture,
   and, where meaningful, ABI.

A Node-hosted Effect program may invoke Deno to produce a Linux executable.
Changing one axis should not silently change either of the others.

This separation is considered a real strength of the existing repository, but
the reviewer should still ask how much of it belongs in V1 acceptance rather
than future capability.

### Common operation, different compiler semantics

`compileExecutable` is the proposed common verb. Entrypoint, outfile, cwd, and
artifact target are project/artifact facts. Compiler options are not common.

The intended type relationship is:

```ts
compileExecutable(Bun.driver, {
  entrypoint,
  outfile,
  options: { minify: true, bytecode: true }
})

compileExecutable(Deno.driver, {
  entrypoint,
  outfile,
  options: { bundle: true, permissions: { net: ["api.example.com"] } }
})
```

A Bun-only option must be a type error under Deno. Portability lives in the
operation shape, not in a fictional universal options object.

### Atomic publication is a deliberate CLI divergence

The discussion rejected a literal “identical to the CLI in every observable
state” promise. The proposed destination contract is:

> `outfile` is always either the previous complete file or the new complete
> file. Failure and interruption leave the previous destination unchanged.

The compiler writes to a sibling staging path and success publishes with an
atomic rename. This prevents torn output but may differ from direct CLI output
if a compiler embeds the output path. Therefore byte identity with a direct CLI
invocation is not currently a valid general claim.

The reviewer should determine whether atomic replacement is genuinely core
product value, an optional helper, or complexity that exceeds the first use
case.

### Ambient behavior was a convenience question, not a trust boundary

PATH, cwd, project config, environment, lockfiles, and caches were discussed at
length. The conversation briefly tried to classify them into evidence or
guarantee levels. That framing was later rejected.

The current proposal is intentionally ordinary:

- discover the selected compiler on PATH by default;
- allow an explicit executable path through the compiler Layer;
- inherit cwd when not supplied;
- allow Bun/Deno to load their normal project configuration;
- inherit the process environment by omitting replacement environment options;
- do not inject managed-policy flags unless the caller requested the matching
  compiler option.

These are usability defaults, not claims of hermeticity, input closure, or
trustworthiness.

## How the conversation went off course

After the developer-experience complaint, the questioning repeatedly moved to
the next edge case:

1. CLI parity raised staging and byte-identity questions.
2. Failure behavior raised atomic publication and Windows locking.
3. Ambient defaults raised PATH, config, dotenv, and environment policy.
4. Guarantee differences raised separate services and opaque result types.
5. Those types raised evidence levels, verification boundaries, and CI gates.

Each answer added structure. The sequence became a ratchet: locally reasonable
answers accumulated without returning to whether the feature or product should
exist at all.

The user interrupted this direction with the core question:

> Why is proof such a major concern? Who needs proof? Bun and Deno do not offer
> proof in their CLIs. Why should this library decide proof needs? Are we even
> asking the right questions, and how did we end up here?

That correction changed the product framing:

- A library running on the builder's machine cannot independently convince a
  verifier who does not trust that builder.
- Signing inside the same compromised builder does not repair that limitation.
- Supply-chain attestations belong to independently trusted CI/identity/log
  systems, not automatically to a compiler wrapper.
- For accidental drift, a digest and useful build log may help, but calling
  that a proof overstates it.
- Canonical identity and input closure may be useful for cache correctness or
  remote execution, but those are separate future systems and do not establish
  the first product.

This is why current Plans 007-010 remove proof, attestation, evidence-lattice,
cache, and remote-execution framing from the proposed V1.

## The role of ts-release

`ts-release` was mentioned as a possible sample or downstream scenario. The
user explicitly said it may be forgotten except as an example. `effect-build`
must not hard-code its API, policy, records, or behavior around `ts-release`.

Any design justified only by that repository is not a general product
requirement. A reviewer may use it to test whether an API composes cleanly, but
not to infer mandatory features.

## The current working product thesis

Plans 007-010 currently assume this product:

> Compile one TypeScript or JavaScript entrypoint to a standalone native
> executable through Bun or Deno, as an Effect, with typed options, typed
> failures, scoped cancellation, atomic destination replacement, target
> validation, and a plain Artifact result.

The proposed first example is:

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { compileExecutable } from "effect-build"
import * as Bun from "effect-build/bun"

const artifact = await Effect.runPromise(
  compileExecutable(Bun.driver, {
    entrypoint: "src/main.ts",
    outfile: "dist/app"
  }).pipe(
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer)
  )
)
```

The proposed common input has only:

- required `entrypoint` and `outfile`;
- optional `cwd`;
- optional canonical `target`;
- optional options inferred from the selected driver.

Compiler provisioning belongs to the driver Layer. The orchestrator runtime
belongs at the outer application composition boundary. There is no common env,
config, retry, cache, record-root, strict-mode, or raw-argv bag.

The proposed plain result is:

```ts
interface Artifact {
  readonly path: string
  readonly bytes: number
  readonly digest: `sha256:${string}`
  readonly target: Target
  readonly tool: {
    readonly name: "bun" | "deno"
    readonly version: string
    readonly path: string
  }
}
```

The reviewer should not assume every field earns its place. In particular,
digest, full tool metadata, target validation, and even the shared Artifact
type should each be justified against the first user's actual next operation.

## Summary of the active plans

### Plan 007: freeze the standalone contract

File: `plans/007-freeze-standalone-compile-contract.md`

This plan changes repository execution rules and creates an internal contract
without changing public exports. It proposes:

- one canonical string Target;
- one plain Artifact;
- a closed tagged BuildError union;
- a driver-correlated `CompileExecutableInput<Options>`;
- a compiler service selected explicitly by the driver;
- negative type tests preventing Bun and Deno option mixing;
- no planning, store, record, or materialization vocabulary in the new API.

It is designed as a reversible contract slice: the old API remains public while
the new one is tested internally.

### Plan 008: build the shared Effect-native lifecycle

File: `plans/008-build-effect-native-compile-engine.md`

This plan implements the common mechanism through Effect's abstract platform
services:

- scoped child-process ownership and real interruption;
- concurrent bounded stdout/stderr drainage;
- sibling staging under the destination filesystem;
- validation of ELF, Mach-O, or PE output;
- SHA-256 calculation;
- atomic destination replacement;
- cleanup on success, failure, and interruption;
- a final Artifact only after publication.

It explicitly avoids raw Node APIs in reusable source, content stores, durable
records, fsync guarantees, retries, and compiler-specific flags.

### Plan 009: add Bun and Deno behavior and exercise the three axes

File: `plans/009-add-bun-deno-drivers-and-runtime-matrix.md`

This plan proposes final `effect-build/bun` and `effect-build/deno` modules.
Each module exposes a compiler service, a driver value, and a Layer.

It adds:

- PATH discovery and explicit executable override;
- observed tool version/path without runtime exact-version rejection;
- Bun options for minify, linked/inline sourcemaps, and bytecode;
- Deno correlated bundle/minify options and permissions;
- exact tool-specific target mappings;
- real compilation, config-inheritance, failure, target, and artifact tests;
- one unchanged compiler call hosted under Node, Bun, and Deno services;
- honest CI lanes that cannot pass by silently skipping absent tools.

This is the largest scope-expansion risk in the new plan set. The reviewer
should ask whether cross-target and three-host matrices are V1 product evidence
or a continuation of the earlier proof ratchet.

### Plan 010: hard-cut the public API and delete the managed system

File: `plans/010-hard-cut-public-api-and-delete-managed-proof.md`

Only after Plans 007-009 pass, this plan proposes:

- package exports limited to `.`, `./bun`, and `./deno`;
- root runtime exports limited to Artifact, BuildError, Target, and
  `compileExecutable`;
- deletion of requests, plans, prepared builds, records, evidence, content
  storage, materialization, execution-platform identity, old drivers, generated
  compatibility machinery, and their tests;
- rewritten documentation and examples centered on the two-input call;
- deterministic verification plus separately provisioned real-tool tests;
- no compatibility aliases or retained “advanced” managed tier.

This plan treats the current managed system as a separate, unowned product
rather than hidden implementation machinery. That conclusion must be reviewed.
The user asked for better developer experience and a TypeScript API; they did
not independently state that every managed capability must be destroyed.

## Alternatives that must be compared

Do not compare only minor variations of Plan 010. Evaluate at least these
different product/state models:

### Alternative A: no library

Document an idiomatic Effect subprocess recipe or contribute missing lifecycle
helpers upstream. Choose this if typed compiler options and artifact semantics
do not provide enough recurring value beyond Effect's process API.

### Alternative B: thin per-tool Effect wrappers

Expose `Bun.compileExecutable` and `Deno.compileExecutable` independently with
their native semantics. Share private lifecycle utilities only where code
actually repeats. Choose this if a common driver abstraction or Target model
creates more vocabulary than it removes.

### Alternative C: the proposed standalone common operation

Expose one `compileExecutable(driver, input)` with a shared lifecycle/result and
driver-derived options. Delete the managed product. Choose this only if the
common verb and result genuinely compress Bun and Deno without erasing their
differences.

### Alternative D: standalone API over retained private managed machinery

Give users the simple call while retaining some current planner/store machinery
behind it. Choose this only if those internals materially implement the simple
contract rather than forcing snapshots, content identity, records, and
materialization into a workflow that does not need them.

### Alternative E: two explicit products

Keep a standalone compilation product and a separately named managed/cache or
remote-build product. Choose this only if there is a concrete current user for
both. Do not retain the managed tier merely because work has already been spent
on it, and do not disguise two products behind modes or silently different
Layers.

### Alternative F: one compiler first

Ship only Bun or only Deno until a second real use case proves the common
abstraction. Choose this if supporting two compilers primarily serves as an
architecture demonstration rather than user demand.

## First-principles questions the reviewer must answer

### Product

1. Who concretely installs this package first?
2. What code would they otherwise write, and what repeatedly goes wrong in that
   code?
3. Is `compileExecutable` the actual job, or merely the easiest operation to
   demonstrate?
4. Is standalone executable compilation frequent enough to justify a package?
5. Does the product need both Bun and Deno now?
6. Is runtime-host interchangeability user value or only a sound dependency
   boundary?

### Effect-specific value

7. Which guarantee comes from Effect rather than ordinary typed TypeScript?
8. Does official process Scope already provide enough cancellation and cleanup
   that the remaining library is mostly argv rendering?
9. Is a compiler service and Layer the standard Effect shape here, or would a
   function returning an Effect be simpler?
10. Are platform services captured in the compiler Layer for a real ownership
    reason, or merely to produce `R = never` at the method boundary?
11. Should the host Layer be visible in the first README example, or can normal
    package composition make the first experience smaller without hiding an
    important dependency?

### API and data

12. Which common input fields are fundamental facts rather than convenience?
13. Should target be optional, and can the result report it truthfully when the
    compiler default was used?
14. Does Artifact need path, bytes, digest, target, and complete tool metadata?
    What immediate user decision consumes each field?
15. Does hashing a 50-100 MB executable by default earn its I/O cost?
16. Is BuildError's proposed union smaller and more useful than preserving the
    compiler's native diagnostic/exit information?
17. Do typed driver options reduce mistakes enough to justify maintaining a
    partial mirror of rapidly changing CLI flags?
18. Should unsupported options simply remain outside V1, or does that make the
    wrapper too incomplete to replace direct invocation?

### Behavior and guarantees

19. Is atomic replacement a core promise, an option, or out of scope?
20. Is sibling staging compatible with Bun and Deno across targets, especially
    when output paths or extensions are embedded or rewritten?
21. Is “previous complete file or new complete file” worth a cross-platform
    Windows locking contract in V1?
22. Should inherited environment and project config be the default, or should
    the package avoid making any default claim and expose the compiler more
    directly?
23. Are target-header inspection and cross-compilation validation product
    responsibilities or tests of the compiler itself?
24. Which failures should be typed by this library, and which should remain
    Effect interruption, platform failure, or compiler diagnostics?

### Current managed system

25. Does any current or near-term consumer need canonical identity, content
    storage, durable records, cache correctness, or remote execution?
26. Which existing managed modules directly pay for the standalone behavior?
27. Can useful process, staging, target, or test code be adapted without
    retaining the managed state model?
28. Would keeping the managed system create two canonical Artifacts and two
    driver workflows indefinitely?
29. Is deletion justified by product direction, or only by a preference for a
    smaller conceptual system?
30. What explicit user decision is required before Plan 010 is authorized?

### Plan proportionality

31. Do Plans 007-009 solve the developer-experience complaint, or recreate the
    original complexity in internal machinery and verification?
32. Which tests protect user-observable behavior, and which primarily certify
    the architecture to itself?
33. Is the Node/Bun/Deno host matrix necessary before the first useful release?
34. Is the Linux/macOS/Windows cross-target matrix necessary before the first
    useful release?
35. What could ship as one verified vertical slice before committing to the
    hard cut?

## Required review method

1. Read `AGENTS.md`, `package.json`, `src/index.ts`, representative managed
   ingress/execution/publication paths, current Bun/Deno drivers, and the tests
   that claim interruption, real compilation, cross-driver behavior, and CI
   coverage.
2. Read Plans 001-010, but treat them as arguments rather than authority.
3. Trace the current public workflow end to end and write down every concept a
   first user must understand.
4. Sketch the smallest direct Effect solution without `effect-build` and use it
   as the baseline competitor.
5. Trace the proposed two-input call through every proposed service, staging,
   process, validation, hashing, and publication step.
6. For each added primitive, state which invalid state, repeated error handling,
   or duplicated workflow it eliminates.
7. For each retained managed primitive, name its current consumer. “May support
   cache or remote execution later” is not a current consumer.
8. Separate observed repository facts, verified compiler behavior, user-stated
   goals, and reviewer inference.
9. Do not use proof, provenance, hermeticity, security, cache, or remote
   execution as justification unless a concrete consumer and trust/correctness
   model is first established.
10. Do not recommend deletion merely because the replacement diagram is
    flatter. Explain the behavioral and ownership payoff of every deletion.

## Required review output

Produce a self-contained response with:

1. **Verdict**: in two or three sentences, say which product—if any—should
   exist and whether Plan 010 is currently justified.
2. **First user and job**: a concrete scenario and the smallest successful
   call/result.
3. **Baseline competitor**: the smallest idiomatic direct-Effect implementation
   and exactly what it lacks.
4. **Unique value**: the one to four guarantees that make `effect-build` worth
   installing.
5. **Wrong questions**: identify where the discussion optimized distinctions
   that were not load-bearing.
6. **Right questions**: identify the decisions that must precede more
   architecture.
7. **Alternative comparison**: compare Alternatives A-F by user value,
   concepts introduced, behavior guaranteed, maintenance cost, and deletion
   consequences.
8. **Minimal API recommendation**: exact TypeScript call, result, error, service
   requirement, and option boundaries.
9. **Keep/delete/defer map**: list current concepts and files by disposition,
   with a reason and current consumer for anything retained.
10. **Plan critique**: for each of Plans 007-010, say keep, revise, split,
    reorder, or reject, and why.
11. **Smallest verified slice**: define what can ship first, how it will be
    tested with a real compiler, and which later commitments it deliberately
    avoids.
12. **Decision gates**: list the few questions requiring the user's explicit
    answer before destructive implementation begins.

If recommending a new plan, update planning artifacts only. Do not implement
source changes in the same review.

## Evidence and honesty rules

- Do not claim existing tests compare managed and direct output bytes unless
  both files are actually read and compared.
- Do not claim staging preserves byte identity; the output path may be compiler
  input.
- Do not call a digest or local JSON record proof of an untrusted build.
- Do not infer that PATH discovery, repository config, or lockfiles are trusted
  merely because they are convenient or commonly version-controlled.
- Do not claim cross-runtime behavior from typechecking or fake Layers; execute
  the public call under each claimed host if that support is part of the
  recommendation.
- Do not allow real-tool integration tests to pass by returning early when a
  tool is absent from a required lane.
- Do not specialize the product around `ts-release`.
- Preserve all pre-existing dirty work during review and planning.

## Source map

Start with:

- `AGENTS.md`
- `plans/README.md`
- `plans/001-establish-effect-build-architecture.md`
- `plans/002-bootstrap-and-model-contract.md`
- `plans/003-build-content-executor-and-recording.md`
- `plans/004-add-bun-cli-executable-driver.md`
- `plans/005-prove-normalization-with-deno-cli.md`
- `plans/006-freeze-api-compatibility-and-ci.md`
- `plans/007-freeze-standalone-compile-contract.md`
- `plans/008-build-effect-native-compile-engine.md`
- `plans/009-add-bun-deno-drivers-and-runtime-matrix.md`
- `plans/010-hard-cut-public-api-and-delete-managed-proof.md`
- `src/index.ts`
- `src/Build.ts`
- `src/BuildExecutor.ts`
- `src/CompileExecutable.ts`
- `src/Artifact.ts`
- `src/ExecutionPlatform.ts`
- `src/internal/ProcessExecutor.ts`
- `src/internal/DurableFileCommit.ts`
- `src/bun/BunCli.ts`
- `src/deno/DenoCli.ts`
- `.github/workflows/ci.yml`
- the integration, host, publication, architecture, and consumer tests named by
  Plans 007-010

Official compiler references:

- Bun standalone executables: `https://bun.com/docs/bundler/executables`
- Deno compile: `https://docs.deno.com/runtime/reference/cli/compile/`

The review is complete only when someone unfamiliar with the prior discussion
can explain both why the managed system was built and why the standalone
redesign was proposed—and can still disagree with either one.

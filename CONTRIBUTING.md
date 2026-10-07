# Contributing

How code in this repository should read. It applies to every change, written by a person or an agent, and review checks
a diff against it. [AGENTS.md](AGENTS.md) covers how to work: authority, scope and evidence. The README and `docs/`
document usage, and this file doesn't repeat them.

## Design

- **A binding is a `Context.Service`.** Its `make` resolves the executable with `Tool.make` and returns `Effect.fn`
  methods. Its inferred service shape is the definition test doubles, spans, and docs follow. The platform's own
  `NodeChildProcessSpawner` layer is the model: capture what a method needs at construction.
- **Three modes:**
  - **run** returns decoded output;
  - **stream** returns decoded events;
  - **session** is a scoped process with stdin, extra file descriptors, an event stream and its exit.
- **It is built on Effect's platform, not around it:** `ChildProcess` and `ChildProcessSpawner`, `FileSystem`, `Path`,
  `Stream`, `Sink`, `Config` and `Redacted`. A file a tool writes is a path, and there are no artifact records.
- **The default path runs the command and decodes its output.** Everything else is opt-in:
  - atomic outputs;
  - digests and verification;
  - version policy and per-command constraints;
  - env scrubbing;
  - layout checks.

  These defenses are combinators or options. They are never services, and never run on every call.
- **It isn't a build system or a container runtime.** No sandboxing, no hermeticity, no container executor.
- **Core is domain-free.** It knows tools, commands, processes and protocols, not Bun, ffmpeg or Apple.
  - A concept enters core only when two bindings need it for the same reason.
  - Bindings use the same public API as everyone else; first-party bindings aren't privileged.
- **A tool's quirks stay in its binding:** Bun's `.exe` suffix, Deno's basename rule, ffmpeg's progress format.

## Where code lives

- `packages/effect-build/src/` is core. It holds one module per concept, named for it in PascalCase and exported as a
  namespace from `src/index.ts`.
  - Implementation detail goes in `src/internal/`, which the export map closes.
  - There are no `utils/`, `common/`, `shared/` or layer folders: they hide who owns what.
  - A type lives beside the code that produces it.
- Every other package wraps one tool or toolchain and depends on core only.
- `effect-build/testing` is the public test kit: thin defaults over the platform's spawner and handle constructors. There are no private helper packages for tests.
- Tests go in two places:
  - `test/unit/` holds files named after the module or binding they exercise. They use the fake spawner and no real
    tools.
  - `test/integration/` holds one file per binding, run against the real tool.
- Each example in `examples/` is a small workspace that typechecks through `tsconfig.examples.json` and runs in
  `test:examples`. Every code sample in the documentation comes from one.
- Build output goes in ignored `dist/`.

## API design

- **Copy Effect's precedent.** When Effect already has a shape for the problem, use it rather than inventing a parallel
  one:

  | Concern                            | Use                           |
  | ---------------------------------- | ----------------------------- |
  | Capabilities and how they're built | `Context.Service` and `Layer` |
  | Data                               | `Schema`                      |
  | Sequences                          | `Stream`                      |
  | Sinks of bytes                     | `Sink`                        |
  | Lifetimes                          | `Scope`                       |
  | Retry and recurrence               | `Schedule`                    |
  | Settings and secrets               | `Config` and `Redacted`       |

  Follow Effect's naming too: `make`, `layer`, and `layerConfig`. If a precedent doesn't fit, say why in the
  pull request.
- **The simple path is the default; extras are opt-in.** A feature only some callers need is an option or combinator
  chosen by the binding author or the caller. It never runs on every call, and it never becomes a service
  that holds a decision.
- **Requirements don't leak.** A binding's methods require no other service, and its layer requires only platform
  services. The one requirement a caller supplies is `Scope`, for a method that returns a resource tied to a lifetime
  (a session), as `ChildProcessSpawner.spawn` does. Don't pass a scope as an argument to avoid it.
- **Don't re-model the platform.** A file is a path you read with `FileSystem`, and output bytes are a `Stream`. A
  digest is computed when someone asks for it.
- **Types carry the information.**
  - A method's input and output are typed. Schemas decode actual tool output and configuration boundaries.
  - Its failures are an exact union.
  - No public signature uses `unknown` for a shape you know.
- **The surface is small.**
  - Every export has a caller.
  - An exported function that takes a subject also has its pipeable form (`Function.dual`), as Effect's modules do.
  - Don't mirror every flag of a tool. Expose a typed subset, `extraArgs` for further arguments, and forward
    `mapCommand` to `Tool.make` for native command options. Don't add parallel process options.
  - `env` accepts `Environment.Variables`; reveal it with `Environment.reveal` and pass its `redact` to the run.
  - An option exists only for a real choice, and has a documented default.
- **Use plain words.** The API settles the final names; keep one word per concept, and list the names in the README.
  Don't use producer, provider, artifact record, admission, durable, adoption, lane or claim.

A service resolves its tool in `make`, captures only the platform services its methods need, and returns the methods
callers run. Build a fresh context containing those services instead of capturing the full construction context;
method calls must retain the caller's tracing and Scope. Tests substitute the same inferred service shape with
`Layer.succeed(Service, Service.of(...))`.

## It reads on its own

- **Comments give the reason, in plain words.**
  - They never cite plans, issues, review findings or line numbers elsewhere: nobody can follow those, and they go stale.
  - If the code already says it, there is no comment.
  - A measured number stays, with what was measured.
- **One name, one thing.**
  - There is no alias that only dodges a clash.
  - Nothing is named like a root Effect export or an imported platform module unless it is that thing.
    `Tool` names a native executable; alias it when importing Effect AI tools in the same file.
  - An `Effect.fn` name matches its function.
- **Short lines, one statement each.**
  - `bun run format` applies dprint at 120 columns. Until the repository is formatted as a whole, format only the files
    you change: `bunx dprint fmt <files>`.
  - Use a `switch`, a lookup table or a named helper instead of a nested ternary.
  - A `switch` over a union handles every member, or says with a `default` that it handles only some.
- **One path; delete, don't deprecate.**
  - A change replaces the old path and updates every consumer in the same change.
  - There are no aliases, compatibility exports, `@deprecated` tags or shims.
  - Nothing exists with only one side: no option nobody reads, no export nobody imports.
- **Fix a finding rather than silence it.**
  - `.oxlintrc.json` is the policy. It covers every Effect diagnostic in `@effect/tsgo`'s four presets,
    typescript-eslint's strict type-checked rules, and bans on unwrapping and on leaving the runtime in library code.
    `bun run lint` denies warnings.
  - A genuine exception says why, in `// oxlint-disable-next-line <rule> -- <reason>`. Lint reports a directive that no
    longer suppresses anything.
  - `.oxlintrc.legacy.json` lists the files that predate the policy and still break a rule. A path goes once its file
    is fixed, and `bun run check:lint-legacy` fails until it does. Nothing is ever added to it.

## Effect

Read `node_modules/effect/AGENTS.md` completely before writing Effect code, then its `ai-docs`, declarations and source
for the APIs you use.

- **Services.**
  - A service is a `Context.Service` with a `layer` built with `Service.of` beside it, and one concern.
  - Its key names its package and module.
  - Constructors are `make`, `layer` and `layerConfig`. Test doubles are `Layer.succeed(Service, Service.of(...))`;
    a named `layerTest` exists only when a binding ships a reusable double.
  - A service with one implementation, one caller and no seam folds into its caller.
- **Functions.**
  - Every public operation is `Effect.fn("Module.operation")` with a stable span name.
  - Internals and hot paths use `Effect.fnUntraced`, and inline code uses `Effect.gen`.
  - No function exists only to return `Effect.gen`.
  - An operation without arguments is an `Effect` value.
- **Processes run through `ChildProcessSpawner`,** never `node:child_process`.
  - A process belongs to the scope that started it, and is killed when that scope closes, with an explicit signal and
    grace period.
  - Output is consumed as a `Stream`, and nothing buffers unbounded output.
- **Asynchronous work is an Effect or a Stream**, never a bare Promise, callback registry or set of tracked promises.
  - Every resource belongs to a `Scope`, and there are no daemon fibers.
  - A deadline is an Effect deadline (`Effect.timeoutOrElse`), so `TestClock` drives it.
  - Effect code never calls `Date.now()`, `new Date()`, `setTimeout` or `Math.random()`.
- **Host facts come from `Config` or a `Context.Reference` defaulted at the edge.** That covers the platform, the
  architecture and `PATH`. Library code never reads `process.*`.
- **Errors are exact.** Reasons are tagged error classes.
  - Expected failures are Schema tagged errors that route on a tagged `reason` (`Effect.catchReason`).
  - Every operation's type names its exact union.
  - Library code fails with `return yield* error`, and never throws.
  - A foreign cause is a `cause: Schema.Defect()` field, never `String(error)`.
  - A bug stays a defect, and `orDie` is never used to hide an expected failure.
- **Schema classes, errors included, are built from their fields.** Never override a constructor; a derived form gets a
  named static factory. Construct one with `make`, not `new`.
- **Spans name the method (`Binding.method`).** They carry no argv, env, or output. A `ToolError` never stores argv,
  env, or stdout; its bounded stderr tail removes supplied `Redacted` values before trimming.
- **Layers are composed, then provided once.** Library code never calls `Effect.provide` with a concrete layer or
  `Effect.run*`; examples and tests provide at their edge.
- **Configuration is read by the layer that uses it.** An executable override, a version range or a credential comes
  through `Config` or a layer option, never from `process.env` at import.
- **Cleanup failures are kept.** A finalizer that can fail records the failure or dies, and never discards it.

## Data at the boundaries

- **Schemas describe decoding boundaries.** Tool output, configuration files, and persisted records each have a Schema.
  Plain call arguments use TypeScript types.
- **Decode once, where the data comes in, and as an Effect** (`Schema.decodeUnknownEffect`, `Schema.fromJsonString`).
  - Never use `JSON.parse` followed by shape probes, and library code never uses `*Sync` decoding.
  - There are no `as` casts, `any`, non-null assertions or hand-written type guards; use `Predicate`.
- **Numbers are `Schema.Finite` or `Schema.Int`.** Durations in options are `Duration.Input`.
- **Tool output is untrusted.** A failure keeps a bounded stderr tail for diagnosis, with every `Redacted` input value
  removed.
- **Secrets are `Redacted` input fields.** They are revealed only when argv or env is rendered, and never appear in
  spans, errors or logs.
- **Digest reads are fresh; callers choose memoization.** Use `Effect.cached` for the chosen output and lifetime;
  verification always reads current bytes. A persisted record is read back through the Schema that wrote it,
  declared once with `Schema.toCodecJson`.

## Tests

- **Failure first.**
  - A test for a fix is written before the fix, and seen failing on the current code.
  - Add a test only for a consequential behaviour, or for a concrete failure nothing else covers. The `testing` skill
    describes the choice.
- **Effect tests use `@effect/vitest`** (`it.effect`, `layer`, `assert`).
  - Time is controlled with `TestClock`.
  - Wait for something observable, never a fixed sleep, and there is no `Effect.run*` in a test.
- **Every binding is tested twice.**
  - Its argv rendering and output decoding are tested with the fake spawner.
  - Its real behaviour is tested with the real tool in `test/integration/`.
- **Tests use real files and real tools:** compile a real program and read its real output. Don't add tests that assert
  the shape of an API or the contents of a workflow file.
- **Assert failures by tag and reason.** Keep each check at its strongest boundary, and drop matrices that repeat one
  another.

Integration tests need the tool installed. Point the variable at a binary, or leave it unset to use `PATH`. This table
changes as bindings are added and removed; update it in the same change.

| Command                             | Tool selection                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run test:integration:bun`      | `EFFECT_BUILD_BUN`; CI uses 1.3.14 and 1.4.2                                                   |
| `bun run test:integration:deno`     | `EFFECT_BUILD_DENO`; 2.9.5                                                                     |
| `bun run test:integration:node-sea` | `EFFECT_BUILD_NODE`; CI uses 26.7.0                                                            |
| `bun run test:integration:nfpm`     | `EFFECT_BUILD_NFPM_BIN`; 2.47.0, plus a C compiler and archive tools                           |
| `bun run test:integration:python`   | `EFFECT_BUILD_UV_BIN`; 0.12.0, plus Python                                                     |
| `bun run test:integration:sbom`     | `EFFECT_BUILD_SYFT_BIN`; 1.50.0                                                                |
| `bun run test:integration:tool`     | native process and pipe behavior on Linux, macOS and Windows                                   |
| `bun run test:integration:ffmpeg`   | `EFFECT_BUILD_FFMPEG` and `EFFECT_BUILD_FFPROBE`; native ffmpeg/ffprobe                        |
| `bun run test:integration:apple`    | macOS codesign; notarytool/stapler diagnostics without credentials                             |
| `bun run test:integration:windows`  | an elevated, disposable Windows environment with SignTool (or `EFFECT_BUILD_SIGNTOOL`) and Bun |

## Validation

Iterate with the smallest check that can invalidate the change, then run the relevant gate once on the final change.

| Change                         | Gate                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Any change to code             | `bun run verify`: build, public surface, API docs, typecheck, lint, release tests, unit tests and examples |
| A binding                      | the above, plus its `bun run test:integration:<tool>`                                                      |
| A public export or package map | the above, plus `bun run test:consumer`                                                                    |
| The release script             | `bun run test:release`                                                                                     |
| Documentation only             | `bun run format:check` and `git diff --check`                                                              |

`test:consumer` packs every public package and installs the tarballs in a clean project with strict peers. It then
typechecks every export with `skipLibCheck: false` and runs a program against the installed packages. Report checks that
couldn't run, and why.

## Dependencies

- Prefer a platform or Effect primitive to a new dependency.
- Declare a dependency in the package that imports it, at one exact version. Effect packages stay aligned on one
  release.
- A new runtime dependency needs a license compatible with MIT, and keeps its required notices.

## Documentation

- **The README and `docs/` are for someone using the packages:** what they do, how to use them, and their implemented
  limits.
  - Edit a page as a whole.
  - No release histories, rename lists or defensive explanations.
  - `CHANGELOG.md` records changes, newest first, with one section per published version.
- **Every code sample in the documentation comes from a typechecked file in `examples/`.**
- **Documentation stays shorter than the code it describes.** A durable decision is one line under "Decided" in
  `DESIGN.md`.

## Pull requests and commits

- A commit message says what changed and why, in plain words, without plan, finding or ticket IDs.
- A pull request says how behaviour differs before and after, which boundary it touches, and which checks actually ran.
  - Name the checks that didn't run: other platforms, signing identities, tools that weren't installed.
  - When a future contributor could reasonably propose a rejected alternative again, say why it was rejected.
- Update package maps, consumers, examples, and required CI checks in the same change as a public cutover.

## Releasing

A new lockstep version tagged from main after the complete CI matrix passes triggers the [release workflow](.github/workflows/release.yml).

- It builds and verifies once.
- It retains the exact tarballs and their SHA-512 manifest in a 90-day Actions artifact.
- It runs the installed-consumer check against those tarballs.
- It publishes with npm provenance.

Rerun the same workflow to resume.

- Already-published versions are compared byte for byte; identical ones are skipped, and a mismatch stops publication.
- A retry never repacks.
- A missing candidate artifact stops recovery.

Preparing or testing a release doesn't authorize publishing one.

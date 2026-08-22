# Post-0.3 provider capability and composition matrix

Status: final architecture evidence after executable falsification. This file
changes no production API.

Repository baseline:

- released source: `v0.3.0` at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`;
- release-line base: `codex/granular-integration-program` at
  `15c811bb9904142a33d119766b62082f3c689f13`;
- research branch: `codex/post-0.3-native-capability-architecture`;
- executable research workflow: `.github/workflows/architecture-research.yml`;
- research fixtures: `research/post-0.3/`.

## Evidence rule

Architectural validity and product priority are separate questions.

An abstraction is architecturally valid when it has coherent laws, truthful and
useful semantics, explicit ownership, finite failure modes, substitutable
implementations, and a stable reason to exist. Lack of a prior adopter is not a
falsifier.

Product priority decides whether a valid abstraction ships in 0.4, later, or in
a separate package. Priority may consider implementation size, release risk,
and whether two supported adapters can ship together. It does not retroactively
make a coherent role invalid or experimental.

Evidence labels used below:

- **Upstream**: official documentation, declarations, or provider source.
- **Repository**: released `effect-build` source or tests.
- **Execution**: a real tool, host, provider, or package exercised by the
  research workflow.
- **Decision**: selected architecture.
- **Falsifier**: an observed fact that rejects a proposed contract.
- **Gate**: a fact that still requires a later implementation probe.

## Permanent provider-native policy

Provider `Api` and `Command` modules are permanent, supported, canonical product
surfaces.

They are not temporary escape hatches that applications use until a profile is
invented. A profile is additive: an application chooses it only when the
application-visible role excludes provider-specific distinctions.

Therefore:

- provider-native options, callbacks, plugins, graphs, diagnostics, and output
  values remain first-class indefinitely;
- a profile never deprecates the richer provider surface;
- adding a profile is not evidence that direct use is a design failure;
- failing to satisfy a profile does not make a provider incomplete;
- provider package documentation leads with direct `Api` and `Command`
  operations, then lists optional profiles.

## Independent axes

Every public API keeps these choices independent:

1. Effect orchestrator host;
2. selected provider or executable;
3. host API versus selected-command lane;
4. output runtime;
5. native system target;
6. borrowed versus durable ownership;
7. compatibility status of the exact selected tool.

Calling `Bun.build()` requires a Bun host. Calling a selected Bun executable
does not. A Bun executable and a Deno executable can share a file observation
without sharing runtime semantics. A one-shot API Promise and a scoped command
can produce similar bytes without sharing cancellation semantics.

## Executable research receipts

The research workflow constructed representative applications and adversarial
fixtures instead of waiting for external adopters.

### Ownership laws

Eight law tests passed:

1. tested versions are accepted;
2. untested versions require an explicit override;
3. known-incompatible versions and missing capabilities cannot be overridden;
4. one continuation preserves cleanup, mutation detection, and caller failure
   identity;
5. the nested `withProgram(... program.withFile(...))` callback cannot prevent
   raw path escape beyond what cleanup already enforces;
6. one continuation plus a closure-owned file Effect retains typed expiry;
7. an ordinary scoped handle does not make escaped values linear;
8. closure-owned borrowed authority works across compatible duplicate module
   copies.

### Provider and consumer executions

- Bun 1.3.9 and Esbuild produced the same runnable Node main. Importing the
  generated output exposed a semantic difference: Bun still reported main-entry
  behavior while Esbuild reported imported-module behavior.
- Bun and Deno produced valid native files with common durable observations, but
  execution reported different embedded runtimes: `bun` and `deno`.
- Bun and Deno both produced browser HTML, JavaScript, and CSS when CSS was
  module-reachable. Deno dropped a top-level linked stylesheet in the broader
  adversarial fixture.
- Deno declaration output and `tsc` declaration output had different topology.
  Deno 2.9.3 and 2.9.5 emitted a declaration file with an unresolved local
  import in the test fixture. Rolldown plus `rolldown-plugin-dts` emitted one
  self-contained declaration file.
- Bun and Deno watch commands both rebuilt and could be terminated, but neither
  exposed a documented machine-readable readiness or rebuild-event protocol.
- Esbuild and Rolldown both satisfied a scoped incremental Node-main rebuild
  role.
- Node SEA and `@yao-pkg/pkg` both accepted one bundled CommonJS main and
  produced a runnable Node executable with the same application result. The
  research `pkg` adapter also demonstrated provider-owned runtime acquisition,
  which a production adapter must make explicit or pre-provision.
- Node 25.5.0 and 26.7.0 each built and ran same-version SEAs. A Node 26.7.0
  builder accepted a Node 25.5.0 target executable despite official guidance
  requiring matching versions; execution of that mismatch remains a gate.
- Deno 2.9.3 `Deno.bundle()` succeeded for local reads and writes without the
  permissions asserted by the official declaration comments. Compiled output
  exposed `Deno.bundle` as absent (`TypeError: Deno.bundle is not a function`).
- Independent package versioning was proved with packed mock consumers: a
  provider `0.7.0` accepted core `0.4.0` through a peer range and rejected core
  `0.5.0` under strict peer resolution.

## Portable profile and composition decision table

| Candidate role | Implementations exercised | Architectural result | 0.4 product result | Decisive falsifier or law |
|---|---|---|---|---|
| Runtime-neutral source/project to executable | Bun command, Deno command | Rejected | Direct provider operations only | Embedded runtime identity differed (`bun` versus `deno`); permissions, project authority, and target semantics also differ |
| Bun-runtime source to executable | Bun host API, Bun command | Coherent provider-local role | Permanent Bun `Api` and `Command`; no core profile | Two lanes have different interruption semantics and no cross-provider substitution value |
| Deno-runtime project to executable | Deno command | Coherent provider-native role | Permanent Deno `Command`; no core profile | Deno permissions, includes, workers, project detection, runtime acquisition, and engine policy are the role |
| Node main program | Bun command, Esbuild context | Valid | Ship as `Profile/NodeMainProgram` | Direct execution conformed; importable-module semantics did not, so `main` is part of the contract |
| Node main to Node executable | Node SEA, research `pkg` adapter | Valid | Ship as `Profile/NodeMainExecutable` with Node SEA adapter | Both produced a runnable Node executable from one bundled main; runtime acquisition stays Layer/provider policy |
| Source to Node executable | Bun/Esbuild producers plus Node SEA/`pkg` assemblers | Valid composition, not a new primitive | Ship `Recipe/NodeSourceExecutable` in core | It is exactly composition of the two roles and selects neither producer nor assembler |
| Browser module application | Bun command, Deno command | Valid after narrowing | Ship as `Profile/BrowserModuleApplication` | Module-reachable CSS/assets and rewritten HTML conformed; arbitrary top-level linked resources did not |
| Browser module output set without HTML | Bun command, Deno command | Valid | Do not ship in 0.4; overlaps the application profile | It is coherent, but a second near-duplicate public profile would increase concepts without adding a distinct 0.4 consumer role |
| Rolled-up declaration file | Deno 2.9.3/2.9.5, Rolldown+dts | Rejected for current providers | No 0.4 profile | Deno emitted an unresolved local type import while Rolldown emitted a self-contained rollup |
| Generic declaration output set | Deno, `tsc` | Rejected | Provider-native outputs only | One rolled-up entry and a module declaration tree are different output topology |
| Durable multi-file application bundle | Bun and Deno direct writes | Not established | No 0.4 durable bundle artifact/profile | No common cross-platform replacement/commit law; interruption may leave provider-written partial output |
| Incremental Node main | Esbuild context, Rolldown build object | Valid | Defer public export until after 0.4 | Scope/rebuild/close laws conformed; 0.4 ships only one supported integration adapter, so deferral is product sequencing, not invalidity |
| Typed cross-provider command-watch events | Bun watch, Deno watch | Rejected | No 0.4 typed watch API | Human stdout/stderr did not provide a stable machine-readable readiness or rebuild boundary |
| Opaque command-watch process | Bun watch, Deno watch, Effect process API | Coherent but redundant | Do not publish in provider modules for 0.4 | It adds no invariant beyond Effect `ChildProcess`; raw logs/exit remain provider process behavior |
| Signed executable | Node/macOS/Windows signing systems considered | Not established | No profile | Trust authority, signature identity, platform mutation, and verification differ; in-place mutation would invalidate the input observation |

## Accepted 0.4 profile contracts

### `NodeMainProgram`

1. **Application role**: produce one JavaScript main entry for Node execution.
2. **Request authority**: one filesystem entrypoint, optional cwd, ESM or CJS.
3. **Output topology**: one borrowed file plus exact format, Node resolution,
   observed externals, and build steps.
4. **Runtime/target meaning**: Node main-entry semantics, not a general importable
   module and not a Node executable.
5. **Ownership**: one outer continuation owns cleanup. The borrowed value exposes
   a closure-owned `file` Effect that rechecks liveness, byte count, and digest.
6. **Interruption**: the adapter must close temporary output after every callback
   Exit. The Bun adapter uses the command lane; the Esbuild adapter uses a
   scoped context.
7. **Typed failure**: normalized profile kind plus exact provider error; callback
   failures, defects, interruption, and mixed Causes are untouched.
8. **Provider information**: direct modules retain full options/results/errors;
   the profile retains provider name, exact error, external observations, and
   steps.
9. **Implementations**: Bun selected command and Esbuild scoped context.
10. **Falsifier**: either implementation behaves differently when run as a main,
    silently emits side-output dependencies, weakens cleanup, or requires a
    provider-only request field.

### `NodeMainExecutable`

1. **Application role**: assemble one existing bundled Node main into one Node
   runtime executable.
2. **Request authority**: observed file or bytes, CommonJS/ESM format, outfile,
   optional canonical system target and digest.
3. **Output topology**: one durable `Artifact.Executable` with runtime name
   `node`, observed runtime version when available, system target, and steps.
4. **Runtime/target meaning**: Node runtime only. Bun and Deno runtime binaries
   do not implement this profile.
5. **Ownership**: adapter privately copies/materializes the main, validates the
   copy, stages one executable beside the destination, then atomically renames.
6. **Interruption**: before rename, child/staging are cleaned and destination is
   unchanged; rename is the point of no return.
7. **Typed failure**: invalid main, unavailable/incompatible tool, assembly,
   validation, target, and publication failures plus exact provider error.
8. **Provider information**: direct Node SEA and future `pkg` modules retain
   assets, snapshots, cache, package graph, signing, acquisition, and provider
   diagnostics. The profile excludes those distinctions.
9. **Implementations**: Node built-in SEA and a research `@yao-pkg/pkg` SEA-mode
   adapter. A production `pkg` adapter must eliminate hidden network acquisition
   or make acquisition explicit at Layer construction.
10. **Falsifier**: an implementation cannot accept one already-bundled main,
    embeds a non-Node runtime, cannot provide one validated durable file, or
    requires project-graph semantics to preserve correctness.

### `BrowserModuleApplication`

1. **Application role**: produce one deployable browser HTML module application.
2. **Request authority**: one HTML entrypoint and cwd. Script module imports own
   CSS/assets. Arbitrary provider plugins and raw provider options are excluded.
3. **Output topology**: one borrowed tree containing rewritten HTML and every
   module-reachable JavaScript, CSS, and asset file. Every emitted local
   reference resolves inside the tree manifest.
4. **Runtime/target meaning**: browser deployment; no Node, Bun, or Deno runtime
   claim.
5. **Ownership**: one continuation owns a temporary tree. File enumeration and
   access are closure-owned Effects with root containment and digest checks.
6. **Interruption**: command adapter interruption terminates/reaps the selected
   tool and removes the entire tree.
7. **Typed failure**: invalid request, tool compatibility, build diagnostics,
   invalid/missing manifest reference, mutation, and host I/O, with exact
   provider error retained.
8. **Provider information**: direct Bun/Deno modules retain native output
   metadata, config, logs, and all broader bundling behavior.
9. **Implementations**: Bun command build and Deno command bundle.
10. **Falsifier**: a provider drops a module-reachable file, emits a local HTML
    reference outside the manifest, requires provider-only request fields, or
    cannot preserve whole-tree cleanup.

## Rejected executable-production generalization

`Artifact.Executable` is a common durable result observation. It is not proof
that executable production has one common request.

The research executable reported:

```text
Bun request -> Bun runtime executable
Deno request -> Deno runtime executable
Node main    -> Node runtime executable
```

A type parameter such as `ExecutableProducer<Runtime>` does not remove the
request differences. Bun source options, Deno project/permission authority, and
Node main assembly are distinct products. Core therefore exposes a common
artifact observation and the one validated Node-main assembly profile, not a
universal builder.

The supported cross-provider executable path is:

```text
NodeMainProgram.Bundler
  -> NodeMainExecutable.Assembler
  -> Artifact.Executable<"node">
```

A provider-neutral recipe composes those services. Bun/Deno runtime executable
production remains permanent direct provider API.

## Lifecycle state-machine matrix

| Family | Requested/validated/selected | Started/ready/update | Cancellation/release | Durable boundary | Public shape |
|---|---|---|---|---|---|
| One-shot host API without cancel | request and provider validation; no selected child | Promise started, result observed | fiber can stop awaiting; provider work/direct writes may continue | provider-specific; no rollback claim | `Effect<Result, ProviderError>` |
| One-shot selected command | request, deterministic validation, compatible tool selected | child started, streams drained, exit observed | interruption terminates and force-reaps child | none unless operation later publishes | `Effect<Result, Error>` with internal Scope |
| Scoped provider context | request and options validated | context started; rebuild/watch/serve become ready provider state | Scope invokes cancel/release exactly once | provider writes remain provider semantics | `Effect<Handle, Error, Scope>` |
| Long command/watch | request, tool selected, child started | readiness/rebuild only if provider offers a stable protocol | Scope terminates/reaps; exit can be unexpected | provider writes may already exist | no generic 0.4 API; use provider-specific future handle or Effect process directly |
| Borrowed file/tree | request validated, producer started | borrowed capability ready; file/tree re-observed on access | continuation Exit closes root | never durable by returning value | callback/continuation |
| Durable single file | request, tool selected, sibling staging allocated | candidate written and validated | interruption before commit cleans; release after work | atomic rename | `Effect<Artifact.File, Error>` |
| Provider direct multi-output | request and provider validation | files may appear incrementally | interruption may leave partial output | provider-specific and possibly multiple | provider-native `Effect<Result, Error>` |
| Executable assembly | main copied/materialized; tool selected | executable candidate built and inspected | child/staging cleanup before commit | atomic rename | `Effect<Artifact.Executable, Error>` |
| Matrix | whole request preflight, cells selected | bounded cells start/finish independently | interruption stops active/queued work | each successful cell commits independently | one `Effect`, failure includes committed partial artifacts |
| Signing/post-production mutation | input artifact observed, signing authority selected | private copy mutated and verified | original remains unchanged | new output rename | future provider-specific `Effect`; never mutate the input artifact in place |

Telemetry spans describe these transitions for operators. They are not an
application event protocol.

## Command-watch result

The research rejects a generic typed command-watch event surface for Bun and
Deno 0.4.

Observed facts:

- both commands can produce an initial output and rebuild after file mutation;
- both can be terminated by Scope/process ownership;
- Bun reports human-readable stdout; Deno reports human-readable stderr;
- neither help surface advertised machine-readable readiness/rebuild events;
- parsing those strings would couple the public contract to unstable prose and
  terminal formatting.

Consequences:

- provider `/Command` remains an app-facing provider API, but 0.4 exposes no
  command watch method;
- `Author/Tool` selects and validates a tool but does not wrap Effect process
  streams;
- integration authors use official Effect `ChildProcess` for raw process
  ownership;
- a future provider may expose `Effect<ProviderWatchHandle, E, Scope>` when it
  has a stable machine protocol or provider API;
- raw stdout/stderr, exit, termination, force-kill, and backpressure remain
  Effect process responsibilities;
- telemetry logs/spans do not become rebuild events.

## Tool-version compatibility policy

Compatibility belongs to the provider package and lane. Core supplies the
observation/error vocabulary and reusable compatibility evaluator.

### Initial executable evidence

| Provider lane | Oldest exercised | Newest/current exercised | Required capability evidence |
|---|---:|---:|---|
| Bun selected command | 1.3.9 | 1.3.14 | build, compile, watch flag, metafile, real build |
| Bun host API | 1.3.14 | 1.3.14 | build output, compile mode, browser HTML/CSS/JS |
| Deno selected command | 2.9.3 | 2.9.5 | bundle, watch flag, declaration flag, platform, real build |
| Deno host API | 2.9.3 | 2.9.3 | unstable API, memory/write result; permission behavior contradicted docs |
| Esbuild package API | 0.28.1 | 0.28.2 | build, context, rebuild, cancel, dispose |
| Node SEA builder/target | 25.5.0 | 26.7.0 | same-version build and execution; mismatched version remains gated |

These are evidence ranges for the implementation plans, not a promise that
arbitrary future majors are accepted.

### Hybrid contract

1. Each provider lane declares its tested semantic range and known-incompatible
   versions.
2. Each operation declares required capabilities in addition to the version
   range.
3. Layer construction observes the exact host/package/command version.
4. Known-incompatible versions and missing capabilities fail before output
   mutation with `ToolVersionUnsupported`.
5. An untested version fails by default.
6. `allowUntestedVersion: true` permits an unknown-but-capable version, emits a
   structured warning, and records `compatibility: "untested-override"` in
   tool/build-step observations.
7. The override never bypasses capability checks, output validation, cleanup,
   target inspection, or publication laws.
8. No auto-installation, fallback version, PATH substitution after Layer
   construction, or hidden provider switch occurs.

### Ownership of compatibility facts

- Bun host API support belongs to `effect-build-bun/Api` and the Bun runtime
  version.
- Bun command support belongs to `effect-build-bun/Command` and the selected
  executable version.
- Deno host and command versions are distinct facts even when equal.
- Esbuild support belongs to the installed Esbuild package API version.
- Node SEA records both builder Node and target/base Node. Until the mismatch
  gate closes, ordinary support requires equal versions.
- TypeScript declarations are released with the provider package: `bun-types`
  must cover the supported Bun host range; Deno structural declarations are
  conformance-checked against both range boundaries; Esbuild uses its package
  declarations.

A new upstream patch can become supported through a provider-package release
after boundary, capability, lifecycle, and packed-consumer CI passes. A core
release is unnecessary unless a core profile or author contract changes.

## Package versioning conclusion

Permanent provider-native surfaces make permanent lockstep versioning
unnecessary and increasingly harmful.

Decision:

- perform the coordinated 0.4 hard cut with all five packages aligned for
  migration clarity;
- after 0.4, allow provider packages to release independently;
- provider packages declare bounded peer ranges on core;
- profile protocol versions are explicit and independent from npm versions;
- a provider compatibility-range widening normally changes only that provider
  package;
- recipes depend on core profile protocols, not synchronized provider package
  versions.

The packed research consumer proved that strict peer ranges can accept a
compatible core and reject an incompatible next core.

## Public primitive rent audit

| Proposed primitive | Unique invariant | Effect/provider foundation | Decision | Why narrower/internal is or is not enough |
|---|---|---|---|---|
| `Author/Command` | None beyond a selected-tool policy; execution/streams/Scope/kill already exist in Effect | Effect `ChildProcess` and `ChildProcessSpawner` | Remove from public proposal | A wrapper would duplicate process options and handles, then become stale; bounded one-shot capture may remain private to providers |
| `Author/Tool` | Canonical selected executable, exact version, capability check, compatibility status, no fallback | Effect Path/FileSystem/ChildProcess | Public | Third-party command integrations need the same observable compatibility and selection law; a private helper would force incompatible provider observations |
| `Author/TemporaryOutput` | Cleanup-root ownership and mutation/liveness | Effect Scope/FileSystem | Rename to `Author/BorrowedOutput` and keep public | Scope alone is not linear and does not prevent destination overlap or stale digest use; profile adapters need files and trees |
| `Author/Executable` | Same-parent staging, native inspection, target resolution, optional digest, atomic publication | Effect FileSystem/Path/Crypto plus provider producer | Keep public | This is the reusable durable single-file law used by Bun, Deno, Node SEA, and future assemblers |
| `Author/CommandCompiler` | No unique invariant beyond Tool + validation + Executable + matrix composition | Provider option schemas and command rendering | Remove from public proposal | It bundles Bun/Deno convenience policy, service construction, target tables, and matrix shape; it does not fit builds, watch, Node SEA, or provider APIs and does not reduce invalid states beyond smaller primitives |
| `HostPath.Absolute` | Ambiguous: absolute syntax versus point-in-time observation | Effect Path/FileSystem | Rename to `HostPath.Observed` | The type records a canonical absolute path observed at a time; no decoder or name may imply continuing existence |
| `SingleNodeProgram.Borrowed` | Correct borrowed role but overbroad semantics and redundant nested callback | BorrowedOutput plus provider adapter | Rename/simplify to `NodeMainProgram.Borrowed` | Main-entry semantics were executable evidence; one continuation plus closure-owned file Effect preserves all laws with fewer states |

## Source and path decision

No universal `SourceLocator` is added. Provider inputs include filesystem paths,
URLs, packages, project directories, stdin, virtual files, HTML roots, and
plugin-owned modules. A wrapper around `entrypoint` and `cwd` creates no common
authority.

`HostPath.Observed` means only:

- the active host Path/FileSystem services canonicalized an absolute path;
- the path was observed at a particular operation boundary.

It does not mean remote identity, current existence forever, serializability, or
reproducibility. Construction is effectful; there is no syntax-only Schema that
pretends to re-establish the observation.

## Remaining empirical gates

1. Execute and inspect the mismatched Node 26.7 builder / Node 25.5 target SEA;
   built-in Node accepted the request despite official matching guidance.
2. Run Deno host API permission and result-shape probes at both supported
   boundaries; 2.9.3 contradicted its declaration comments for local read/write.
3. Interrupt provider-owned multi-output writes during real output mutation and
   record exactly which files remain.
4. Prove `HostPath.Observed`, borrowed tree containment, and directory cleanup on
   Linux, macOS, and Windows.
5. Prove native Effect span/log names and redaction across every supported Effect
   endpoint.
6. Characterize signing on macOS and Windows with real credentials before any
   signing role is proposed.
7. If a production `pkg` adapter is considered, eliminate hidden acquisition or
   model it explicitly at Layer construction.

## Evidence index

### Repository and executable fixtures

- `research/post-0.3/architecture-laws.test.mjs`
- `research/post-0.3/duplicate-core.test.mjs`
- `research/post-0.3/provider-conformance.mjs`
- `research/post-0.3/profile-refinement-probe.mjs`
- `research/post-0.3/external-provider-probe.mjs`
- `research/post-0.3/version-boundary-probe.mjs`
- `research/post-0.3/node-sea-version-probe.mjs`
- `research/post-0.3/independent-versioning.mjs`
- released 0.3 public API and lifecycle tests at
  `f06f96ca88b6278e5f23a898d758b99fa9322108`.

### Official upstream refs used by this research

- Effect process and observability source at
  `ee06c9c1eed73ebcf282541ceb1615ff1ba1730d`;
- Bun source/declarations at
  `1726b144a06de8f4eeacbc9ebcb3448cc1b51b87`, plus releases 1.3.9 and
  1.3.14;
- Deno source/declarations at
  `89f33cbef296a2b287f323d42de54c871fa69c77`, plus releases 2.9.3 and
  2.9.5;
- Esbuild API declarations at
  `f6058f8364fe7ab91ca57a83e02577ed74c9cae4`, plus releases 0.28.1 and
  0.28.2;
- Node SEA documentation at
  `ad7a5b8302ae54b6e6dc77e03eabc5a3218dfb85`;
- Rolldown build object at
  `f85ef4448d6966eab8f9d6ea60062afd8d8b31a2`;
- `rolldown-plugin-dts` 0.28.2;
- `@yao-pkg/pkg` 6.22.0.

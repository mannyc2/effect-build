# Primitive rent audit

**[PROPOSAL]** A public integration-author primitive pays rent only when it satisfies all four tests:

1. **[PROPOSAL]** it adds an invariant not already expressed by Effect or the provider's official API;
2. **[PROPOSAL]** it removes an invalid or dishonest state rather than only renaming upstream methods;
3. **[PROPOSAL]** at least two integrations can obey the invariant without erasing material provider semantics;
4. **[PROPOSAL]** the invariant can be falsified by tests or observations.

## Summary

| Class | Primitive | Unique invariant beyond Effect | Verdict | Required correction |
|---|---|---|---|---|
| INFERENCE | `Author/Tool` | exact executable capture, provider-owned version/capability policy, no fallback/substitution, compatibility observation | KEEP | return official `ChildProcess.Command`; do not own process handles or generic execution |
| INFERENCE | `Author/BorrowedOutput` | producer cleanup-root authority, overlap exclusion, containment, revocable liveness, coherent manifests, mutation and expiry checks | KEEP | make closure-owned observations authoritative; raw paths are non-authoritative data |
| INFERENCE | `Author/Executable` | native-format/runtime/system-target inspection plus single-file stage/validate/commit | KEEP, NARROW | separate generic durable-file publication from executable inspection; no multi-file or universal executable promise |
| INFERENCE | `HostPath.Observed` | point-in-time canonical host observation | KEEP, REDEFINE | use a record with explicit observation facts/time; do not brand a string as continuing existence |
| INFERENCE | `SourceLocator` | none when it is a generic string wrapper | REMOVE/DEFER | introduce only a tagged source-reference sum with variant-specific laws |
| INFERENCE | `Author/Command` | none if it mirrors `ChildProcess.Command`/handle/streams | REMOVE | selected tool constructs official commands; provider methods may compose upstream helpers privately |
| INFERENCE | `Author/CommandCompiler` | none demonstrated beyond provider-specific option decoding/argv/error policy | REMOVE/PER-PROVIDER PRIVATE | retain generic pure helpers only where their law is independent of providers |
| INFERENCE | generic compiler abstraction | no stable cross-provider request/result/lifecycle law established | DO NOT PUBLISH | publish provider-native APIs and narrowly proven profiles |
| INFERENCE | future signer/mutator | possible immutable input-to-new-output lineage and verification law | DEFER | prove authority, credential, mutation, verification, timestamp, and platform semantics first |

## `Author/Tool`

### Rent that is real

**[GITHUB-DIRECT]** The repository proposal assigns `Author/Tool` exact executable/PATH selection, canonical selected-path observation, version probing, tested/known-incompatible ranges, required capability probes, strict default behavior, explicit untested override, and no hidden installation/fallback/substitution.

**[INFERENCE]** Those are build-domain invariants. Effect's process API will run the executable it is given, but it does not choose which provider binary is acceptable for a build lane or prove that later commands use the originally selected binary.

**[PROPOSAL]** Tool selection should occur once per provider Layer lifetime and return:

- **[PROPOSAL]** canonical executable observation;
- **[PROPOSAL]** exact observed version;
- **[PROPOSAL]** compatibility state (`tested` or explicit `untested-override`);
- **[PROPOSAL]** capability-probe results;
- **[PROPOSAL]** a pure `command(argv, options)` that closes over the exact executable and returns `ChildProcess.Command`.

### Rent that is not real

**[UPSTREAM-DIRECT]** `ChildProcess.Command`, `ChildProcessSpawner.ChildProcessHandle`, stdout/stderr streams, signals, force-kill timeout, exit waiting, and platform Layers already exist at `effect@4.0.0-rc.110`.

**[INFERENCE]** `Author/Tool` should not define another command AST, another process handle, another kill API, or another stream abstraction.

### Falsifier

**[PROPOSAL]** Remove `Author/Tool` if provider Layers can otherwise prove one exact executable/version/capability selection with no fallback and expose that observation consistently without duplicated implementation. Mere availability of `ChildProcess.make` does not satisfy this falsifier.

## `Author/BorrowedOutput`

### Rent that is real

**[UPSTREAM-DIRECT]** Effect Scope can run cleanup and observe the callback exit.

**[INFERENCE]** Scope does not supply root claims, destination overlap checks, path containment, file/tree manifests, mutation detection, deterministic expiry, or closure-owned re-observation. This is the strongest primitive rent in the proposal.

**[PROPOSAL]** The public abstraction should own laws, not mutable mechanism. Keep token registries, claim maps, semaphores, and cleanup implementation private.

### Required public facts

**[PROPOSAL]** A borrowed file/tree should expose:
- **[PROPOSAL]** locator data needed by consumers;
- **[PROPOSAL]** initial immutable observation;
- **[PROPOSAL]** `observe`/`manifest` Effects that recheck lease liveness, containment, and mutation;
- **[PROPOSAL]** format/profile facts independent of the path;
- **[PROPOSAL]** typed `Expired`, `Changed`, `Escaped`, `Missing`, and observation errors.

### Non-invariants to avoid

**[INFERENCE]** Neither `Object.freeze`, a branded path string, a nested callback, nor a `Scope.Scope` requirement prevents a JavaScript value from escaping.

### Falsifier

**[PROPOSAL]** Remove the primitive if every profile can use a provider-owned scoped handle whose official methods already provide revocation, containment, mutation, and cleanup-root semantics. The inspected providers/repository evidence does not establish this.

## `Author/Executable`

### Rent that is real

**[GITHUB-DIRECT]** The repository proposal defines a one-file state machine: same-parent staging, producer write, regular/executable validation, ELF/Mach-O/PE inspection, runtime/system-target resolution, optional digest, and rename commit.

**[INFERENCE]** Native inspection and one-file publication are meaningful invariants beyond raw `FileSystem.rename`.

### Necessary narrowing

**[INFERENCE]** “Executable” is too broad if interpreted as runtime-neutral production. The checked-in research reports that Bun, Deno, and Node embedding preserve materially different runtime and permission semantics.

**[PROPOSAL]** Split concepts:
- **[PROPOSAL]** `Author/DurableFile` or private common publication machinery for generic one-file staging/commit;
- **[PROPOSAL]** `Author/Executable` for executable-specific inspection and observations;
- **[PROPOSAL]** provider/profile operations that decide what runtime authority is required.

**[PROPOSAL]** Do not add multi-file commit, signing, runtime acquisition, project traversal, or provider selection to this primitive.

### Falsifier

**[PROPOSAL]** Remove the public primitive if executable inspection cannot produce stable cross-provider facts beyond ordinary file observation, or if every provider's publication semantics require incompatible commit states. Retain provider-private implementations in that case.

## `HostPath.Observed`

### Current problem

**[GITHUB-DIRECT]** The repository explicitly describes `HostPath.Observed` as point-in-time and rejects a decoder that would pretend an arbitrary string still exists.

**[INFERENCE]** A branded `string` alone does not communicate which facts were observed, when they were observed, or whether symlinks were resolved. It risks implying more authority than it carries.

### Recommended rent

**[PROPOSAL]** Make it an immutable record:

- **[PROPOSAL]** original/resolved absolute locator as needed;
- **[PROPOSAL]** canonical `realPath` for an existing object;
- **[PROPOSAL]** object kind;
- **[PROPOSAL]** observation time;
- **[PROPOSAL]** optional device/inode/mode/size facts;
- **[PROPOSAL]** an explicit statement that continuing existence is not guaranteed.

**[INFERENCE]** The record is useful in tool/artifact observations and diagnostics. It should not become a replacement filesystem API.

### Falsifier

**[PROPOSAL]** Remove the named type if every use needs a different observation shape and a common record encourages false equivalence. Keep only domain-specific `ToolObservation.path` and `Artifact.File.location` records then.

## `SourceLocator`

### Why a universal wrapper fails

**[GITHUB-DIRECT]** The capability matrix lists host paths, URLs, package specifiers, directories, stdin, virtual files, HTML roots, and plugin-owned modules as materially different provider inputs.

**[UPSTREAM-DIRECT]** Effect already supplies host `FileSystem` and `Path` services.

**[INFERENCE]** A universal `SourceLocator = Brand<string, ...>` cannot validate or canonicalize these namespaces uniformly. It adds a name without reducing illegal states.

### Conditional alternative

**[PROPOSAL]** Introduce `SourceRef` only if callers need a common discriminated transport:

```ts
type SourceRef =
  | { readonly _tag: "ObservedHostPath"; readonly value: HostPath.Observed }
  | { readonly _tag: "FileUrl"; readonly value: URL }
  | { readonly _tag: "RemoteUrl"; readonly value: URL; readonly integrity?: Digest }
  | { readonly _tag: "PackageSpecifier"; readonly value: string }
  | { readonly _tag: "VirtualSource"; readonly id: string; readonly digest: Digest }
  | { readonly _tag: "Stdin"; readonly digest: Digest }
```

**[PROPOSAL]** Each variant must define who resolves it, whether credentials are involved, whether it is reproducible, and what durable provenance records.

### Falsifier

**[PROPOSAL]** Do not publish even the tagged sum until at least two APIs genuinely consume the same sum and can preserve each variant's semantics.

## Public command wrapper

### Upstream overlap

**[UPSTREAM-DIRECT]** Official Effect commands already model executable, argv, cwd, environment, shell, detached behavior, standard I/O, extra descriptors, pipelines, signals, force-kill, and scoped handles.

**[INFERENCE]** A wrapper that accepts the same options and forwards them does not add an invariant. A wrapper that omits them may only reduce capability.

### Legitimate provider convenience

**[PROPOSAL]** Provider `Command.build(request)` can remain a high-level operation that validates a provider request, renders argv, runs a selected official command, interprets provider exit/diagnostics, and observes outputs. That is a provider API, not a universal process primitive.

### Falsifier for rejection

**[PROPOSAL]** A new public command primitive would be justified only by a law impossible to state through `Author/Tool` plus official commands—for example, a portable, verified process sandbox or deterministic command-result transcript. No such law is established here.

## Command/compiler factory abstraction

**[GITHUB-DIRECT]** The repository's prototype combined provider option decoding, target tables, argv rendering, error interpretation, service construction, and matrix policy.

**[INFERENCE]** Those responsibilities vary by provider and lane. Factoring common private functions may reduce code, but a public factory would falsely imply users can implement a provider by filling interchangeable slots.

**[PROPOSAL]** Keep only generic vocabulary with independent laws:
- **[PROPOSAL]** tool compatibility evaluation;
- **[PROPOSAL]** output observations;
- **[PROPOSAL]** durable one-file publication;
- **[PROPOSAL]** matrix report vocabulary;
- **[PROPOSAL]** telemetry naming conventions.

**[PROPOSAL]** Keep provider request schemas, target mapping, argv rendering, diagnostics, watch semantics, and direct-write behavior in provider packages.

## Future signing or mutation

**[GITHUB-DIRECT]** The repository defers a universal signing profile because trust, credentials, mutation, verification, and timestamping are incompatible and untested.

**[INFERENCE]** A future primitive could pay rent by enforcing immutable input, new-output publication, verification, and durable lineage. It should not be added merely because several platforms use the word “sign.”

**[PROPOSAL]** Required proof before publication:
- **[PROPOSAL]** exact input artifact classes accepted;
- **[PROPOSAL]** whether bytes are copied or mutated;
- **[PROPOSAL]** credential/session ownership;
- **[PROPOSAL]** deterministic versus timestamped output;
- **[PROPOSAL]** verification authority and failure;
- **[PROPOSAL]** commit/rollback behavior under interruption;
- **[PROPOSAL]** provenance fields and redaction.

# Falsifiers and open questions

**[INFERENCE]** These recommendations are contingent architectural conclusions. Each can be overturned by stronger official contracts, complete counterexamples, or targeted execution. “No current consumer” is not a semantic falsifier; one successful fixture is not general proof.

## Decision falsifiers

| Class | Current conclusion | Evidence that would falsify or materially change it |
|---|---|---|
| PROPOSAL | Scope does not provide borrowed-output ownership | An official Effect facility that revokes escaped values/operations, enforces affine non-escape, owns canonical root containment, and reports mutation/expiry would eliminate much of `Author/BorrowedOutput`. |
| PROPOSAL | callback nesting adds no ownership invariant | A type/runtime mechanism demonstrably preventing a path or operation from escaping the inner callback under arbitrary TypeScript/JavaScript consumer code would change the result. Ergonomic discouragement is insufficient. |
| PROPOSAL | keep `Author/BorrowedOutput` | Evidence that every intended provider can return an official scoped handle with equivalent cleanup-root, containment, liveness, mutation, and expiry laws would make the common primitive redundant. |
| PROPOSAL | keep `Author/Tool` | A Layer/provider-selection facility that already captures one exact executable/version/capability set, forbids fallback, and exposes the same observation to every command without duplicated author code would remove its unique rent. |
| PROPOSAL | remove public `Author/Command` | A cross-provider invariant unavailable through `ChildProcess.Command` plus `Author/Tool`—such as a verified sandbox/transcript contract—could justify a new primitive. A renamed command object would not. |
| PROPOSAL | remove public `Author/CommandCompiler` | A complete scenario enumeration showing stable common request decoding, target semantics, argv rendering, lifecycle, output interpretation, and error laws across multiple providers could justify a factory. Shared implementation convenience alone would not. |
| PROPOSAL | narrow `Author/Executable` to one-file inspection/publication | Evidence of a truthful wider executable law across runtimes, permissions, assets, acquisition, target semantics, signing, and publication could broaden it. File-format equality alone is insufficient. |
| PROPOSAL | `HostPath.Observed` is a point-in-time record | A real revocable OS path/handle capability that remains usable through a stable identity and whose lifecycle can be represented portably could justify a stronger type. |
| PROPOSAL | omit universal `SourceLocator` | Two or more real APIs consuming the same tagged source-reference union while preserving variant-specific identity, resolution, credential, and provenance laws would justify it. |
| PROPOSAL | raw child handle/streams are the common command-watch contract | Stable machine-readable watch protocols in all intended command providers with equivalent readiness, rebuild, failure, ordering, and release semantics would justify a common typed event profile. |
| PROPOSAL | telemetry is not an application protocol | An application delivery profile that disables sampling, requires durable exactly-once ordered export, couples acknowledgment to build state, and is part of the typed operation contract could make telemetry protocol-like; ordinary OpenTelemetry does not. |
| PROPOSAL | no portable atomic multi-file publication | A proven cross-platform primitive with atomic reader visibility, rollback, crash behavior, replacement/lock behavior, and explicit limits could justify a durable tree artifact. |
| PROPOSAL | matrices commit independently | A real provider transaction spanning all cells with rollback and crash recovery would justify a transactional matrix specialization; ordinary parallel Effects do not. |
| PROPOSAL | signing/mutation must create a new output | A platform-specific in-place signer with provable atomicity, retained preimage, rollback, verification, and unambiguous lineage could justify an explicit specialization, not a universal default. |

## Open questions by lifecycle

### Borrowed files and trees

**[UNKNOWN]** What is the exact in-flight observation policy when the consumer starts a read and the continuation is interrupted: drain, interrupt, or serialize?

**[UNKNOWN]** Can the implementation perform all validation and byte reads through stable file handles on every supported runtime, and which handle metadata are available through Effect's platform services?

**[UNKNOWN]** How are hard links treated? A canonical path can remain contained while bytes are mutated through an external hard link.

**[UNKNOWN]** Are symlinks forbidden in borrowed output, represented as links, or followed? Directory junctions and platform-specific reparse points need explicit Windows cases.

**[UNKNOWN]** Can a provider continue background mutation after its host call reports completion? Each provider/lane needs a falsifier fixture.

**[UNKNOWN]** What manifest algorithm/canonical serialization is stable across path separators, Unicode normalization, case-insensitive filesystems, and non-UTF-8 names?

**[UNKNOWN]** What digest size/performance threshold requires streaming, parallel hashing, or an opt-out, and can mutation detection remain mandatory for every profile?

**[UNKNOWN]** How are very large byte counts serialized without precision loss?

### Exact failure and interruption

**[UNKNOWN]** Does the public API prioritize exact primary Cause identity or combined cleanup causes? Both cannot be claimed literally when cleanup also fails.

**[UNKNOWN]** What separate non-telemetry channel receives cleanup failures after caller failure/interruption: a reporter service, returned receipt, supervised queue, or application hook?

**[UNKNOWN]** If the cleanup reporter itself fails, is that failure ignored, logged locally, or retained in a bounded in-memory receipt?

**[UNKNOWN]** Which Effect combinator arrangement preserves the exact intended Cause topology after release across typed failure, defect, and interruption? This needs source-level and executable law tests against the pinned Effect versions.

### One-shot in-process host APIs

**[UNKNOWN]** For each host API, does interruption merely stop awaiting, invoke an official abort mechanism, or have no defined effect? This must be documented per pinned provider version.

**[UNKNOWN]** Can a host callback continue writing to caller-selected output after the fiber is interrupted?

**[UNKNOWN]** Which host APIs close every file handle before resolving, especially on Windows?

### Selected commands and watch

**[UNKNOWN]** Does every supported runtime use the Effect Node spawner implementation, or do Bun/Deno hosts install a different platform Layer with different finalization behavior?

**[UNKNOWN]** How does the adapter ensure stdout and stderr are each consumed once without accidental competing subscriptions?

**[UNKNOWN]** Should bounded capture kill on overflow, keep draining/discarding, or fail after process exit? Each choice has deadlock and diagnostic tradeoffs.

**[UNKNOWN]** Can an explicit command kill complete while grandchildren or worker processes still hold output locks on Windows/Linux?

**[UNKNOWN]** Which providers expose stable structured watch callbacks in their current official API, and what exact version ranges cover them?

**[UNKNOWN]** If a human-output parser is shipped experimentally, how do locale, TTY detection, color, progress rewrites, carriage returns, and version-specific wording affect its grammar?

**[UNKNOWN]** The current Effect Node `exitCode` hides signal identity behind `PlatformError`; does effect-build need a richer official upstream observation, or is signal detail unnecessary for its public contract?

### Durable files and executables

**[UNKNOWN]** Does `FileSystem.rename` replace an existing destination consistently across all supported platforms and platform Layers, especially when the destination is open?

**[UNKNOWN]** What destination-claim mechanism prevents two same-process publications from racing, and is cross-process exclusion required?

**[UNKNOWN]** What exact same-parent test prevents a path from crossing volumes through mount points, symlinks, junctions, or provider path transformations?

**[UNKNOWN]** Which durability tiers are supported:
- **[UNKNOWN]** process-visible rename commit;
- **[UNKNOWN]** file-content flush;
- **[UNKNOWN]** parent-directory metadata flush;
- **[UNKNOWN]** crash/reboot durability?

**[UNKNOWN]** How is a commit reported when rename succeeded but post-commit `stat`/digest/provenance write fails? The destination is already an outcome and must not be hidden.

**[UNKNOWN]** Can native executable inspection unambiguously determine embedded runtime and system target for every supported producer, or are provider claims sometimes required?

**[UNKNOWN]** On Windows, how long after process exit can antivirus, indexers, or descendants retain locks that block rename/remove? The evidence inspected does not establish a bound.

### Direct multi-output and matrices

**[UNKNOWN]** For each provider direct-write API, enumerate every interruption/failure phase and observe which files can remain.

**[UNKNOWN]** Can direct-output observation itself fail or race continued writes, and how is `observationComplete` determined?

**[UNKNOWN]** Does a directory rename provide the required reader-visibility semantics for any narrower supported platform subset, and what happens when replacing a non-empty destination?

**[UNKNOWN]** Could immutable content-addressed files plus one manifest-pointer rename provide a portable multi-file application publication model? Reader protocol, garbage collection, and crash tests are required.

**[UNKNOWN]** On matrix interruption, should not-yet-started cells remain `NotStarted`, and should already-running cells be interrupted concurrently or allowed to finish publication?

**[UNKNOWN]** How does a matrix report survive coordinator process crash after some cell commits but before the in-memory report is returned? A durable journal may be required for recovery claims.

### Source references and provenance

**[UNKNOWN]** Which real public APIs need one tagged `SourceRef` union rather than provider-native input types?

**[UNKNOWN]** How are remote URL redirects, authentication, cache validation, and integrity recorded?

**[UNKNOWN]** How are package specifiers tied to exact registry, lockfile, resolution conditions, exports, and package bytes?

**[UNKNOWN]** How do plugins declare virtual/implicit inputs and environment reads so provenance can be marked complete under a declared model?

**[UNKNOWN]** Which canonical serialization is selected for provenance, and what exact bytes are signed?

**[UNKNOWN]** Are timestamps trusted wall-clock observations, reproducibility-breaking metadata, signed timestamp-authority evidence, or all three as distinct fields?

**[UNKNOWN]** What privacy model permits source-path/input-digest persistence, and how is provenance redacted without invalidating signatures?

### Observability

**[UNKNOWN]** Which stable span/metric names are compatible with OpenTelemetry semantic-convention naming and the repository's public compatibility policy?

**[UNKNOWN]** Should core emit metrics through global/default registry only, or require an effect-build observability service to permit complete opt-out?

**[UNKNOWN]** What bounded error schema is safe for spans/logs while preserving enough provider diagnostics?

**[UNKNOWN]** What telemetry shutdown guarantees does the host application require, given Effect's OTel layers ignore time-bounded shutdown errors?

**[UNKNOWN]** Are provider graph/metafile payloads safe to export or persist, and what redaction/copyright/source-content rules apply?

## Minimum executable falsification program before implementation claims

**[PROPOSAL]** The following are tests needed for future implementation, not tests run in this session:

1. **[PROPOSAL]** Scope/continuation laws for typed failure object identity, defects, interruption Cause identity, cleanup success/failure, and reporter failure.
2. **[PROPOSAL]** Concurrent observe-versus-close races under the selected in-flight policy.
3. **[PROPOSAL]** lexical traversal, symlink/junction escape, replacement race, and external hard-link mutation.
4. **[PROPOSAL]** byte/digest coherence under concurrent file replacement and truncation.
5. **[PROPOSAL]** Windows/Linux/macOS cleanup with direct child, shell child, grandchild, worker, open output file, and forced termination.
6. **[PROPOSAL]** stdout/stderr flood tests proving no deadlock and correct independent truncation.
7. **[PROPOSAL]** one-file commit interruption at every stage, existing locked destination, cross-volume attempt, and post-rename observation failure.
8. **[PROPOSAL]** provider direct multi-output interruption at every mutation phase with exhaustive remnant recording.
9. **[PROPOSAL]** matrix sibling failure/interruption after zero, one, and many commits.
10. **[PROPOSAL]** OTel disabled, sampled-out, exporter failure, partial export, and shutdown timeout proving build semantics remain unchanged.
11. **[PROPOSAL]** canonical provenance serialization/digest/signature verification and privacy redaction.
12. **[PROPOSAL]** exact supported Effect version matrix because `effect/unstable/process` may change before stable v4.

## STOP conditions

**[PROPOSAL]** Stop publication of a common primitive/profile when a counterexample requires hiding a provider fact, weakening an invariant without changing the name, or claiming cleanup/publication semantics that cannot be observed.

**[PROPOSAL]** Do not stop merely because no current consumer exists. Continue when the abstraction has a coherent law, complete scenarios, counterexamples, and falsifiers.

**[PROPOSAL]** Do not claim conformance from one happy-path fixture. Require adversarial scenarios and platform boundaries appropriate to the strength of the public promise.

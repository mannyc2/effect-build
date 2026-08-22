# Ownership laws

**[INFERENCE]** The central distinction is between *lifetime management* and *artifact authority*. Effect Scope supplies the former. A borrowed-output abstraction must add the latter.

## Terms

| Class | Term | Definition |
|---|---|---|
| PROPOSAL | producer | The provider/adapter that creates and eventually cleans a temporary root. |
| PROPOSAL | consumer | Arbitrary caller code run inside the borrowed-output continuation. |
| PROPOSAL | lease | Producer-owned revocable state authorizing observation/use while open. |
| PROPOSAL | cleanup root | The canonical directory the producer exclusively claims for recursive cleanup. |
| PROPOSAL | observation | Immutable point-in-time facts about a file/tree, including kind, bytes, digest, and optional host identity. |
| PROPOSAL | locator | Data sufficient to refer to an object, such as a host path; a locator is not itself proof of liveness. |
| PROPOSAL | commit | The operation-specific point after which a durable destination is an outcome that cleanup must not roll back. |
| PROPOSAL | exact caller identity | Preservation of the callback's complete `Exit`/`Cause`, including the original typed failure object or interruption cause, without replacement or synthetic reconstruction. |

## Law S1 — Scope closes finalizers with the workflow Exit

**[UPSTREAM-DIRECT]** `Scope.addFinalizerExit` receives the close `Exit`; `Scope.use` closes a supplied scope with the effect's same exit; child scopes inherit the parent's close exit.

**[INFERENCE]** This is sufficient for cleanup to know whether caller use succeeded, failed, or was interrupted. A borrowed-output wrapper does not need a second generic finalizer runtime.

## Law S2 — Scope is not linear ownership

**[GITHUB-DIRECT]** The repository's law source includes an ordinary scoped acquisition whose returned raw path can be retained after release; release removes the file but cannot revoke the retained string.

**[INFERENCE]** A value of type `Effect<A, E, Scope.Scope>` may return an `A` containing arbitrary JavaScript values. Scope does not prevent `A` from escaping or give those values affine use.

**[PROPOSAL]** Never document “cannot escape Scope.” Document “operations requiring the scoped resource cease to be valid after Scope closes,” and make those operations check released state when practical.

## Law B1 — One continuation owns cleanup

**[PROPOSAL]** The producer creates and claims a root, invokes one caller continuation, changes lease state to closing when the continuation exits, attempts cleanup, records cleanup outcome, and then marks the lease closed.

**[PROPOSAL]** Exactly one producer continuation should own the cleanup decision. Additional nested callbacks may organize API ergonomics but must not be represented as additional ownership enforcement.

## Law B2 — Callback nesting does not revoke raw values

**[GITHUB-DIRECT]** The checked-in nested-callback fixture retains a raw path outside the inner callback; the path becomes unusable only because the outer producer removes its root.

**[INFERENCE]** JavaScript closures and TypeScript types do not provide general linear non-escape. An inner callback around `{ path: string }` cannot stop assignment to outer state, serialization, logging, or use by foreign code.

**[PROPOSAL]** Stronger runtime authority requires one of:
- **[PROPOSAL]** not exposing the locator at all and exposing only producer-controlled operations;
- **[PROPOSAL]** exposing the locator as non-authoritative data while every authoritative operation goes through a revocable closure;
- **[PROPOSAL]** delegating to an OS capability/handle whose lifetime is actually revocable and whose semantics are understood.

## Law B3 — Lease state is checked before every authoritative operation

**[PROPOSAL]** Lease states should be at least `open`, `closing`, and `closed`.

**[PROPOSAL]** An operation starts only after observing `open`. Once closure changes state to `closing`, new operations fail deterministically with `BorrowedOutputExpired`.

**[PROPOSAL]** The contract must choose one in-flight policy:
- **[PROPOSAL]** *drain*: closure waits for already-started observations, then cleans;
- **[PROPOSAL]** *interrupt*: closure interrupts producer-owned observation fibers and waits for termination;
- **[PROPOSAL]** *forbid concurrency*: a semaphore permits only one operation and closure acquires it before cleanup.

**[INFERENCE]** Without an in-flight policy, “checked before read” still admits cleanup racing the read.

## Law B4 — The cleanup root is exclusively claimed

**[PROPOSAL]** Each live borrowed lease owns one canonical cleanup root. Two live leases must not recursively clean the same root, and a durable destination must not be contained by any active cleanup root.

**[PROPOSAL]** Root claims should be private process-local authority keyed by canonical host identity, not public mutable tokens.

**[UNKNOWN]** Process-local claims cannot protect against another process selecting the same root. Strong cross-process exclusion would require OS locking or uniquely generated roots plus destination policy.

## Law B5 — Containment is lexical and canonical

**[PROPOSAL]** For a relative child:
1. **[PROPOSAL]** reject an empty or absolute path when the API expects a descendant;
2. **[PROPOSAL]** normalize and reject any path whose relative form escapes through `..`;
3. **[PROPOSAL]** resolve against the canonical root;
4. **[PROPOSAL]** for an existing object, call `FileSystem.realPath`;
5. **[PROPOSAL]** compare path components, not string prefixes, using platform path rules;
6. **[PROPOSAL]** reject a canonical object outside the canonical root.

**[INFERENCE]** Lexical checks prevent obvious traversal; canonical checks address symlinks and junctions at observation time. Neither alone eliminates a replacement race between checking and opening.

**[PROPOSAL]** When a platform exposes a stable file handle, observe/read through the opened handle and compare handle metadata. This narrows time-of-check/time-of-use races but does not justify a universal race-free claim without platform proof.

## Law B6 — Observations are coherent

**[PROPOSAL]** `bytes` and `digest` must come from the same byte traversal. Computing size from a pre-read `stat` and digest from a later read can describe different generations.

**[PROPOSAL]** Use an algorithm-qualified digest such as `{ algorithm: "sha256", value: <hex> }`. An unqualified string is ambiguous for durable provenance and migration.

**[PROPOSAL]** Represent byte count internally as `bigint` or Effect's filesystem size brand. When serialized to JSON, use a decimal string unless the value is proven within the exact integer range.

**[PROPOSAL]** A tree manifest should:
- **[PROPOSAL]** use normalized root-relative names;
- **[PROPOSAL]** sort names by a specified byte/code-point order;
- **[PROPOSAL]** include object kind;
- **[PROPOSAL]** include per-file bytes/digest;
- **[PROPOSAL]** reject duplicate normalized names and escapes;
- **[PROPOSAL]** define whether symlinks are forbidden, represented as links, or followed.

**[UNKNOWN]** A recursive walk is not an atomic snapshot on ordinary filesystems. The provider must stop mutating before observation, or the manifest must admit possible mixed-generation observation.

## Law B7 — Mutation checks compare semantic facts

**[PROPOSAL]** If unchanged content is promised, re-observation must compare object kind, bytes, and digest. Timestamp, device, inode, and mode may detect obvious replacement cheaply but must not replace a content digest.

**[PROPOSAL]** A changed error should contain bounded before/after observations and the first known mismatch, without leaking full source contents.

**[INFERENCE]** A digest proves equal bytes under the chosen algorithm to its cryptographic assurance; it does not prove semantic equivalence, source identity, or absence of malicious hash-collision assumptions beyond the algorithm.

## Law B8 — Expiry is deterministic

**[PROPOSAL]** After lease closure begins, closure-owned operations fail with one stable typed expiry error regardless of whether the underlying path still happens to exist.

**[INFERENCE]** Checking only `FileSystem.exists` creates nondeterministic expiry: a failed cleanup could make an expired lease appear live, and a reused path could refer to an unrelated object.

**[PROPOSAL]** The typed error should distinguish `Expired` from `Changed`, `Escaped`, `Missing`, and `ObservationFailed`.

## Law B9 — Raw paths are deliberately non-authoritative

**[PROPOSAL]** A borrowed observation may include a path because command-line tools need a host locator. The contract should state:
- **[PROPOSAL]** the path may be copied or escape;
- **[PROPOSAL]** the producer does not revoke the string;
- **[PROPOSAL]** using it after lease expiry is unsupported;
- **[PROPOSAL]** only closure-owned re-observation can assert live/unchanged status.

**[INFERENCE]** This is honest capability design: the API controls claims it can enforce rather than claiming impossible non-escape.

## Law F1 — Preserve exact caller failure and interruption

**[UPSTREAM-DIRECT]** Effect models interruption inside `Cause` and can preserve a complete cause with `Effect.failCause`.

**[PROPOSAL]** The callback should execute without error mapping. On exit, retain the exact callback `Exit` object/cause as the primary semantic outcome.

**[PROPOSAL]** Do not:
- **[PROPOSAL]** catch an arbitrary callback error and construct a new wrapper error;
- **[PROPOSAL]** turn interruption into `BorrowedOutputInterrupted`;
- **[PROPOSAL]** stringify or serialize the callback cause and later reconstruct it;
- **[PROPOSAL]** race cleanup in a way that replaces the caller cause nondeterministically.

## Law F2 — Cleanup precedence depends on caller outcome

| Class | Callback outcome | Cleanup outcome | Proposed public outcome |
|---|---|---|---|
| PROPOSAL | success | success | callback success |
| PROPOSAL | success | failure | typed cleanup failure |
| PROPOSAL | failure | success | exact callback failure/cause |
| PROPOSAL | interruption | success | exact interruption cause |
| PROPOSAL | failure | failure | exact callback cause; cleanup failure emitted as separate bounded cleanup observation |
| PROPOSAL | interruption | failure | exact interruption cause; cleanup failure emitted separately |

**[INFERENCE]** This asymmetric policy is necessary if “exact caller failure/interruption identity” is a hard invariant. Combining cleanup failure into the cause would preserve information but not exact identity/topology.

**[PROPOSAL]** The separate cleanup observation may be delivered to a user-supplied cleanup reporter service, logs, and metrics. It must not depend solely on telemetry export for correctness.

**[UNKNOWN]** Some consumers may prefer a combined cause over exact identity. If effect-build chooses that policy, it must explicitly weaken the exact-identity claim rather than claiming both.

## Law F3 — Finalizers must not be accidentally interruptible

**[UPSTREAM-DIRECT]** Effect's resource combinators protect acquisition/release by masking interruption and restore interruption for the use phase.

**[PROPOSAL]** Borrowed cleanup should use the same structured mechanism. Any deliberately interruptible sub-step needs a bounded timeout and an explicit incomplete-cleanup observation.

## Law P1 — Process cancellation has multiple observable milestones

**[UPSTREAM-DIRECT]** Node distinguishes signal delivery, child exit, signal termination, and still-open stdio; descendants can survive parent kill. Effect's Node layer attempts group termination and waits for its direct child's exit, while ignoring finalizer errors.

**[PROPOSAL]** Do not collapse these into one boolean. Model or document:
- **[PROPOSAL]** cancellation requested;
- **[PROPOSAL]** signal/group-termination attempt completed or failed;
- **[PROPOSAL]** direct child exit observed;
- **[PROPOSAL]** output streams drained/closed;
- **[PROPOSAL]** cleanup verification complete/incomplete;
- **[UNKNOWN]** descendant termination and lock release unless separately observed.

## Law D1 — Durable ownership transfers only at commit

**[PROPOSAL]** Before commit, the candidate belongs to the operation and may be cleaned. After commit, the destination belongs to the caller and must be reported even if later observation/telemetry fails.

**[PROPOSAL]** The single-file commit boundary should be a same-parent rename after all producer handles are closed and candidate validation has succeeded.

**[INFERENCE]** Same-parent staging avoids an intentional cross-volume copy/delete fallback, but platform replacement and crash-durability details remain separate questions.

## Law D2 — Multi-output publication is not inferred from repeated rename

**[INFERENCE]** A sequence of individually atomic renames is not an atomic set. Failure after the first rename leaves a partial durable state.

**[PROPOSAL]** A direct multi-output API must either:
- **[PROPOSAL]** expose independently committed outputs and partial failure;
- **[PROPOSAL]** use a provider-specific directory/pointer transaction with proven semantics;
- **[PROPOSAL]** publish immutable content-addressed objects and atomically switch one manifest pointer, while still documenting garbage and reader behavior.

**[UNKNOWN]** No inspected common Effect API or effect-build law establishes a portable directory-tree transaction across Linux, macOS, and Windows.

## Law M1 — Matrix cells commit independently

**[PROPOSAL]** Each cell's durable commit is irreversible by sibling failure unless an explicit compensating deletion policy is selected.

**[PROPOSAL]** A matrix report retains every cell `Exit`, committed artifact, not-started reason, and cleanup warning. The coordinator's own preflight may fail before starting cells.

**[INFERENCE]** This model preserves restartability and prevents a generic “matrix failed” error from hiding outputs that now exist.

## Law X1 — Future mutation creates lineage, not in-place ambiguity

**[PROPOSAL]** Signing or post-production mutation consumes an immutable observed artifact and produces a new candidate, new digest, new observation, and provenance edge.

**[PROPOSAL]** The original artifact remains valid evidence even if the new mutation fails.

**[INFERENCE]** In-place mutation destroys the ability to distinguish producer bytes from signer/mutator bytes and complicates retry, rollback, and provenance.

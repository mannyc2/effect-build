# Lifecycle and ownership

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Map each operation family to the smallest honest Effect API shape and identify the few new invariants that justify author modules.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Principle

Use official Effect platform services wherever they already own semantics. A new public wrapper is justified only when it prevents states that `Path`, `FileSystem`, `Command`/`CommandExecutor`, `Scope`, `Stream`, logging, spans, and tracing do not prevent by themselves.

> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · Effect platform/effect documentation listed in evidence/UPSTREAM-SOURCES.md


## Operation-family shapes

| Operation family | Ideal public shape | Ownership/interruption contract | What must not be promised |
|---|---|---|---|
| One-shot host API without provider cancel | `Effect<Result, ProviderError, Requirements>` | Fiber interruption may stop waiting; provider work or direct writes may continue unless the official API proves cancellation | No invented rollback, cancel handle, or child-process semantics |
| One-shot selected command | `Effect<Result, ProviderError, Requirements>` implemented with an internal scoped process | Interruption closes Scope, signals/terminates and reaps the selected child; stdout/stderr are drained according to operation law | No shell fallback, hidden executable substitution, or API fallback |
| Scoped provider context | `Effect<Handle, ProviderError, Scope | Requirements>` | Scope owns context/process/server release; handle exposes only provider-stable operations | No use after scope; no generic context interface that erases provider methods |
| Borrowed single file/tree | `withOutput(request, use)` continuation | One continuation owns root; closure-owned Effects re-observe liveness, containment, bytes/digest; cleanup after every Exit | Scope alone does not make escaped path strings linear or prevent stale metadata |
| Durable single-file publication | `Effect<Artifact.File | Artifact.Executable, Error>` | Same-parent staging and validation; atomic rename is commit; post-commit result survives caller lifetime | No directory transaction or rollback after commit |
| Provider-native multi-output direct write | `Effect<ProviderResult, ProviderError>` | Provider may durably write individual files before overall success | No all-or-nothing claim; failure may leave partial provider-owned output |
| Matrix | One Effect over preflight plus bounded independently committing cells | Every cell has its own publication; failure reports committed results | Matrix is not a transaction |
| Signing/future mutation | Copy → mutate → inspect/verify → publish new artifact | Original artifact observation remains immutable; new artifact has new identity/steps | Never mutate an observed artifact in place |

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L670-L763


## Official Effect ownership

### `Path`

Use for platform-specific path construction, normalization, relative resolution, basename/dirname/extname, and separator semantics. A library-level `HostPath.Observed` can record a point-in-time canonical observation, but it must not pretend a deserialized string still exists.

### `FileSystem`

Use for reads/writes, stat, symlink/canonical-path inspection, streams, temp files/directories, rename, remove, and watch where the host implementation supports it. Scoped temp helpers own ordinary finalization; `BorrowedOutput` adds domain-specific containment, destination-overlap, digest, and escaped-authority laws.

### `Command` and `CommandExecutor`

Use official command construction and the platform command executor/spawner for cwd/environment/shell policy, scoped child handles, stdin/stdout/stderr streams, exit status, signals, termination, and reaping. Provider `Command` modules are application/provider surfaces; they are not replacements for Effect's process model.

### `Scope`

Use for contexts, child processes, temporary resources, servers, and watch sessions. Scope is necessary but not sufficient for borrowed-output safety: a raw path or copied metadata can escape even though the resource is finalized correctly.

### `Stream`

Use for raw stdout/stderr and large file/content flows with backpressure. Do not convert watch streams into an unbounded string accumulation or a fabricated event protocol.

### Logging, spans, tracing

Use Effect-native spans, annotations, warnings, and logs. Applications select OpenTelemetry or another exporter Layer.

## New invariant: `Author/Tool`

Justified responsibilities:

- select an explicit executable or perform PATH discovery once at Layer construction;
- canonicalize/observe that selection;
- probe exact version and operation capabilities;
- apply provider/lane/operation compatibility policy before mutation;
- enforce no automatic installation, fallback, or post-selection PATH substitution;
- produce stable tool/compatibility observations and an Effect `Command` using the captured executable.

It must **not** own a second child-process handle, stream API, signal API, or force-kill policy.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L351-L378


## New invariant: `Author/BorrowedOutput`

Justified responsibilities beyond ordinary scoped temp resources:

- register cleanup roots and prevent durable destinations from being inside an active cleanup root;
- enforce normalized-root containment and reject traversal/symlink escapes;
- give consumers closure-owned file/tree Effects rather than a public mutable liveness token;
- observe byte count/digest/manifest at production and revalidate on acquisition;
- fail deterministically after continuation exit;
- preserve exact callback success, typed failure, defect, interruption, and mixed Cause;
- permit compatible duplicate core copies to use the closure authority without private nominal-token mismatch.

The nested continuation prototype was falsified as an ownership improvement: a raw path could still escape the inner callback. One producer continuation plus closure-owned acquisition has fewer states and equivalent enforcement.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · architecture law receipts and pushed C2 decision; nested-continuation falsifier


## New invariant: `Author/Executable`

Justified responsibilities:

- exclusive/compatible destination claim;
- same-parent staging;
- regular/executable-file validation;
- bounded ELF/Mach-O/PE inspection through platform `FileSystem` reads;
- runtime/system-target observations;
- optional digest;
- atomic single-file publication;
- cleanup before commit and no rollback after commit.

It is not a universal artifact store, signing service, cache, provenance system, or directory transaction.

## Failure/Cause preservation

Every continuation and instrumentation layer must preserve:

- exact caller success value;
- exact typed failure identity;
- defects;
- interruption;
- parallel/sequential Cause topology;
- cleanup defects according to a documented finalizer policy.

Provider normalization may add a profile failure wrapper, but the native error/diagnostic must remain inspectable.

## Borrowed versus durable decision test

Use **borrowed** when any of these is true:

- output is a temporary tree;
- provider owns multiple files without a common commit protocol;
- a context/watch lifetime owns the output;
- the value must be re-observed to detect mutation;
- cleanup is part of producer semantics.

Use **durable** only when:

- one file has a clear validation boundary;
- staging can occur in the destination parent;
- an atomic rename/replace defines commit on the supported platform;
- runtime/target/file identity can be inspected before commit;
- the result remains valid after all producer scopes close.

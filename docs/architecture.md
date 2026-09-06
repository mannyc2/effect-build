# Architecture

effect-build separates provider operations from the lifecycle of their results. Providers keep native options and
diagnostics; core supplies a common identity for output that has actually been finalized. This lets an application combine
build steps without pretending that every tool has the same build API or output guarantees.

For application setup, start with [getting started](getting-started.md). For implementation rules and verification, see
[contributing](../CONTRIBUTING.md).

## Package responsibilities

The workspace contains core, five provider packages, and six producer packages. Rolldown remains private. Every non-core
package depends on core and never on a sibling.

| Owner                              | Responsibility                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Core `Artifact` and `SystemTarget` | Digest, file/tree/executable identity, provenance, inspected target, and adoption records        |
| Core `Author/Tool`                 | Resolve one executable, observe content, preserve selection, and reauthenticate it               |
| Core author finalizers             | Destination claims, staging, observation, verification, and filesystem commit                    |
| Provider package                   | Native API/CLI options, probes, admission, invocation, diagnostics, cancellation, and inspection |
| Producer package                   | Archive, package, signing, notarization, or SBOM operation and its specific validation           |
| Application                        | Effect platform layer, operation composition, destinations, and downstream use                   |

Providers expose operation modules in permanent `Api` and `Command` lanes. They may refine a core artifact with additional
facts, but do not introduce another digest, manifest, or target model. Native memory values and provider-direct writes
retain their own result types.

The [combined contract](../tooling/effect-build-contract.json) records which operations are public, private, conditional,
or rejected. The [generated public API](../tooling/public-api.json) is its tested projection together with package
declarations. Research notes and implementation files alone do not establish a public export.

## Four separate facts

A Node process on macOS can orchestrate a selected Bun compiler to produce a Linux executable. That involves four facts:

1. The **orchestrator runtime and construction host** run the Effect program and its platform services.
2. The **selected tool** is the exact compiler executable or native API used for production.
3. The **artifact target** comes from inspecting the produced native file.
4. The **target runner** establishes whether those bytes actually run in the intended environment.

Selecting a compiler does not select a target runner. Successful inspection does not prove runtime execution or the
provider's cross-target download/cache behavior. Provider `runtimeAcquisition` fields retain unresolved evidence where
applicable; [provider drivers](drivers.md) explains the current limits.

## Tool selection and launch

Selection uses an explicit normalized absolute path, or one deterministic scan of absolute `PATH` entries. It resolves
symlinks and rejects multiple distinct canonical candidates. Core observes the selected executable before and after the
provider's probe, binding the reported version/capabilities to observed content.

The provider evaluates its operation-specific admission policy and reauthenticates the same selected executable
immediately before launch. If its bytes changed, launch fails. Providers do not install a replacement, retry another
candidate, invoke a shell, or expose a raw-argv operation. Version policy belongs to the provider rather than a generic
range-checking service.

This is observation and pre-launch verification of a filesystem executable. It is not operating-system isolation against
an unrelated writer changing a path after the final check. Build environments still need to coordinate tool updates with
active builds.

## Output lifetimes

Memory operations return native values. Provider-direct operations write to provider-controlled paths and can leave
partial or mixed output after failure. Neither result is relabeled as a finalized core artifact.

Contexts, watchers, and child processes are scoped. The provider owns cancellation and disposal order: esbuild contexts
cancel before disposal; Bun's in-process build has no native cancellation handle. Interruption preserves these native
limits rather than claiming every underlying operation can be undone.

Borrowed output is observed inside a continuation. Its `observe` effect validates the still-open lifetime and identity.
Copying its path does not extend the lifetime. The output is cleaned up when the continuation finishes, with explicit
cleanup diagnostics if removal fails.

## Durable finalization

Explicit finalizers return a core artifact only after completing this protocol:

1. Resolve an absent destination, claim it, and create private staging under the same parent.
2. Let the producer create the candidate in staging.
3. Capture exact bytes or a symlink-aware tree manifest, including file bytes held for reconstruction.
4. Run the inspector and re-observe the candidate to detect changes.
5. Reconstruct and verify a commit candidate from held bytes or entries.
6. Perform one uninterruptible filesystem commit and return the artifact identity.

File/executable commit uses a same-parent **no-replace hard link**. Tree commit uses a same-parent **rename**. Neither
finalizer overlays an existing destination. If an application wants successive generations, it chooses distinct paths or
explicitly manages removal before building.

Tree finalizers reject an existing destination before staging and immediately before rename. In-process claims also
reject concurrent finalization to the same destination and destinations inside active borrowed-output cleanup roots.
Effect's portable `FileSystem` has no atomic no-replace directory rename, so an
unrelated external writer must coordinate rather than race that last syscall. Tree atomicity does not provide isolation
from uncoordinated external writers.

Candidate bytes are held in memory for verification and reconstruction. Even `observation: "unhashed"` uses internal
hashing; it only changes the returned identity. The current protocol is not a bounded-memory streaming finalizer for
arbitrarily large artifacts.

If interruption wins after commit but before the artifact value is delivered, cleanup removes the destination only when
its device/inode still proves ownership of that commit. Earlier durable artifacts and unrelated writers' outputs are not
part of a rollback transaction.

## Verify before downstream use

See [artifact composition](artifact-composition.md) for verified consumer inputs, author-owned scopes, shared native
observations, and Node SEA byte assets.

A durable identity records what was committed; it cannot prevent later filesystem mutation. `File.withVerifiedBytes`
checks the current file against that identity and provides a defensive byte copy. `Tree.withVerifiedSnapshot` revalidates
the current tree and reconstructs a private snapshot for the continuation. Downstream work consumes those verified bytes
or the snapshot instead of reopening an unchecked mutable path.

`Artifact.adoptFile` and `Artifact.adoptTree` project a logical name and immutable digest identity without a local path.
These are pure projections, not filesystem checks or uploads. A downstream release system owns plans, journals,
continuation, upload/publication, and registry mutation. See [release security](release-security.md) for this boundary.

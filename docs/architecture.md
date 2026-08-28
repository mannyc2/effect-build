# Architecture

## One canon

Core owns one artifact model and one selected-tool model. Producer packages may refine these identities with operation-specific fields, but may not define peer digests, tree manifests, tool facts, or publication protocols.

Construction host, selected executable, artifact target, and the runner of a produced target are different facts. No host inference is promoted into target identity; executable inspectors establish the artifact target.

## Tool selection and launch

Selection accepts either one normalized absolute executable or one deterministic PATH walk. Multiple canonical candidates are an ambiguity failure. Core observes the selected executable bytes before and after the provider probe. Providers own version, revision, capability, admission, invocation, output bounds, and typed diagnostics. Every launch sequences `selected.reauthenticate` immediately before yielding the provider command.

There is no install, registry, candidate retry, fallback, shell command, raw public argv, or generic version-range policy.

## Lifecycles

In-process contexts, watchers, child processes, and borrowed outputs remain scoped. Their native cancellation and disposal order belongs to the provider. Interruption cannot turn a scoped native result into a durable handoff.

## Durable finalization

An explicit finalizer performs:

1. claim one destination and create private same-parent staging;
2. let the provider produce a candidate;
3. capture exact file bytes or a symlink-aware tree manifest;
4. inspect, then re-observe the candidate;
5. reconstruct a verified candidate from held bytes or entries;
6. commit files/executables with one uninterruptible same-parent no-replace link, and trees with one same-parent rename after a fail-closed destination check.

Files and executables use a portable atomic no-replace link. Tree finalizers use a process-local destination claim and reject an observed destination both before staging and immediately before the atomic rename. Effect's portable `FileSystem` has no atomic no-replace directory rename, so unrelated external writers must coordinate rather than race that final syscall. Verified continuations re-observe durable identity and lend bytes or a private snapshot only for the continuation's lifetime.
If interruption wins after the filesystem commit but before the artifact value is delivered, the finalizer removes only the destination whose device/inode still proves that it owns the commit.

## Release boundary

`Artifact.adoptFile` and `Artifact.adoptTree` project a logical name plus immutable digest identity without a local path. effect-build stops there. A downstream release system owns planning, journals, continuation, upload/publication, and registry mutation.

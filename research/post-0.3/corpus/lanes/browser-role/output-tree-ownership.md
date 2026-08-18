# Output-tree ownership and publication

## 1. Ownership categories

- **Borrowed tree**: exists only during one callback/scope; caller cannot retain a usable path after release.
- **Durable tree**: caller owns a directory after success; requires publication and recovery semantics.
- **Provider direct output**: provider writes to a caller-visible destination; partial durable state may survive failure/interruption.
- **Observation**: point-in-time manifest/path/digest metadata, not a guarantee of continuing existence or identity.

**[INFERENCE OWN-001]** The portable browser role can honestly promise a borrowed tree. It cannot infer durable multi-file atomicity from successful provider output.

## 2. Borrowed-tree contract

**[PROPOSAL OWN-002]** A successful `withPayload(request, use)` operation should promise:

1. an adapter-created staging root that does not overlap source entries or a caller durable destination;
2. provider completion before `use` begins;
3. all exposed paths are normalized, unique, relative, and contained;
4. no exposed symlink/reparse-point target escapes the root;
5. a manifest snapshot with bytes and digests taken after provider completion;
6. closure-owned file/tree effects that recheck liveness and optionally mutation;
7. exclusive cleanup authority retained by the outer continuation;
8. recursive removal attempted after callback success, failure, or interruption;
9. cleanup failure reported without pretending the tree became durable.

The caller may copy/publish during the callback using a separate operation. A raw borrowed path that escapes the callback is not a durable artifact.

## 3. Failure and partial writes

**[PROPOSAL OWN-003]** Provider execution into staging has this honest law:

- before completion, the provider may create, truncate, replace, or omit arbitrary files inside staging;
- on provider error/interruption, the adapter reports build failure and best-effort cleanup;
- no output manifest or closure is returned on failure unless explicitly marked partial diagnostic observation;
- the adapter does not claim rollback of provider operations;
- because staging is private, partial writes do not become publication—unless cleanup itself fails, in which case the leaked path is diagnostic, not durable success.

This is materially stronger than letting providers write directly into a live deployment directory, without inventing a transaction.

## 4. Containment and path identity

Containment must be checked against canonical filesystem observations, not string prefixes. Required checks include:

- reject absolute output member names;
- normalize separators without collapsing distinct provider names incorrectly;
- reject empty, dot, dot-dot, NUL, reserved-device, and escape paths as appropriate to host;
- detect case-fold/canonicalization collisions on the destination platform;
- inspect symlinks/reparse points before lending or copying;
- reject source/output overlap and destination nested beneath source;
- ensure manifest traversal is deterministic and does not follow escaping links;
- retain provider path spelling in provider-native metadata even if portable projection rejects it.

**[INFERENCE OWN-004]** A manifest of relative names is not itself an ownership proof. Root authority, canonical containment, lifetime, and mutation behavior are separate laws.

## 5. Single-file rename versus directory publication

**[UPSTREAM-DIRECT OWN-005]** POSIX `rename()` provides strong atomic naming behavior on the same filesystem, but replacement rules differ for files and directories; replacing a non-empty existing directory fails. Cross-filesystem moves fail rather than becoming an atomic tree transaction.

**[UPSTREAM-DIRECT OWN-006]** Windows `MoveFileEx` and `ReplaceFile` have different file/directory and same-volume/cross-volume behaviors. `REPLACE_EXISTING` does not yield a universal non-empty-directory replacement primitive; `ReplaceFile` is file-oriented.

**[INFERENCE OWN-007]** There is no honest cross-platform law of “atomically replace this live non-empty directory with the provider’s multi-file output.” Even where a rename of a new directory is atomic, replacement, open handles, antivirus/indexers, permissions, mount boundaries, and recovery policy differ.

## 6. Durable publication must be separate

A portable build and a deployment publication operation solve different problems.

**[PROPOSAL OWN-008]** Recommended publication pattern:

1. While the payload is borrowed, copy bytes into a new immutable version directory under the destination filesystem.
2. Verify copied digests and metadata.
3. Write a complete publication manifest.
4. Commit through one deployment-specific pointer: a symlink/junction, small manifest file, database row, object-store key/version, release alias, or platform-native switch.
5. Retain old versions for rollback/garbage collection.
6. Treat pointer replacement atomicity and reader behavior as a separate platform profile.

This avoids in-place mutation of a live tree and limits the commit point to one small object, but still does not create one universal filesystem implementation.

## 7. Direct provider output

Provider-native APIs may accept `outdir` and write directly. Their honest result law is:

| Outcome | What may exist |
|---|---|
| Success | New outputs, overwritten matching files, and possibly stale unrelated files depending on provider policy. |
| Provider failure | Partial new/truncated outputs may exist. |
| Fiber interruption | Host work may continue for in-process APIs lacking cancellation; child process may be terminated but prior writes remain. |
| Cleanup requested | Only adapter-owned staging is safely removable; caller destinations require explicit authority. |

**[INFERENCE OWN-009]** Direct-write provider APIs should remain provider-native. A portable role should isolate them behind staging rather than normalize partial durable outcomes into “artifact success.”

## 8. Stale files and borrowed closure

A provider may not clear an output directory. Reusing staging between builds can therefore make obsolete chunks appear in a manifest and can hide missing writes.

**[PROPOSAL OWN-010]** Portable one-shot builds should use a newly created empty staging root. Incremental/watch roles, if added later, need a different scoped-generation contract with generation IDs, change sets, and provider-specific lifecycle semantics.

## 9. Mutation and digest observations

A manifest digest is point-in-time. During the callback:

- the provider process should no longer be writing in a one-shot role;
- consumer code might mutate files unless access is constrained;
- file observations should optionally re-hash or detect mtime/identity changes before use;
- publication should copy and verify bytes rather than trust an old path/digest pair;
- source-map references and generated bytes must be observed from the same snapshot.

**[INFERENCE OWN-011]** “Borrowed” is a temporal ownership law, not merely a temporary directory implementation detail.

## 10. Promise table

| Promise | Portable browser role? | Qualification |
|---|---:|---|
| Provider ran in isolated root | Yes | Adapter-controlled staging. |
| Output members contained | Yes | Canonical validation; escaping link/path rejects. |
| Frozen manifest observation | Yes | After provider completion, before callback. |
| Tree exists during callback | Yes | Subject to detected external mutation/host failure. |
| Tree removed after callback | Best effort with typed cleanup failure | No impossible guarantee against host failure. |
| No partial provider writes ever occurred | No | Provider may write before failure. |
| Failure leaves caller deployment untouched | Yes for portable role | Because provider never writes there. |
| Durable tree returned | No | Separate publication required. |
| Atomic single-file commit | Possible in separate profile | Same-parent/same-filesystem and platform conditions. |
| Atomic non-empty directory replacement | No portable claim | Platform/deployment-specific. |
| Rollback of multi-file publication | No implicit claim | Versioned deployment can define explicit rollback. |
| Provider direct-write transaction | No | Provider-native partial outcome. |

## 11. Output manifests and metadata

Portable manifest fields should be observations, not deployment authority. Provider manifests/metafiles should be retained verbatim when possible. The adapter may project common fields—entry, role, imports, external, CSS association—only when supported by official provider evidence.

**[PROPOSAL OWN-012]** Unknown or unrepresentable provider metadata belongs in an opaque/provider-native observation, never discarded to make providers appear identical.

## 12. Conclusion

**[INFERENCE OWN-013]** The strongest honest common ownership law is: *one completed provider build lends one isolated, validated output snapshot for one continuation; it publishes nothing.* This is sufficient for a semantically useful portable browser payload and avoids false cross-platform directory-transaction claims.

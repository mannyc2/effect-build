# Architecture

The authoritative scope is `effect-build/research-complete-contract@1` in
[`tooling/research-complete-contract.json`](../tooling/research-complete-contract.json).
The source is the local hard-cut implementation of that scope. External matrix,
credential, registry, and clean-host evidence remains a separate certification
authority.

## Core ownership

`effect-build` exposes exactly six subpaths: `Artifact`, `SystemTarget`,
`Matrix`, `Author/Tool`, `Author/BorrowedOutput`, and `Author/Executable`. They
are also root namespaces. Provider packages depend one way on core and never on
another provider.

- `Artifact` records absolute paths, byte counts, algorithm-qualified content
  identity, native format, architecture, and publication truth.
- `SystemTarget` is independent from the orchestrator runtime, selected tool,
  construction host, and target runner.
- `Matrix` executes a finite ordered set with bounded concurrency and preserves
  complete `Cause` information.
- `Author/Tool` selects an exact executable, observes its capabilities, and
  reauthenticates the selected bytes immediately before launch.
- `Author/BorrowedOutput` lends a contained file or tree only to a scoped
  continuation and reports cleanup failure without converting interruption.
- `Author/Executable` owns private same-parent staging, executable inspection,
  input revalidation, and atomic single-file replacement.

There is no public generic build algebra, `BuildError`, `Target`, provider
registry, raw argv, retry, fallback, automatic installation, `Generation`, or
`DurableFile` authority.

## Provider-native lanes

Each provider operation has one semantic owner: an in-process `Api` lane or an
authenticated selected-executable `Command` lane. Similar native names are not
automatically mirrored. Required modules are public; all-conditional modules
are compiled and tested package-private until their full named gate closes.

- Bun exposes API Transpiler, Build, and CompileExecutable plus command Build,
  Watch, and CompileExecutable.
- Deno exposes command Transpile and CompileExecutable. It has no `Api` export;
  API Bundle, command Bundle, and CompileWatch are conditional
  package-private candidates.
- esbuild exposes API Build, BuildToDirectory, Transform, AnalyzeMetafile,
  FormatMessages, Context, and ContextToDirectory plus command Build,
  BuildToDirectory, and Watch. Command Serve remains conditional and private.
- Node SEA exposes only command AssembleExecutable; no accepted in-process
  operation exists from which an `Api` lane could be synthesized.
- Rolldown is a private conditional package candidate. Its selected API and
  command operations are implemented and tested privately because R6 and every
  current R1 Rolldown operation gate remain open.

Provider-direct directory writes state their actual durability: interruption
or failure may leave partial provider output. They do not borrow
`Author/Executable`'s atomic single-file claim.

## Scoped role candidates

The package-private `Author/NodeMain` candidate is offer-first. An assembler advertises its exact agreement
before a producer runs; the producer returns a sealed CommonJS or ESM main that
can be accessed only through an opaque scoped continuation. The private target
finalizer authenticates exact Node 26.7.0 builder and base distributions,
constructs and inspects target bytes, and requires execution on the exact target
runner. The matrix control plane is implementation, not target certification.

The package-private `Profile/BrowserModulePayload` candidate borrows an explicit provider-declared module
tree. It authenticates files, media types, roles, entry associations, and
internal/external edges. It performs no filename inference, HTML synthesis,
provider-output rewriting, or publication.

The conditional `IncrementalNodeMain` candidate serializes authenticated source
revisions and borrowed sealed-main continuations, keeps Node semantics stable,
joins in-flight work before one provider release, and preserves release failure
in `Cause`. The conditional typed-watch candidate accepts typed host events—not
CLI output—uses explicit input/output sets, bounded dirty coalescing, rename
boundary projection, successful-build dependency updates, and scoped
interruption.

## Package-private durable generations

Ordinary provider output directories are not transactions. The separate
package-private generation primitive observes a quiescent regular-file tree,
rejects aliases and non-portable or colliding paths, writes canonical
`manifest.json` bytes and a content-addressed immutable generation, then
atomically replaces only `current.json`. Readers pin one verified generation;
rollback activates an existing generation; automatic collection is forbidden.

This primitive does not widen `BrowserModulePayload` into a public static-site
publisher. Its remaining crash, cross-process, and exact-host durability laws
are external gates.

## Apple distribution

`effect-build-apple` is a separate direct-Developer-ID family with exactly nine
public modules: `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`,
`InstallerPackage`, `Notary`, `Staple`, and `Assess`. Every local mutator consumes
authenticated immutable input, works in private staging, revalidates input and
output, and returns new bytes plus a provenance edge. Notary and assessment are
digest-bound observations rather than byte mutations.

The family does not create a generic deployment manager. Product form,
identity, entitlements, credentials, retry policy, approvals, publication, and
retention remain application or release-system authority. Local noncredentialed
tests do not earn A0-A9, the credential-backed distribution matrix, or clean-host
Gatekeeper evidence.

## Evidence and release architecture

Compatibility is a private finite evaluator, not a public matcher. Its
five-host provider, browser, packed-consumer, and Node-finalizer workflows
authenticate exact coordinates and record unsupported cells as exclusions,
never passes. Construction hosts remain distinct from artifact targets and
target runners.

Release-significant receipts use a two-authority design: a read-only certifier
produces a bounded artifact, and a separately protected least-privilege archiver
validates it before an idempotent, non-force fast-forward to the receipt-only
orphan ref `evidence/receipts-v1`. The evidence commit is never the source it
certifies.

Apple certification further authenticates the certifier mechanism itself. A
protected primary path/digest pair serves distribution and A0–A9; a distinct
protected path/digest pair serves clean-host cells. The harness executes only a
private, read-only, immediately rehashed snapshot. It also authenticates and
privately snapshots the exact semantic prior-evidence dependency set, retains a
canonical manifest, and cross-links clean-host transport identity to its
distribution producer. Canonical `@2` request, receipt,
category-evidence, and bundle records bind source, candidate, package version,
lockfile, clean worktree, runner, certifier, prior manifest, and operation-level proof. The
public release coordinator keeps those evidence bodies opaque after the
certification producer has structurally validated them.

Implementation, local tests, external certification, merge, release approval,
publication, and post-release verification are independent states. The release
workflow remains quarantined, and this candidate grants no publication
authority.

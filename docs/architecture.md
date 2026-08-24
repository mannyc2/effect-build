# Architecture

The approved target is `effect-build/v0.5-contract@1` in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). The source remains
transitional for the core/profile hard cut. The Apple owning lane is implemented;
this page separates implementation from still-unearned compatibility and
distribution evidence.

## Current candidate

Core currently exposes `Target`, `Artifact`, `BuildError`, and a public
`Toolchain` callback kernel. Bun and Deno executable compilation, Bun and Deno
directory bundling, esbuild native operations, raw Node SEA assembly, and
Rolldown native operations sit in provider packages with one-way dependencies
on core. `effect-build-apple` also depends only on core and exposes the selected
nine-subpath direct-Developer-ID family without a compiler-sibling dependency.

Executable publication stages one file and commits it through one rename. The
current Bun and Deno bundle path is different: it renames staged files into an
ordinary destination one at a time. A failure after any successful rename can
leave old and new files together. The current `Artifact.Bundle` is an
observation of committed files, not a directory transaction.

The current `Toolchain`, `Artifact.Bundle`, target inference helper, and Node SEA
assembly name are scheduled for one hard cut. They are not the target
third-party SPI or portable-artifact model.

## v0.5 target

Core owns canonical identity and ownership states:

- an algorithm-bearing `Digest`;
- a selection-time and reobserved `SelectedTool`;
- revocable `BorrowedContent`;
- a contained, regular-file-only `TreeSnapshot`;
- an immutable content-addressed `DirectoryGeneration`;
- one `CurrentGeneration` activation reference;
- verified and authenticated Node base states;
- assembler agreement and sealed Node-main states; and
- assembled, target-supported, and exact-artifact-executed evidence states.

Providers keep native operations. Portable adapters implement the role-specific
Author laws. No public function may accept an arbitrary producer callback plus
caller-authored tool or target metadata and mint a trusted artifact.

### Directory publication

A producer writes only to private staging. effect-build observes and hashes a
complete `TreeSnapshot`, writes canonical `manifest.json` and the tree into a
new `generations/sha256-<manifest-digest>/` directory, seals that directory, and
atomically replaces only `current.json`. Readers read Current once, derive and
verify the generation from its one manifest digest, and pin it. Rollback is
activation of an already sealed generation. Ordinary output directories are
never transaction subjects, and old generations are not collected
automatically.

### Portable profiles

`effect-build/profile/node-main@1` admits one sealed CommonJS or ESM main with a
closed loader policy and an authenticated Node 26.7.0 base. Bun, esbuild, and
Rolldown adapters produce the same sealed protocol; the SEA assembler contains
no provider branch. Support is advertised only after every frozen
producer/format/construction-host/target coordinate and exact-target execution
receipt passes. Exact-target finalization returns the final bytes to the
orchestrator; macOS applies only the ad-hoc, no-timestamp signature required to
repair the runnable Mach-O before rehash, inspection, and execution. That SEA
step has no Developer ID, entitlement, hardened-runtime, container,
notarization, stapling, or distribution-assessment authority.

`effect-build/profile/static-browser-application@1` admits one explicit module
entry and explicit static resources, generates its own host document, requires
authoritative complete output-edge metadata, and serves relative URLs inside a
pinned generation. A provider's native browser flag does not satisfy this
profile. The same consumer must pass through all three independent Bun,
esbuild, and Rolldown adapters and every pinned Chromium, Firefox, and WebKit
host cell.

### Apple distribution

`effect-build-apple` is a separate, closed direct-Developer-ID operation
family: `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`, `InstallerPackage`,
`Notary`, `Staple`, and `Assess`. It distinguishes Developer ID Application
from Developer ID Installer, requires explicit caller-owned hardened-runtime
and entitlement policy, signs nested code inside-out, and never selects
identities by display name alone. ZIP is transport rather than a signing subject
and cannot be stapled; stapling admits only a notary-accepted app, DMG, or flat
PKG.

The initial flat-PKG operation accepts exactly one authenticated `.app`
component, explicit identifier/version/install location, and an exact Developer
ID Installer identity. It uses `pkgbuild` with a mandatory timestamp and verifies
with `pkgutil`. `productbuild`, `productsign`, multi-component packages, and
installer scripts remain caller/release-system policy and require a later
explicitly funded API. Exact Notary JSON/status decoding and detailed receipt
and evidence shapes remain provisional until credential-backed A7 fixtures.

The owning implementation stage has frozen the operation/service names and
non-Notary input/result structures in `tooling/public-api.json`. It also freezes
the nominal boundary between durable `SubmittedReceipt` data and live or
reconciled `Submission` query authority. `Artifact.LifecycleError` and the
generated tagged error constructors are intentional public recovery surfaces.
A7 may still force a breaking change to the exact Notary provider decoder/status
mapping or detailed Notary receipt/reconciliation-evidence structures.

Every local mutator consumes authenticated immutable input, works in private
staging, revalidates input before work and staged output before publication,
and produces a new artifact, digest, and provenance edge. Notary is a remote,
resumable observation bound to one input digest and submission ID; it does not
mutate bytes or blindly resubmit an unknown outcome. Assessment records only
host-local static signature and policy observations bound to unchanged bytes;
the separate G cells own quarantined clean-host Gatekeeper evidence. The
consuming application or release system—not this package—chooses form, channel,
bundle identity, install policy, credentials, approval, retry policy,
publication, and retention. Mac App Store distribution and universal-binary
construction are outside v0.5.

Files publish atomically without clobbering by hard link. Trees reserve the
destination and atomically replace only that operation-owned reservation; the
destination parent is caller-controlled, and no hostile local reservation-swap
guarantee is claimed. Notary persists and fsyncs a no-clobber attempt before
launch. Once complete child output exists, post-run tool authentication,
parsing, and durable sidecar commit finish in one uninterruptible region so a
returned submission ID is not lost. Stored receipt bytes remain data rather
than query authority, and blind resubmission is forbidden.

Local A0, A1, and A9 evidence is green at Apple implementation revision
`5718e83907e8e463a16c2dc186e70fa3f5ca90a1`, but those cells are not formally
earned without retained exact-revision receipts/CI. A2–A8 and
G-App/G-ZIP/G-DMG/G-PKG are not earned; no Developer ID or Notary credentials
and no clean host were used.

### Lifecycle

Only schema-serializable portable work runs inside the owned OS process tree
that earns the hard interruption guarantee. Native plugins, callbacks, and
handles remain provider-specific. Watch state is bounded and coalesced; native
build, watcher, and result resources are globally bounded per stream and closed
exactly once, cleanup is awaited, and cleanup failure remains in Effect Cause.

Applications still choose one explicit provider Layer and one official Effect
platform Layer. Core source imports no `node:*` modules. There is no registry,
tool installation, runtime fallback, generic build algebra, generic deployment
manager, or generic release graph. The closed Apple mechanisms above do not
create a generic deployment manager.

# Artifact composition

New operations consume existing artifacts according to the guarantees they need. Core owns durable identities,
verified consumption, scoped finalization, and native executable observation. Producers own their format and tool
rules. Packages depend on core; they do not import a sibling's private implementation.

## Verified file inputs

`File.VerifiedInputSchema` is the canonical runtime schema for `File.VerifiedInput`: a `HashedFile` or a
`HashedExecutable`. Archives and nFPM accept this schema directly. A finalized tree's file projection is already a
`HashedFile`, so all three origins compose through the same public boundary. The original artifact retains its
provenance, publication facts, digest, and executable observations. Consumers call `File.withVerifiedBytes` before
encoding or private materialization; no intermediate file publication is needed.

Archive permissions and nFPM package permissions and architecture remain explicit. A compiler target does not choose
package metadata. Unhashed output, borrowed output, and candidate observations cannot enter a durable verified input.
Changing or removing the source after finalization makes verification fail before the consumer uses its bytes.

Archive layout validation applies the same case-insensitive NFC path identity to full names and every ancestor. A file
or symlink named `A` cannot coexist with `a/file`; this is rejected in either input order. Valid explicit and implicit
directories preserve their emitted spelling.

## Author-owned lifetimes

`File.publish`, `Tree.publish`, and `Executable.publish` own the scope used by their producer and inspector callbacks.
Their result types remove `Scope` from callback requirements while preserving every other service and error.
Resources are released when publication succeeds, fails, or is interrupted. `File.withVerifiedBytes` does not own the
continuation's scope, so that operation keeps the continuation's requirements.

## Native executable observations

`NativeExecutable.parse` observes ELF, Mach-O, or PE headers in bytes. `NativeExecutable.observe` checks a regular file,
its executable permissions where applicable, and its byte count before parsing. These operations establish format,
OS, architecture, and the ELF ABI when its interpreter identifies one. They do not establish runtime/version,
provider support, code signatures, or successful execution.

Bun and Deno reuse this core mechanism. Each adapter still supplies runtime/version facts, matches the requested
system target, and rejects ambiguous or mismatched ABI evidence. Node SEA's Linux x64 GNU admission and Apple's
format/signing rules are unchanged.

## Node SEA assets

Node SEA `Asset` is an explicit union:

```ts
{ _tag: "File", key: "config", path: "./config.json" }
{ _tag: "Bytes", key: "config", contents: verifiedBytes }
```

The file variant resolves relative paths against the operation's working directory. The bytes variant snapshots the
input during preparation. Both use the existing private input materialization and unique asset keys. Untagged records,
unknown tags, and records mixing path and byte fields are rejected. Existing asset callers must add `_tag: "File"`.

A consumer can compose `File.withVerifiedBytes(artifact, contents => AssembleExecutable.assembleDirect(...))` without
creating a temporary input path. The artifact must still verify at the handoff; after preparation, the held snapshot
is independent of the original source path.

## Evidence and contract

This change implements findings 1–5 of [the composition audit](https://github.com/mannyc2/effect-build/issues/39).
It refines `CORE-FINALIZE-FILE`, `CORE-FINALIZE-TREE`, `CORE-FINALIZE-EXECUTABLE`, `PROD-ARCHIVES-001`,
`PROD-ARCHIVES-002`, `PROD-NFPM-001`, and `CAN-NODE-001`, and admits `CORE-NATIVE-EXECUTABLE` for the two existing
compiler adapters. It does not admit a wheel operation or a generic packaging API.

- `test/unit/archive-layout-composition.test.ts` covers canonical ancestor collisions and valid controls.
- `test/unit/verified-input-composition.test.ts` covers preserved identities, both consumer ingresses, payload bytes,
  explicit package mode, and mutation refusal before launch.
- `test/unit/author-scopes.test.ts` and `typetest/author-scopes.tst.ts` cover lifetimes and retained services/errors.
- `test/unit/native-executable-inspection.test.ts` covers shared observations and provider policy.
- `test/unit/node-sea-assemble-executable.test.ts` covers precise asset variants and defensive snapshots.
- The real Bun, nFPM, and Node SEA integration lanes consume the resulting archive/package/embedded asset, and the
  installed-package consumer exercises public imports from packed artifacts.

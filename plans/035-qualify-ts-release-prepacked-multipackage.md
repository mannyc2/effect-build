# Plan 035: Qualify ts-release for ordered prepacked multi-package releases

> **External-repository approval gate**: this plan targets
> `https://github.com/mannyc2/ts-release.git`, not effect-build. Before creating
> a branch or modifying that repository, message the parent task with the exact
> baseline SHA, proposed files, and test scope. Approval to execute effect-build
> plans is not approval to mutate another repository. While approval is
> pending, continue any independent effect-build plan.

## Status

- Priority: P0 release blocker
- Effort: XL
- Risk: HIGH
- Depends on: effect-build 032; external approval
- Audited ts-release source: `1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3`, 2026-08-14

## Outcome

Extend ts-release's existing authoring/preparation boundary so one prepared
release can contain an ordered nonempty list of exact prepacked npm tarballs,
then GitHub. Preserve its existing coordinator and npm protocol. Prove that it
publishes the exact supplied bytes, observes before every mutation, enforces
prerequisites, and safely resumes partial/unknown outcomes.

## Verified architecture

The existing runtime is already the canonical owner:

- `src/publication/coordinator.ts::publishReleaseSubjects` validates ordered
  prerequisites, observes, mutates, and re-observes unknown outcomes;
- `src/publication/adapter.ts::subjectsForPreparedRelease` adds every prior
  publication subject as a prerequisite, so GitHub can be last;
- `src/publication/npm.ts` compares registry integrity/shasum and publishes the
  `PreparedArtifact` blob;
- `src/recipes/config.ts::CandidateConfig` has singular `npmPackage?` and
  `CandidatePublish.npm?`;
- `src/release/prepare.ts` calls `npmTarball(...)` for every
  `GraphNpmPublication`, repacking source.

The kernel is kept. The singular/repacking frontend is changed.

## Exact proposed contract

Introduce a nonempty ordered authored collection (names may follow local style):

```ts
interface CandidatePrepackedNpmPublication {
  readonly id: string
  readonly path: SafeRelativePath
  readonly packageName: string
  readonly version: string
  readonly sha256: Sha256Digest
  readonly registry: CanonicalNpmRegistryEndpoint
  readonly distTag: NpmDistTag
  readonly access: NpmAccess
  readonly authentication: NpmAuthentication
  readonly provenance: NpmProvenancePolicy
}
```

The collection order is semantic publication order. Do not accept caller
prerequisite IDs, arbitrary command hooks, glob paths, directories, or
`npmPackage` build instructions in the same mode. Retain the old singular
source-pack mode only if ts-release has a committed compatibility policy;
otherwise perform a documented hard cut.

## External scope

Expected ts-release files:

- `src/recipes/config.ts`
- `src/resolve/resolve.ts`, `src/resolve/encode.ts`
- `src/release/graph.ts`, `src/release/prepare.ts`
- `src/release/prepared.ts`, store/inspection code only if the existing artifact
  model cannot express supplied bytes
- `src/publication/adapter.ts` only for order assertions, not a new coordinator
- CLI/Action input and docs/schema generation
- focused unit/protocol/action/consumer fixtures
- dependency/peer manifests and lock only if qualification exposes the known
  Effect peer-install conflict

## Steps

1. Reconfirm the audited SHA and run the repository's complete baseline gates.
   Record actual package manager/runtime commands from that repository; do not
   substitute effect-build's Bun policy blindly.

2. Write red decoding/graph tests for zero subjects, duplicate IDs,
   duplicate package coordinates, wrong/unsafe path, hash shape, wrong order,
   mismatched name/version, tarball path outside the prepared root, and mixing
   source-pack with prepacked mode.

3. During preparation, read each supplied tarball once into the existing
   prepared blob store, verify declared SHA-256/size, inspect its package.json
   without extracting outside a bounded temporary directory, and require exact
   package name/version. Reject workspace/file/link dependencies and unsafe tar
   entries. Construct the existing `PreparedArtifact` and
   `PreparedNpmPublication`; never call `npm pack` in prepacked mode.

4. Preserve authored order through graph, manifest encode/decode, prepared
   store reload, `subjectsForPreparedRelease`, observation, and publish. Freeze
   the effect-build order:

   ```text
   effect-build
   effect-build-bun
   effect-build-deno
   effect-build-esbuild
   effect-build-node-sea
   github
   ```

5. Add protocol tests using five distinct byte blobs for:

   - all absent -> exact order;
   - first N equivalent -> resume at N+1;
   - any conflicting coordinate -> zero later mutations;
   - before-dispatch failure -> safe retry;
   - response loss/unknown -> reobserve equivalent before advancing;
   - unknown not converged -> stop;
   - npm five equivalent but GitHub absent -> GitHub only;
   - exact publisher input bytes equal authored SHA for every subject.

6. Add an effect-build-shaped Action/CLI fixture that loads five prepacked
   tarballs plus manifest without repacking. Qualify the distributable Action
   or CLI from a clean external consumer. Resolve the historical strict npm
   Effect peer-tree conflict before claiming the public package usable; if only
   the bundled GitHub Action is qualified, say so explicitly and use only it.

7. Run all ts-release gates, then a no-network fake-provider end-to-end. Record
   exact source SHA, checks, artifact hash, and the supported invocation in this
   plan. No real npm/GitHub mutation belongs here.

## STOP conditions

- implementation bypasses `publishReleaseSubjects` or duplicates recovery;
- prepacked mode invokes `npm pack` or changes bytes;
- order is reconstructed lexically rather than preserved from authored data;
- test relies on a public version whose dependency tree is not installable;
- any credential or live publication is required for qualification.

## Maintenance / compression ledger

Reuses one coordinator and one prepared-blob model. Replaces singular
source-pack authority with ordered verified prepacked subjects; adds no release
logic to effect-build.

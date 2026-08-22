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
- Completion: `DONE`

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

## Receipt

- The parent approved one isolated external branch from the audited clean
  baseline `1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3`. The completed ts-release
  source is `105b6b5cc39757f5284c30b082e7cfd71b9959b2` on
  `codex/prepacked-multipackage-release`; its direct parent is the approved
  baseline and the local and remote refs were observed equal with clean
  worktrees. The parent separately approved exactly one non-force branch push
  and exactly one `CI` workflow dispatch. No merge or second source mutation
  is part of this receipt.
- Before authoring, exact baseline `1e9efd717ff9d5dc2dbe5e079894cd8e92eb7ed3`
  passed `bun install --frozen-lockfile`, `bun run build`,
  `bun run check:portable`, and `bun run check:agents` under Bun `1.3.14`; the
  main full-suite `bun test` phase within the portable gate reported 387
  passed, four expected platform skips, and zero failures. No exact red-phase
  command/output was retained, so this receipt does not misrepresent
  final-green evidence as a durable red-run receipt.
- The coherent external diff contains 29 files and 2,671 insertions / 227
  deletions. Its bounded scope is authored config/resolution/graph,
  preparation and prepared-store persistence, capability/inspection support,
  a strict bounded npm-tarball inspector, generated schema and documentation,
  focused config/preparation/protocol fixtures, packed-consumer qualification,
  and the checked Action bundle plus its isolated external-consumer harness.
  `src/publication/coordinator.ts` and `src/publication/npm.ts` are unchanged:
  `publishReleaseSubjects` and its existing npm observation, mutation, and
  recovery protocol remain the sole coordinator/kernel. Package manifests and
  `bun.lock` are also unchanged.
- `publish.prepackedNpm` is an ordered nonempty authored collection. Preparation
  verifies each declared path, lowercase SHA-256, package name/version,
  registry policy, bounded compressed and expanded archive shape, safe tar
  entries, and the absence of workspace/file/link/portal or platform-local
  dependency references. It stages and captures each blob once, never calls
  `npm pack`, and preserves exact bytes and authored order through graph
  resolution, encode/decode, prepared-store reload, publication subjects, and
  GitHub-last prerequisites. Mixing source-pack and prepacked modes fails
  closed and the historical singular prepared `kind: "package"` contract
  remains accepted.
- The aggregate focused config, preparation, compatibility, publication, and
  feature-census set passed all 32 tests; the no-network five-blob publication
  protocol fixture itself contributes eight of those tests. It covers all
  absent, every partial-resume prefix, conflict at each coordinate, a
  separate-invocation retry after pre-dispatch rejection, response-loss
  re-observation, bounded unknown non-convergence, GitHub-only continuation,
  GitHub last, and exact publisher/GitHub byte identity. The clean Action
  fixture copies the checked bundle into an isolated directory with no
  `node_modules`, uses an explicit allowlisted environment, creates ignored
  untracked candidate tarballs after the fixture source commit, and proves
  five distinct blobs in authored
  `core -> Bun -> Deno -> Esbuild -> Node SEA -> GitHub` order with
  `npmPack: "not-used"`. The checked Action bundle SHA-256 is
  `7f7a4847438438267d8e6af34cbd7a5ec4deae93d97afbbe8c5c3537c061412e`.
- Exact local package manager Bun was `1.3.14`. `bun run build`, the focused
  config/preparation/protocol tests, `bun run check`, generated schema,
  capabilities, examples, README, recovery, import, tree-shaking, exports,
  CLI-bundle, and Action-bundle gates passed. The full `bun test` receipt was
  414 passed, three expected platform skips, and zero failures;
  `bun run check:portable` and `bun run check:agents` passed. A clean packed
  consumer on Node `22.22.2` / npm `11.11.0` passed with the repository's four
  Effect/platform endpoints aligned at `4.0.0-beta.83` and result shapes
  1/2/5. Local macOS `bun run check:release-candidate` reached a ready
  self-release context and then stopped at its existing Linux-only preparation
  boundary; it was not reported as a local success.
- A clean strict npm consumer combining effect-build's `4.0.0-rc.108` Effect
  family with public `@mannyc1/ts-release@0.2.2` reproduced `ERESOLVE` against
  ts-release's exact `@effect/platform-bun@4.0.0-beta.83` peer. A trial rc.108
  repository alignment produced broad Effect API incompatibilities and was
  fully reverted before the clean frozen beta.83 install and checked-bundle
  rebuild. Therefore the qualified effect-build invocation is only the checked
  bundled GitHub Action at the immutable commit above, with the stock
  no-custom-adapter path. The npm-installed library/CLI remains explicitly
  unqualified; no dependency or lock widening is claimed.
- The one approved exact-SHA dispatch produced
  [CI run `31869706521`](https://github.com/mannyc2/ts-release/actions/runs/31869706521)
  with `workflowName=CI`, `event=workflow_dispatch`, head branch
  `codex/prepacked-multipackage-release`, and head SHA
  `105b6b5cc39757f5284c30b082e7cfd71b9959b2`. It completed successfully:
  [Agent host validation `94976323840`](https://github.com/mannyc2/ts-release/actions/runs/31869706521/job/94976323840),
  [Ubuntu portable `94976323863`](https://github.com/mannyc2/ts-release/actions/runs/31869706521/job/94976323863),
  and [macOS portable `94976323914`](https://github.com/mannyc2/ts-release/actions/runs/31869706521/job/94976323914)
  all concluded `success`. Ubuntu supplies the native-Linux checked-Action
  qualification. The only annotations were GitHub's Node 20 action-runtime
  deprecation notices.
- The effect-build receipt diff was verified under exact Bun `1.3.14`.
  `bun x vitest run test/architecture/docs-contract.test.ts` passed 9/9.
  `bun run verify` passed five typetest files, 230 unit tests with one
  intentional skip, 14/14 fresh npm/Bun packed consumers, 68 architecture
  tests, lint, and formatting. Its first sandbox-restricted attempt could not
  obtain fresh npm metadata and reported `effect@undefined`; the unchanged
  strict fixture passed when rerun with read-only registry access, without any
  peer relaxation or source change. `bun run verify:effect` then passed both
  exact endpoints `4.0.0-beta.104` and `4.0.0-rc.108`; each ran the same 230
  unit tests with one skip and 14/14 fresh packed consumers.
- Qualification caused no npm login, reservation, ownership/trust change,
  publication, tag, GitHub Release, npm or publication credential acquisition
  or use, or effect-build source mutation. It does not merge the ts-release
  branch or authorize Plans 036 or 037 public-state gates.

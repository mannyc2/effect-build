# Plan 037: Recertify and release the exact five-package bytes

> **Mandatory parent approval**: candidate construction and read-only
> observation may proceed. Before the job that can publish npm, create a tag,
> or create a GitHub Release, send the parent task the implementation SHA,
> exact CI/candidate run IDs, manifest, five hashes, registry/trust observation,
> qualified ts-release identity, and proposed dispatch command. No approval
> means no mutation. Never fall back to manual `npm publish`.

## Status

- Priority: P0 release
- Effort: L plus CI/registry time
- Risk: CRITICAL external state
- Depends on: 028-036 complete
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Outcome

Publish one newly certified exact source as five npm `0.3.0` packages in
dependency order, then create the GitHub tag/release last. Published registry
integrity must correspond to the tested tarball bytes. The operation is
resumable after partial or unknown outcomes and refuses conflicts.

## Scope

- `.github/workflows/release.yml`
- exact release config/schema input consumed by the qualified ts-release tool
- `scripts/verify-candidate.mjs` only if Plan 032's manifest fields require it
- `test/architecture/generated-and-ci.test.ts`
- release docs/changelog/migration notes
- this plan and `plans/README.md`

No package source change after certification begins. A source defect reopens
its owning plan and restarts all certification.

## Workflow contract

1. Candidate jobs retain `contents: read`, validate the requested full SHA
   before repository code, use cold frozen installs, run complete deterministic
   checks, both Effect endpoints, real Bun/Deno/Node SEA/Bun bundle lanes, all
   targets, all publication hosts, and fourteen locked packed consumers.

2. Pack each package once. Emit exactly five `.tgz` plus a manifest containing
   source SHA, name/version, size, SHA-256, and Plan 032 lock/tree evidence.
   Verify the artifact via the GitHub artifacts API: exact one artifact, name,
   ID, `sha256:<64hex>` digest, not expired, and workflow-run head SHA.

3. A protected `publish` job downloads that same artifact; it never checks out
   package source to repack. It re-runs the candidate verifier, anonymous npm
   observation, and trusted-publisher identity checks. Only this job has
   `id-token: write`; it may also have narrowly required `contents: write` for
   the GitHub subject. `persist-credentials` remains false.

4. Invoke the exact qualified ts-release Action/CLI commit from Plan 035 with
   prepacked subjects in this order:

   ```text
   effect-build@0.3.0
   effect-build-bun@0.3.0
   effect-build-deno@0.3.0
   effect-build-esbuild@0.3.0
   effect-build-node-sea@0.3.0
   GitHub tag/release
   ```

   Every subject depends on all prior subjects. npm mutations use trusted OIDC;
   GitHub is last. Equivalent already-published bytes converge; conflict or
   unresolved unknown state stops later subjects.

## Steps

1. Implement workflow/config tests first: no repack command in publish job;
   permissions/job environment exact; one artifact; five ordered subjects;
   GitHub last; source/hash verification before publisher; no token credential.

2. Run locally before commit:

   ```sh
   test "$(bun --version)" = "1.3.14"
   bun install --frozen-lockfile
   bun run verify
   bun run verify:effect
   bun run test:architecture
   git diff --check
   ```

3. Commit the complete source/workflow/docs cut, push it, and obtain exact-SHA
   successful push CI. Dispatch the candidate-only path and download/verify the
   artifact. Record all identities in the approval request.

4. After explicit approval, dispatch the protected publish path once. Watch to
   terminal status. If transport/result is unknown, do not redispatch until
   ts-release read-only observation produces its recovery decision.

5. Verify anonymously:

   - each npm version exists with expected dist-tag and integrity/shasum;
   - fresh npm and Bun applications install the public coordinates and pass all
     isolated/composed examples;
   - Git tag targets the implementation SHA;
   - GitHub Release assets equal the candidate hashes;
   - workflow provenance/attestations identify the approved workflow/source.

6. Record a final receipt and restore governance from transitional release mode
   to ordinary maintenance. Require a literally clean worktree.

## STOP conditions

- exact source, tarball, artifact, tool, or trusted-publisher identity differs;
- any registry coordinate contains conflicting bytes;
- coordinator reports unresolved unknown commitment;
- GitHub would be created before all five npm subjects converge;
- a retry would repack or use manual token publication.

## Maintenance / compression ledger

Adds one protected mutation job and one ordered config. Reuses the certified
candidate and ts-release coordinator; introduces no effect-build release
protocol or second set of bytes.

## Receipt

- The release-infrastructure commit is
  `f06f96ca88b6278e5f23a898d758b99fa9322108`, a clean descendant of the
  corrected implementation `a989fd12c377534b36fb468a2c4e8baf00330410`.
  It changed exactly eleven non-package files. A mechanical diff proved zero
  changes under `packages/**`; the package tree remained
  `9ad55683899ec7447b608cff7997ac5a2572a996`. The workflow manifest authority
  is the descendant SHA `f06f96ca...`, not its parent. Root
  `effect-build-workspace` gained only private release-observation version
  `0.3.0`; `bun.lock` and all five package manifests remained unchanged.
- The two-dispatch workflow freezes candidate and publish authority. Candidate
  performs all deterministic/real/Effect/consumer gates, packs the fixed
  five-package list exactly once, authenticates the artifact by API identity
  and digest, and invokes only ts-release Action commit
  `105b6b5cc39757f5284c30b082e7cfd71b9959b2` with `command: prepare`.
  Publish has no checkout, build, repository install, or pack; it authenticates
  the exact candidate run, raw artifact, prepared artifact, report, and
  `prepared_ref`, then invokes only that immutable Action with
  `command: publish`. Only publish has environment `npm`, `id-token: write`,
  and the narrowly required release permissions. No custom adapter, token,
  manual publisher, fallback publisher, or integration-source mutation exists.
- Local exact Bun `1.3.14` evidence passed the generator/verifier tests 11/11,
  architecture tests 80/80, `bun run check`, oxlint, dprint, all 33 embedded
  shell blocks through `bash -n`, exact Action/config structural assertions,
  and the package-tree identity proof. A synthetic qualified-Action prepare
  decoded the generated config, reported `npmPack: "not-used"`, preserved
  `core -> Bun -> Deno -> Esbuild -> Node SEA -> GitHub`, and kept all five
  blobs byte-identical. Exact-SHA push
  [run `31877736423`](https://github.com/mannyc2/effect-build/actions/runs/31877736423)
  then passed all twelve jobs at `f06f96ca...`: quality `94995833648`, Deno
  target `94995833671`, real tools `94995833693`, Esbuild `94995833704`,
  Ubuntu publication `94995833745`, Bun target `94995833767`, macOS
  publication `94995833768`, Windows publication `94995833773`, Bun bundle
  `94995833779`, Effect beta.104 `94995833817`, Effect rc.108 `94995833820`,
  and Node SEA `94996031180`.
- Candidate-only
  [run `31877936926`](https://github.com/mannyc2/effect-build/actions/runs/31877936926),
  attempt 1, completed successfully at exact `f06f96ca...`. Its twelve
  prerequisite jobs succeeded (Node SEA `94996297102`, macOS publication
  `94996297123`, Ubuntu publication `94996297133`, Esbuild `94996297135`,
  Deno target `94996297136`, Bun bundle `94996297139`, quality `94996297146`,
  Windows publication `94996297171`, Effect rc.108 `94996297186`, real tools
  `94996297202`, Effect beta.104 `94996297213`, Bun target `94996297240`),
  candidate job `94996463922` succeeded, and publish job `94996297304` was
  skipped.
- The accepted candidate artifact inventory contained exactly:

  | Artifact | ID | API SHA-256 |
  |---|---:|---|
  | Raw five-package candidate | `9245275803` | `d1904162d68fa48b5a37dbe5dcead6af9f9785d7d8222a9a9b87c738e4afc96d` |
  | Prepared store | `9245276942` | `070bd8ee4ecd52320b543c17dee87167ceccec02b186a881708b9140012de8e1` |
  | Preparation report | `9245277389` | `a9b9d28989881d15d18a630b95e18193279abc64877dfbb4c624a67a80df0604` |

  The plan's one-artifact rule was reconciled as exactly one raw candidate
  artifact; the qualified Action necessarily owns the separate prepared store
  and preparation report above. No second raw candidate or byte set existed.
  The raw artifact was exactly five `.tgz` files plus manifest `version: 2`
  with source `f06f96ca...` and fourteen consumer receipts. The prepared record
  used `schemaVersion: "prepared-release/v2"`. Its durable authority was
  `prepared:gha:mannyc2/effect-build/runs/31877936926/attempts/1/artifacts/ts-release-prepared-1-41ca1d5bf2e01cd54434d0405cce5a19e1ceb085906243962e97e9b4d7777a67#sha256-41ca1d5bf2e01cd54434d0405cce5a19e1ceb085906243962e97e9b4d7777a67`.
- After separate approval, protected publish
  [run `31907395584`](https://github.com/mannyc2/effect-build/actions/runs/31907395584),
  attempt 1, ran once at exact `f06f96ca...`. Environment deployment
  `5924477392` was explicitly approved. Publish
  [job `95067248635`](https://github.com/mannyc2/effect-build/actions/runs/31907395584/job/95067248635)
  and every step completed successfully. The coordinator observed each absent
  npm coordinate, dispatched exactly once, re-observed
  `PresentEquivalent`, advanced in the authored order, and created GitHub
  only after all five npm subjects converged. Its redacted publication-report
  artifact `9252765858` has API/download ZIP SHA-256
  `a31d1d3ea2c5dc30ff9cfdc8b9afd5a9fc62de4a472e14694abc3c1e0659046f`
  and reports `publish`, `complete`, five `ConvergedAfterMutation` npm subjects,
  then the equivalent GitHub subject.
- Anonymous post-release verification matched every once-packed candidate:

  | Package | Bytes | SHA-1 | SHA-256 | SHA-512 |
  |---|---:|---|---|---|
  | `effect-build` | 50,594 | `1aa18e40d894f3a622fa4b7a7138465c5727f2d0` | `b8bd65f7da71829a7bcb6a6ade24e58eb7818d74ac9e9d0f6ad05b0f60bb90b8` | `67ab2e2ea42c681af25d2412a3eaf7cb450bf66b64378a1f608b10a140bedd81cd75c96c1108730ef23f6da821ae8b1367e876ec950b297c893a07f044cf70ba` |
  | `effect-build-bun` | 13,569 | `d3d284b27e853e11e091f69529ecd2667da8f170` | `dbc9e1734e170abf2da88b9a0b03463af0f94f7b490501b57f65263fbec3c76b` | `8634c6c264769872c771f20709c3714d579ef829e317225410475e3ff0f579dcc03909f228f514bad93ddb95521305caa8ff26d618cf5cfc30a86755ec3a2150` |
  | `effect-build-deno` | 6,291 | `5dd60aa7f7931a362dce7401eda2540efa3b1440` | `539e9077bee012a6e020a6f9fbc22644ebe2afa1f26344a4fc016945d97577c6` | `701c22803c33ae36317ed0c65ece513dc8d870e36e303e7492325629bd2297079ba09b12a71e38577806d120492c0ea4d67dd7e4fc659cea6c18146af0f1271d` |
  | `effect-build-esbuild` | 11,403 | `ff07e0a119921434638c16c5fc89524e2fd97a29` | `b89d7d05241827dc96f2cda18a28596d1e79457a6ad6f46a6e7d83c3cc007651` | `a6a0af6332cfec9567fa33ea52319ea59a00c73641e20fe4179ef7a41c595dcd4b5bdd3d60579ca7c3c21a2507fc8f974dbdcb85271b4bcb98c78c63648e95da` |
  | `effect-build-node-sea` | 17,575 | `22fa88702ae473ecc753faccfef9d0920bbee258` | `4c20c46c2c4195353c2d4e757feff90ad1905a701e23fcac8acf747449c36939` | `20028847520a3b262cb7e7d99eb2fc37e26f253cfc6cfdc8fce22ac5565038a79b10f734d3535b89e35d2a1aa631c652b800ded98e42534d34fcde9cf40eff4a` |

  Every npm `latest` tag is `0.3.0`; each integration retains its explicit
  `reserved` tag. Public tarball downloads and all five GitHub Release asset
  downloads reproduced the sizes and SHA-256 values above. Every npm version
  has a registry signature and two attestations; its SLSA subject carries the
  matching SHA-512 and identifies GitHub-hosted builder, workflow
  `.github/workflows/release.yml`, branch
  `refs/heads/codex/granular-integration-program`, event
  `workflow_dispatch`, and invocation
  `https://github.com/mannyc2/effect-build/actions/runs/31907395584/attempts/1`.
- Tag `v0.3.0` targets exact commit `f06f96ca...`. The
  [GitHub Release](https://github.com/mannyc2/effect-build/releases/tag/v0.3.0)
  is published, non-draft, non-prerelease, and contains exactly the five
  candidate-identical assets. A disposable public-registry consumer run under
  Node `24.14.1`, npm `11.11.0`, and Bun `1.3.14` passed all 14/14 isolated and
  composed type/runtime fixtures without repacking: five packages plus
  Esbuild -> Node SEA and Bun -> Node SEA under both installers.
- No manual/token fallback publication, repack, retry dispatch, second byte
  set, or package-source mutation occurred. The temporary Plan 036 token was
  not used. The release reached a terminal, observed equivalent state across
  all npm subjects, tag, GitHub Release, assets, and provenance.
- On the final four-file receipt slice, exact Bun `1.3.14` passed the docs
  contract 9/9, architecture 80/80, and `bun run verify`: five typetest files,
  233 unit tests with one intentional skip, 14/14 packed consumers, lint, and
  configured formatting. `bun run verify:effect` passed both exact endpoints
  `4.0.0-beta.104` and `4.0.0-rc.108`; each reran the five typetest files, 233
  unit tests with one skip, and 14/14 fresh packed consumers. `git diff
  --check` and the zero-diff package-tree proof passed.

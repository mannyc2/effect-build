# Plan 032: Harden workflow data flow and packed-consumer installs

## Status

- Priority: P0
- Effort: L
- Risk: HIGH supply chain
- Depends on: 028-031
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Outcome

CI/release workflows must validate an exact SHA before executing repository
code, treat workflow outputs as data rather than shell source, and keep
credentials unavailable. Every packed consumer must resolve dependencies into
a lock before package code/install scripts may execute, then install from that
lock without changing it. Candidate evidence records the resulting lock/tree
hashes without pretending the build is hermetic.

## Verified excerpts

Current release jobs check out `${{ inputs.commit }}` and run install/test;
only `candidate` later proves `inputs.commit === github.sha`. Current shell
blocks interpolate `${{ steps.node26.outputs.path }}` directly. Every checkout
already sets `persist-credentials: false`, and package manifests correctly keep
`publishConfig.provenance: true`.

`scripts/test-built-consumer.mjs` creates fourteen isolated fixtures and uses
exact direct tarball versions, but transitives can resolve afresh before a lock
exists. One global override map from `bun.lock` is rejected because duplicate
transitive versions may be legitimate.

## Scope

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `scripts/test-built-consumer.mjs`
- `scripts/verify-candidate.mjs`
- `test/architecture/generated-and-ci.test.ts`
- `test/architecture/workflow-and-consumer-security.test.ts`
- `test/architecture/docs-contract.test.ts`
- any new focused unit fixture under `test/architecture/fixtures/**`
- `package.json` only to register an explicit new test file
- `README.md`, `docs/README.md`, and security/release docs
- this plan and `plans/README.md`

Do not add publish/OIDC mutation in this plan.

## Steps

1. Add architecture tests that parse both workflows and require every job to:

   - validate a full lowercase 40-hex source before first repository-controlled
     script/install action;
   - checkout only the validated SHA;
   - use `persist-credentials: false`;
   - keep `contents: read` and no `id-token: write` in nonpublish workflows;
   - pass step outputs through `env`, never direct `${{ steps.* }}` inside
     executable shell text;
   - pin every action by 40-character commit.

   For push/PR CI, validate `github.sha` immediately after checkout before Bun
   install. For workflow_dispatch, validate the input lexically first, checkout
   it, then require HEAD/input/workflow source equality before repository code.

2. Refactor workflow steps to satisfy the parser assertions. Keep producer and
   orchestrator binaries distinct. Do not put tool paths in global
   `$GITHUB_ENV`; expose them only to the consuming step.

3. For each npm consumer fixture, first run a metadata-only lock operation
   (`npm install --package-lock-only --ignore-scripts`), validate package name,
   exact direct tarball versions, integrity entries, no workspace/file/link
   references, then delete `node_modules` if created and run `npm ci
   --ignore-scripts --strict-peer-deps`. For Bun, characterize the pinned Bun
   1.3.14 `--lockfile-only` behavior, validate `bun.lock`, then run
   `bun install --frozen-lockfile --ignore-scripts` if supported. If Bun cannot
   supply both guarantees, STOP and keep the current Bun consumer as an
   explicitly weaker evidence lane rather than inventing a flag.

4. Hash each fixture lock and normalized dependency tree; add these as
   candidate verification evidence. Do not claim input closure or use the lock
   as a build artifact.

5. Add adversarial tests for malicious-looking output/path data, wrong checkout
   SHA, lock mutation, missing integrity, floating direct dependency, and
   duplicate legitimate transitive versions.

6. Verify:

   ```sh
   test "$(bun --version)" = "1.3.14"
   bun run build
   node scripts/test-built-consumer.mjs --built
   bun run test:architecture
   bun run verify
   bun run verify:effect
   git diff --check
   ```

   Then obtain exact-SHA push CI for all twelve required Plan 026 jobs and one
   non-mutating release candidate. Do not accept a pull-request merge SHA.

## STOP conditions

- checkout/install executes before exact-SHA validation;
- consumer requires executing lifecycle scripts to create a lock;
- a global override collapses dependency versions;
- provenance is removed or a publish permission is introduced.

## Maintenance / compression ledger

Replaces string-interpolated workflow authority with env data and replaces
floating consumer resolution with per-fixture locked resolution. Adds lock
hash evidence only.

## Receipt

- **Implementation baseline SHA**:
  `85879365797439bfd180d6d1338dfcdb6186d8de`, the clean Plan 031 receipt
  commit. The bounded scope list above was reconciled before commit to name the
  new registered security test, its documentation-contract assertion, and the
  two documentation indexes that expose the new release-security contract.
- Tests were written first. The initial workflow characterization reported 20
  CI and 23 dispatch authority violations, including absent exact-ref guards
  and shell-source interpolation. The candidate-schema assertion rejected the
  old v1 manifest; the focused consumer file began with all ten tests red
  because its lock/tree helpers did not exist; and the documentation contract
  failed before the release-security document was added. Review-generated red
  cases then reproduced wrong npm candidate resolution, floating Bun identity,
  short SRI, job-level permission escalation, unvalidated root install
  sections, a transitive reuse of an exact candidate locator, non-locator Bun
  metadata, npm/Bun remote-tarball policy drift, and missing/misbound canonical
  candidate records before each correction.
- Every CI job now checks out only `github.sha` and immediately proves a
  lowercase 40-hex SHA equals HEAD. Every dispatch job lexically validates its
  requested source before checkout, then proves requested source, workflow
  source, and HEAD are identical before repository code. Checkouts keep
  credentials disabled; permissions remain read-only; actions remain exact-SHA
  pinned; and context values enter shell commands only through step-local
  environment data.
- Bun 1.3.14 and npm 11.11.0 were characterized with local tarballs. Their
  script-disabled lock-only operations created locks without `node_modules` or
  lifecycle markers, and their script-disabled frozen installs preserved raw
  lock bytes. Each of fourteen fixtures now performs lock-only -> contextual
  lock validation -> remove `node_modules` -> frozen install -> unchanged-lock
  proof -> type/runtime checks.
- The plan's broad no-`file:` wording is resolved at the only executable
  boundary: unpublished packages necessarily appear as the exact five direct
  candidate tarballs. Those name/version/path/SHA-512 identities are the sole
  permitted local locators, including only a matching direct Bun override;
  every other workspace/file/link/portal/path locator is rejected. Dependency
  sections are inspected contextually so legitimate metadata such as `bin`
  paths is not mistaken for a dependency. SRI-pinned HTTPS resolutions are
  accepted consistently while non-HTTPS remote tarballs are rejected.
- Candidate manifest v2 preserves the ordered five package records and adds
  exactly fourteen ordered consumer observations containing fixture,
  installer, lockfile, raw-lock SHA-256, and normalized installed-tree SHA-256.
  Tree normalization retains distinct package locations and duplicate
  transitive versions. Initial candidate byte identity is authoritative and
  rechecked before manifest emission, so the manifest cannot bless bytes that
  changed after consumer testing. These hashes are observations, not claims of
  input closure, provenance, or reproducibility. Their producing run establishes
  their values; because transient locks and trees are intentionally excluded
  from the six-file artifact, its independent verifier checks their exact
  schema/order rather than claiming to recompute them. Tarball byte hashes,
  manifests, entries, and exports remain independently recomputed.
- Exact package-manager Bun was `1.3.14` (`0d9b296a`). The focused
  security/docs run passed 40 tests. `bun run verify` passed five typetest
  files, 221 unit tests with one intentional skip, 14/14 locked consumers, 64
  architecture tests, lint, and formatting. `bun run verify:effect` passed
  both `4.0.0-beta.104` and `4.0.0-rc.108`; each endpoint passed the same 221
  unit tests, one intentional skip, and 14/14 locked consumers.
- Independent final review found no remaining P0/P1 correctness blocker. Its
  own exact-diff focused run passed 40/40 tests, the architecture suite passed
  64/64, and `git diff --check` was clean.
- The coherent twelve-file implementation source commit is
  `b21eafe99b585f01234f769aac322645e9cc1ecd`. Its worktree was clean after
  commit and push. Exact-SHA CI run `31865690917` completed successfully with
  all twelve jobs: node-sea `94966278700`, bun-bundle `94966278712`, esbuild
  `94966278720`, quality `94966278722`, Effect beta.104 `94966278723`,
  real-tools `94966278733`, Effect rc.108 `94966278740`, Windows publication
  `94966278744`, macOS publication `94966278756`, Bun target support
  `94966278757`, Deno target support `94966278814`, and Ubuntu publication
  `94966278822`.
- Non-mutating candidate run `31865700901` also completed successfully at the
  exact source SHA. Its bun-bundle `94966304460`, node-sea `94966304477`,
  esbuild `94966304482`, and candidate `94966380813` jobs all passed. Artifact
  `9242018446` (`effect-build-0.3.0-candidate`, 101,455-byte archive, server
  digest `sha256:33d6cc5b05775106f93e7bf9f5ee1b32c10cbfb8bbcb74b02df6c788ef4f0d53`)
  contained exactly the five tarballs plus `manifest.json`.
- The downloaded artifact independently passed `verify-candidate.mjs` for
  five packages and fourteen ordered consumer observations. Manifest v2 named
  source `b21eafe99b585f01234f769aac322645e9cc1ecd`; local tarball SHA-256 values
  matched its records exactly: core
  `9c251f90bff8213230be7b1591509301b5dbd1469ff96c00265fda1af6e5062b`, Bun
  `dbc9e1734e170abf2da88b9a0b03463af0f94f7b490501b57f65263fbec3c76b`, Deno
  `539e9077bee012a6e020a6f9fbc22644ebe2afa1f26344a4fc016945d97577c6`,
  Esbuild `3731347d4c509858cf747ca928641a902f6d71b3699dbda344683a0eef0b7994`,
  and Node SEA
  `4c20c46c2c4195353c2d4e757feff90ad1905a701e23fcac8acf747449c36939`.
  This was read-only certification; no publish, OIDC, registry, tag, or GitHub
  Release mutation occurred or is authorized by this receipt.

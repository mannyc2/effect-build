# Plan 032: Harden workflow data flow and packed-consumer installs

## Status

- Priority: P0
- Effort: L
- Risk: HIGH supply chain
- Depends on: 028-031
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`

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
- any new focused unit fixture under `test/architecture/fixtures/**`
- `package.json` only to register an explicit new test file
- security/release docs, this plan, `plans/README.md`

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

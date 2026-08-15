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

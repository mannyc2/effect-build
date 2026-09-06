# Release behavior and trust boundaries

Ordinary [CI](../.github/workflows/ci.yml) exercises the library's supported
scenarios. The [release workflow](../.github/workflows/release.yml) publishes
the packages built from a tested source commit. Pushing a release tag expresses
publication intent; there is no additional certification or manual reviewer
step inside the workflow.

The [combined contract](../tooling/effect-build-contract.json) owns library
capabilities, public exports, and tool admission. The workflow and
[`scripts/release/`](../scripts/release/) own this repository's distribution
logic. Package manifests determine which workspaces are public and their
versions; Rolldown remains private.

## Release a version

Update the public package versions together, refresh the lockfile,
and merge the reviewed change. After ordinary CI succeeds for that
commit, push its matching `v<version>` tag. The workflow:

1. Waits for the latest main-push CI run for the exact tagged source commit
   and requires its success. The source need not remain the tip of main, and
   the passing run has no arbitrary age limit.
2. Builds and packs the public packages once, recording their source, names,
   versions, filenames, and byte digests in a candidate manifest. It retains
   the tarballs and manifest as a workflow artifact for 90 days. Downstream
   jobs download that upload's artifact ID and verify the manifest digest
   from the candidate job.
3. Installs, typechecks, and executes those candidate packages in both Node
   and Bun on Linux, macOS, and Windows. These checks consume the packed files;
   they do not substitute a fresh workspace build.
4. Publishes the candidate tarballs to npm using trusted publishing and
   provenance. A repository-wide queue serializes complete release workflows,
   including different version tags.
5. Downloads the published packages, verifies their bytes, `latest` tags, and
   signed provenance, and exercises a fresh Node consumer from the public
   registry. It then attaches the candidate assets and checksums to a draft
   GitHub Release and publishes it as an immutable release.

Regular CI retains real compiler/target execution and producer acceptance
jobs. Those establish platform behavior independently of npm publication.
The release's packed-consumer checks establish that the actual distributed
package layout, exports, dependencies, and runtime behavior work on the three
hosts. None of these checks proves every downstream application will work.

## Resume a partial publication

npm cannot publish several packages atomically. Before publishing a package,
the publisher reads its current registry state and compares npm's declared
integrity with the candidate. The verification job independently downloads
and hashes the published tarballs before the GitHub Release is published.

| Registry observation                         | Action                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| Version absent                               | Publish the candidate tarball.                          |
| Version present with matching integrity      | Skip that package.                                      |
| Version present with different integrity     | Stop; the version cannot be overwritten.                |
| Read failed or publication outcome uncertain | Stop and inspect or retry later; do not assume absence. |

Use **Re-run failed jobs** to resume with the successful candidate job's
retained artifact ID and digest. Re-running every job builds a new candidate;
it does not promise to reproduce the original tarballs. There is no expiring
readiness packet to refresh, and an unrelated commit on main does not require
a new release version. A lost publish response is resolved by observing npm,
with bounded visibility waits and a later rerun if the outcome remains unclear.

If a published package's integrity matches but `latest` points elsewhere or
is absent, the run stops with the observed state. A persistent mismatch requires an explicit
decision about the intended version and a tag repair or a new release.
Rerunning alone does not repair it, and the publisher never silently retags an
existing version.

Retain the original candidate whenever possible. If it is unavailable, a
rebuilt candidate must still match any packages already published at that
version. A successful repeat pack is evidence about that build, not a promise
that every future rebuild produces identical bytes. Conflicting rebuilt
bytes require a new version, not an overwrite or a bypass.

GitHub Release recovery also observes existing state. Matching draft assets
are retained and missing assets are uploaded; conflicting or unexpected
assets stop the run. An already published immutable release with the matching
asset set completes without replacing its assets.

## Credentials and hosted configuration

Build and consumer jobs have no npm publication credentials. The publication
job runs reviewed code from the tagged commit, uses the `npm` GitHub
environment, and receives `id-token: write` for npm trusted publishing. npm
and the registry provide the authentication and provenance protocol; this
repository does not implement its own OIDC exchange, archive trust parser, or
offline Sigstore trust tree.

`npm publish --dry-run` can succeed without credentials. Before any upload,
the publisher therefore requires both a successful dry run and npm 11.11.0's
successful OIDC exchange marker for every missing package. This checks the
current trusted-publisher bindings; it does not guarantee a later upload will
succeed. Actual publish results and registry observations determine progress.
A credential or registry failure can still leave a partial release.

Published provenance is authenticated with the maintained Sigstore verifier
bundled with pinned npm 11.11.0, using live trust roots and the expected GitHub
issuer and tag-workflow certificate identity. The policy check reads that
same verified bundle and requires the candidate's package identity, SHA-512
digest, source commit, release tag, repository, and workflow path. It does not
authenticate one response and inspect claims from a separate response. Trust
service or registry unavailability leaves verification incomplete and
retryable; it does not invalidate the retained candidate or require another
upload.

The tag workflow requires this one-time migration **after the workflow change
is merged**, before the first release through it:

- Change the `npm` environment's deployment policy from main to matching
  `v*` tags and remove required reviewers. Keep the environment because the
  npm trusted-publisher registrations bind to it and `release.yml`.
- Extend the tag ruleset's update/delete protection from its existing explicit
  version tags to `refs/tags/v*`. Only authorized release maintainers should
  create release tags; published tags must not be moved or deleted.
- Confirm the public packages' npm trusted publishers still name this
  repository, `release.yml`, and the `npm` environment.
- Keep GitHub Release immutability enabled; the final release check requires it.

These are repository/npm settings, not changes made by the implementation PR.
Changing the environment before merge would break the previous main-based
release workflow.

## Library artifacts and Apple scope

effect-build returns provider-native results. Explicit finalizers produce
durable file, tree, and executable identities. A downstream release system
can adopt those through the path-free `effect-build/artifact-adoption@1`
projection: logical name, byte identity, and digest. That downstream system
owns uploads, registry state, and any durable continuation of external
operations.

This repository publishes the `effect-build-apple` npm library. It does not
ship signed or notarized App, DMG, or PKG products. Apple unit tests and
credential-free native CI cover their stated mechanics; they do not prove
Developer ID signing, notarization service acceptance, stapling, or clean-host
Gatekeeper acceptance. A consumer shipping those products must exercise those
external boundaries. The retired certification scaffolding did not establish
them.

[Plan 045](../plans/045-establish-v060-release-point.md) and
[Plan 047](../plans/047-establish-canonical-operation-journal.md) preserve the
old certification and journal designs as historical records. Their commands,
receipt formats, and pending checklists are not part of the current workflow.

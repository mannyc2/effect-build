# Non-self-referential receipt archival

Date: 2026-08-18.
Status: **operations architecture selected; workflow authorization and implementation open**.

## Invariant

A source commit cannot contain the receipt that certifies itself. Use two authority phases:

```text
read-only certifier certifies immutable source S
  -> receipt artifact R names S
  -> separately authorized archiver verifies R
  -> append-only evidence commit A contains R about S
```

`A` is deliberately different from `S`. A release tag continues to target `S`; `A` is never
represented as certified source. Receipts never enter the default-branch source graph.

## Certifier

The certifier has `contents: read`, checks out exact `S`, and emits a deterministic aggregate
receipt containing at least:

- source SHA, workflow identity, run id, and attempt;
- expected-conclusion manifest and every actual conclusion;
- host and provider implementation observations;
- candidate byte identities where relevant; and
- assertion outcomes and terminal status.

GitHub artifacts are temporary transport. GitHub documents retention/deletion and exposes artifact
digest plus originating workflow metadata through its API:

- [Artifact retention and deletion](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts)
- [Actions artifacts REST API](https://docs.github.com/en/rest/actions/artifacts)

## Archiver

A separately approved archiver verifies:

1. GitHub API metadata identifies the allowlisted repository, workflow id/path, run id/attempt,
   permitted event/ref, and approved certifier workflow revision (or immutable-SHA-pinned reusable
   workflow); receipt content cannot self-assert this authority;
2. certification concluded successfully;
3. run `head_sha` equals `S`;
4. artifact workflow `head_sha` equals `S`;
5. API digest equals downloaded artifact bytes;
6. every inner receipt names `S`; and
7. for a **successful** release activation, every tag, Release, registry subject, and candidate byte
   identity is present and matching.

A terminal partial, failed, or unknown activation uses a different receipt schema. It records every
external subject as `absent`, `matching`, `mismatching`, or `unknown` and must never claim successful
activation.

Only then may it write deterministic attempt-specific paths such as:

```text
receipts/v1/certifications/<source-sha>/<run-id>-<attempt>.json
receipts/v1/releases/<version>/<run-id>-<attempt>.json
```

The selected orphan, receipt-only `evidence/receipts-v1` ref is append-only:

- absent path: create;
- same path and identical bytes: idempotent success;
- same path and different bytes: terminal conflict;
- update ref only by non-force fast-forward;
- after conflict or unknown network state, reobserve remote ref and path before retry; if a race
  advanced the ref while the deterministic path remains absent, create a new commit on the newly
  observed tip rather than retrying the stale commit object;
- never amend, delete, force-push, or blind-retry.

GitHub's refs API supports non-force updates, and rulesets can restrict update/delete/force-push
authority:

- [Git references REST API](https://docs.github.com/en/rest/git/refs)
- [Repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

## Security and loop boundary

Only the archiver receives `contents: write`. It runs trusted protected workflow and validator code,
never checks out or executes `S`, and treats the downloaded artifact as hostile data. It bounds
total bytes, file count, and member size; rejects absolute paths, `..`, symlinks/hardlinks,
duplicate names, unexpected members, and malformed/noncanonical JSON; and never derives commands or
destination paths from receipt content.

Do not use an automatic privileged `workflow_run` bridge for untrusted pull-request artifacts:
GitHub warns that `workflow_run` may gain write permission and secrets unavailable to the triggering
workflow.
Source: [workflow_run security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

The producer run itself is authenticated from GitHub API metadata, not from fields inside the
downloaded receipt. Reusable certifier workflows, if used, are pinned to an immutable commit SHA.
Sources: [Workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs) and
[Reusable workflow references](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

Events created with the repository `GITHUB_TOKEN` ordinarily do not create recursive workflow runs,
but the orphan ref and explicit evidence-branch exclusions are the rule; token suppression is only
defense in depth. Source:
[GITHUB_TOKEN event behavior](https://docs.github.com/en/actions/concepts/security/github_token).

Concurrency may reduce contention but is not the correctness mechanism; idempotency and non-force
ref advancement remain authoritative. Source:
[Actions concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency).

## Receipt classes

Candidate certification and release activation are separate receipts. A release receipt references
the candidate receipt digest and records post-publication observations. Terminal partial or unknown
release attempts are also archived when they changed or may have changed external state.

Product-facing provenance requested by a library user is a different API. It must not be conflated
with this repository's CI evidence retention.

## Remaining maintainer authority

The maintainer chooses which successful candidates merit durable archival and the identity allowed
to write the selected in-repository evidence ref. Moving evidence to a separate repository is a
future decision, not an implicit option. The recommended policy is in
`PRODUCT-DECISIONS-REMAINING.md` M5.

# Candidate evidence

Plan 044 creates one unpublished 0.4.0 candidate. Each of the five packages is
packed exactly once, recorded in a candidate manifest with its SHA-256 digest,
and exercised from those same bytes by fresh npm and Bun consumers.

Certification is fail-closed. It joins the exact source SHA, frozen surface and
migration digests, the historical freeze anchor, package export/declaration
conformance, once-packed manifest verification, and packed-consumer receipts.
The external Author-adapter check installs the packed core candidate instead of
a workspace copy and checks the duplicate-core rent/lifecycle behavior.

This boundary grants no publication authority. It does not publish to npm,
create a tag or GitHub release, merge a branch, activate a release branch, or
mutate trusted-publisher configuration.

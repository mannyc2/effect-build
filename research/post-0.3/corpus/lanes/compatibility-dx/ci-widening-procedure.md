# CI widening procedure

## Governing rule

A passing job adds an **exact observed CI point**. It does not automatically widen policy. Policy promotion is a separate reviewed maintainer decision with its own release implications.

## Candidate intake

1. Select an exact provider identity, including channel/revision and official acquisition digest.
2. State the operation/lane/host/target cell being investigated.
3. Link the upstream contract and any known holes.
4. Keep the candidate `unknown`; do not edit support ranges first.
5. Provision the tool explicitly outside the package manager when testing executable selection, or pin exact package integrity for in-process APIs.

## Required job structure

1. Checkout exact source SHA and record runner image/version.
2. Provision orchestrator separately from selected provider.
3. Verify acquisition checksum and selected absolute path.
4. Capture canonical selected-tool observation.
5. Run bounded capability and replacement probes.
6. Run operation fixture into staging.
7. Exercise adversarial cases: malformed input, interruption, target mismatch, cancellation/lifecycle, no destination mutation on preflight failure.
8. Run offline/no-install fixture with network denied where possible.
9. Run output verification: execution, syntax, manifest, target, or protocol checks as appropriate.
10. Run package peer, exact Effect endpoint, and profile protocol checks.
11. Upload a structured receipt even on expected incompatibility; redact paths and secrets.

## Matrix design

- Use dense exact points chosen for changelog/risk boundaries; never call two endpoints a range.
- Separate stable, LTS, RC, canary, and custom-build rings.
- Separate host API from selected command.
- Separate operations (`build`, `context`, `watch`, `compile`, `serve`, SEA assembly).
- Separate orchestrator runtime from selected executable.
- Separate target/host/libc/architecture cells where provider semantics differ.
- Run known-bad holes as negative tests so accidental admission fails CI.

## Promotion review

A maintainer reviews receipts and chooses one:

- add exact identity to tested-and-supported set;
- add exact identity only to evidence, leaving policy unchanged;
- establish/widen a range or predicate based on upstream contract plus sufficient dense evidence;
- add a known-bad hole;
- keep unknown;
- mark known incompatible.

Every range promotion records why interpolation is justified beyond endpoint success. Examples include an upstream compatibility contract, changelog audit, and dense interior tests. Documentation alone never establishes the initial commitment.

## Effect widening

For each exact Effect endpoint:

- pack all packages;
- install in a fresh consumer with strict peers;
- compile with supported TypeScript/compiler options;
- run declaration and runtime fixtures;
- inspect duplicate Effect identities;
- run every provider surface whose declarations mention Effect types;
- preserve endpoint integrity and graph receipt.

## CI failure interpretation

- Infrastructure failure: no compatibility result.
- Capability probe timeout: `unknown-and-capability-insufficient`.
- Expected known-hole negative fixture passes by rejecting: evidence for known incompatibility.
- Formatting/docs failure after a successful exact tool job does not erase that job's scoped execution, but the aggregate workflow is not a green release signal.
- A configured matrix cell without an executed successful job is not recorded execution.

## Cadence

- Stable providers: scheduled candidate reconnaissance plus release-triggered exact probes.
- Prerelease/canary: separate non-blocking observation ring; no auto-promotion.
- Security advisories: immediate hole review scoped to operation/host.
- Effect prereleases: exact endpoints selected by maintainer; no “latest” job as release evidence.

# Releases

Merging requires `bun run verify` (build, typecheck, typetests, unit
suites, packed-consumer proof, public-surface gate, lint, format).
Releasing requires the CI matrix: verify on ubuntu/macos/windows plus
real-tool integration lanes (bun everywhere; deno and Node SEA where
provisioned) and independent binary oracles for cross-target cells.

Publication is automated: when main is green and the lockstep package
version is not yet on npm, the release workflow publishes all five
packages with `npm publish --provenance`, producing verifiable SLSA
build attestation tied to the exact workflow run. There are no bespoke
receipts, certificates, or trust anchors — npm provenance is the
supply-chain story.

Version policy is plain 0.x semver with honest release notes in
[`CHANGELOG.md`](../CHANGELOG.md); breaking changes bump the minor
version and say what broke.

# Releases

Merging requires `bun run verify` (build, typecheck, typetests, unit and
package-boundary suites, a twelve-package packed-consumer proof, public-surface
gate, lint, format). The CI matrix repeats that gate on Ubuntu, macOS, and
Windows, then runs real compiler and selected producer lanes with independent
oracles. Credentialed Apple notarization, Developer ID signing, clean-host
Gatekeeper, and install/launch acceptance remain external evidence gates;
fake tools never satisfy them.

Publication is not a consequence of a green push. The release workflow is a
manual exact-commit dispatch, rejects a mismatched checkout, rebuilds and
packs all twelve lockstep packages, and requires the repository's npm
production environment before `npm publish --provenance`. Dispatching and
approving that environment are the explicit release authority. A normal CI
run only produces evidence and package data.

Version policy is plain 0.x semver with honest release notes in
[`CHANGELOG.md`](../CHANGELOG.md); breaking changes bump the minor
version and say what broke.

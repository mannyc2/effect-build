# Release boundary and evidence

The combined contract separates five states:

1. source implementation and local verification;
2. exact-head hosted CI and platform receipts;
3. credentialed or clean-host certification;
4. merge and tag/release authority;
5. registry publication and public availability.

None implies the next.

effect-build produces native results and explicitly finalized artifacts. A downstream release owner adopts a finalized file or tree using the path-free `effect-build/artifact-adoption@1` projection: logical name, byte identity, and digest. That downstream owner is responsible for release plans, durable mutation journals (including Apple notarization), continuation after interruption, upload/publication, and registry state.

Publishing this repository's own npm packages is a separate distribution concern, not an effect-build runtime capability and not a widening of ts-release's product-release authority. The release workflow verifies and packs the contract-admitted package set in a job without OIDC, then hands immutable tarballs by logical name and digest to a protected distribution job. That job executes no checked-out repository code, re-observes the exact main SHA and environment policy, compares the downloaded artifact archive to its upload digest, fetches the authoritative contract from that exact SHA, and may publish only the package names and target state admitted by that contract. Namespace placeholders remain non-architectural evidence; reservation-only names are rechecked before and after the admitted publication loop.

The local `verify` gate builds all workspace packages, including private Rolldown evidence, validates the combined contract and its exact 11-package/42-module public projection, runs type and lifecycle tests, packs only those public packages into a fresh consumer, and proves immutable-byte adoption and mutation rejection. Credentialed Apple operations, target execution, offline/cold-host acquisition, platform matrices, merge, tag, and npm publication require their own exact-head evidence or authority.

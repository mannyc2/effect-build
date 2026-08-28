# Release boundary and evidence

The combined contract separates five states:

1. source implementation and local verification;
2. exact-head hosted CI and platform receipts;
3. credentialed or clean-host certification;
4. merge and tag/release authority;
5. registry publication and public availability.

None implies the next.

effect-build produces native results and explicitly finalized artifacts. A downstream release owner adopts a finalized file or tree using the path-free `effect-build/artifact-adoption@1` projection: logical name, byte identity, and digest. That downstream owner is responsible for release plans, durable mutation journals (including Apple notarization), continuation after interruption, upload/publication, and registry state.

The local `verify` gate builds all workspace packages, including private Rolldown evidence, validates the combined contract and its exact 11-package/42-module public projection, runs type and lifecycle tests, packs only those public packages into a fresh consumer, and proves immutable-byte adoption and mutation rejection. Credentialed Apple operations, target execution, offline/cold-host acquisition, platform matrices, merge, tag, and npm publication require their own exact-head evidence or authority.

# effect-build documentation

The approved v0.5 target is
[`effect-build/v0.5-contract@1`](v0.5-contract.md). It is a target contract, not
a claim that every hard-cut or certification cell is complete. The Apple source
track is implemented locally; credential-backed and clean-host evidence remains
unearned.

| Document                                    | Covers                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| [v0.5 contract](v0.5-contract.md)           | Profiles, protocols, cutover, evidence, and release authority |
| [API](api.md)                               | Current candidate API and scheduled hard cut                  |
| [Architecture](architecture.md)             | Current mechanics and v0.5 target invariants                  |
| [Integrations](drivers.md)                  | Native lanes and portable-profile eligibility                 |
| [Apple distribution](apple-distribution.md) | Direct Developer ID API, lifecycle, and certification cells   |
| [Errors](errors.md)                         | Current errors and lifecycle boundaries                       |
| [Releases](release-security.md)             | Quarantine and fixed-seven target protocol                    |

Runnable candidate examples are under [`examples/`](../examples). The exact
current built surface is asserted against
[`tooling/public-api.json`](../tooling/public-api.json); the target subpaths and
deletions are frozen separately in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). `plans/` and
`research/` are historical and carry no authority over current work.

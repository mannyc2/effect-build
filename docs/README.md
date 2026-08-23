# effect-build documentation

The approved v0.5 target is
[`effect-build/v0.5-contract@1`](v0.5-contract.md). It is a target contract, not
a claim that the current candidate already implements the hard cut.

| Document                          | Covers                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| [v0.5 contract](v0.5-contract.md) | Profiles, protocols, cutover, evidence, and release authority |
| [API](api.md)                     | Current candidate API and scheduled hard cut                  |
| [Architecture](architecture.md)   | Current mechanics and v0.5 target invariants                  |
| [Integrations](drivers.md)        | Native lanes and portable-profile eligibility                 |
| [Errors](errors.md)               | Current errors and lifecycle boundaries                       |
| [Releases](release-security.md)   | Quarantine and fixed-seven target protocol                    |

Runnable candidate examples are under [`examples/`](../examples). The exact
current built surface is asserted against
[`tooling/public-api.json`](../tooling/public-api.json); the target subpaths and
deletions are frozen separately in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). `plans/` and
`research/` are historical and carry no authority over current work.

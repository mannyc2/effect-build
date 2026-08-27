# effect-build documentation

The canonical product scope is
[`effect-build/research-complete-contract@1`](research-complete-contract.md).
It accounts for every accepted finding and valid evidence gate. The hard-cut
candidate implements the selected surface, while certification remains a
separate receipt-backed authority. The older v0.5 contract is an implementation
and release-control snapshot, not a product-scope ceiling.

| Document                                                    | Covers                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [Research-complete contract](research-complete-contract.md) | Canonical operations, gates, ownership, and authority        |
| [v0.5 snapshot](v0.5-contract.md)                           | Existing profile and release-control implementation snapshot |
| [API](api.md)                                               | Research-complete hard-cut surface and provider lanes        |
| [Architecture](architecture.md)                             | Mechanics and architectural invariants                       |
| [Integrations](drivers.md)                                  | Native lanes and portable-profile eligibility                |
| [Apple distribution](apple-distribution.md)                 | Direct Developer ID API, lifecycle, and certification cells  |
| [Errors](errors.md)                                         | Role-owned failures, publication, and interruption           |
| [Releases](release-security.md)                             | Quarantine and fixed-six target protocol                     |

Runnable candidate examples are under [`examples/`](../examples). The exact
current built surface is asserted against
[`tooling/public-api.json`](../tooling/public-api.json); canonical scope,
target provider lanes, terminal dispositions, and semantic ownership are in
[`tooling/research-complete-contract.json`](../tooling/research-complete-contract.json).
`plans/` and `research/` remain provenance inputs to that generated canon.
Implementation status, executed certification, merge, and publication are
reported independently; none is inferred from another.

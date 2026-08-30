# effect-build documentation

The generated [`effect-build/combined-contract@1`](../tooling/effect-build-contract.json) is the scope authority. It records every provider operation and research finding, the six producer families, their visibility and finalization disposition, the public projection, and the boundary with a downstream release owner.

| Document                                | Covers                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| [API](api.md)                           | Public core, provider lanes, and producer packages            |
| [Architecture](architecture.md)         | Tool identity, lifecycle, and durable finalization invariants |
| [Drivers](drivers.md)                   | Provider-specific semantics and visibility                    |
| [Errors](errors.md)                     | Core finalization and provider-owned failures                 |
| [Release boundary](release-security.md) | Adoption, certification, and publication authority            |

[`tooling/public-api.json`](../tooling/public-api.json) is generated from built declarations and validated as a projection of the combined contract. It is not an independent product contract.

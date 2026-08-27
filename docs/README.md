# effect-build documentation

| Document                        | Covers                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| [API](api.md)                   | Twelve packages, subpaths, inputs, and finalized artifacts       |
| [Architecture](architecture.md) | The core kernel, producer ownership, credentials, and boundaries |
| [Integrations](drivers.md)      | Exact compiler, archive, package, signing, and SBOM toolchains   |
| [Errors](errors.md)             | Core/provider errors and interruption behavior                   |
| [Releases](release-security.md) | CI/evidence gates, explicit approval, provenance, version policy |

Runnable examples are under [`examples/`](../examples). The exact public
surface is asserted against [`tooling/public-api.json`](../tooling/public-api.json).
`plans/` records implementation sequencing. `research/` defines the launch
scope and required evidence for this hard cut; implementation is not complete
merely because a narrower local slice is green.

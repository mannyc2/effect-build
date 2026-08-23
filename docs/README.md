# effect-build documentation

| Document                        | Covers                                                |
| ------------------------------- | ----------------------------------------------------- |
| [API](api.md)                   | Packages, subpaths, inputs, and artifacts             |
| [Architecture](architecture.md) | The core kernel, provider ownership, and layer wiring |
| [Integrations](drivers.md)      | Bun, Deno, esbuild, Node SEA, and Rolldown specifics  |
| [Errors](errors.md)             | The error set and interruption behavior               |
| [Releases](release-security.md) | CI matrix, npm provenance, and version policy         |

Runnable examples are under [`examples/`](../examples). The exact public
surface is asserted against [`tooling/public-api.json`](../tooling/public-api.json).
`plans/` and `research/` are historical records of how the project got here;
they carry no authority over current work.

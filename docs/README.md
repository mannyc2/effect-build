# effect-build documentation

`effect-build` exposes exactly two operations through two compiler modules:
scalar `compileExecutable` and homogeneous-provider `compileExecutableMatrix`.

| Document                        | Covers                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| [API](api.md)                   | Public imports, inputs, Artifact, and typed errors             |
| [Architecture](architecture.md) | Ownership, lifecycle, atomic publication, and divergence notes |
| [Compiler modules](drivers.md)  | Bun and Deno targets, options, discovery, and Layer overrides  |
| [Errors](errors.md)             | Every tagged failure and its remedy                            |

Runnable installed-consumer examples are under [`examples/`](../examples).
Repository constraints are in [`AGENTS.md`](../AGENTS.md).

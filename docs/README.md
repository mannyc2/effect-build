# effect-build documentation

`effect-build` provides portable lifecycle, scoped integration-author
foundations, and schemas. `effect-build-bun`,
`effect-build-deno`, and `effect-build-node-sea` each expose exactly two operations: scalar
`compileExecutable` and homogeneous-provider `compileExecutableMatrix`.

| Document                         | Covers                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| [API](api.md)                    | Public imports, inputs, scoped bundles, Artifact, and typed errors |
| [Architecture](architecture.md)  | Ownership, lifecycle, atomic publication, and divergence notes     |
| [Compiler providers](drivers.md) | Bun, Deno, and Node SEA targets, options, and Layer overrides      |
| [Errors](errors.md)              | Every tagged failure and its remedy                                |

Runnable installed-consumer examples are under [`examples/`](../examples).
Repository constraints are in [`AGENTS.md`](../AGENTS.md).

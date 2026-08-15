# effect-build documentation

`effect-build` supplies provider-neutral lifecycle and narrow integration-author
contracts. Bun and Deno expose `compileExecutable` and
`compileExecutableMatrix`. Esbuild exposes `withJavaScriptBundle`; Node SEA
exposes `createExecutable`. Applications compose integrations explicitly.

| Document                        | Covers                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| [API](api.md)                   | Exact package imports, operation shapes, scoped bundles, and Artifacts |
| [Architecture](architecture.md) | Ownership, lifetime, composition, and atomic publication               |
| [Integrations](drivers.md)      | Bun, Deno, Esbuild, and Node SEA behavior                              |
| [Errors](errors.md)             | Separate tagged-error boundaries and interruption                      |

Runnable installed-consumer examples are under [`examples/`](../examples).
Repository constraints are in [`AGENTS.md`](../AGENTS.md).

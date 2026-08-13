# effect-build execution rules

- Keep exactly two public operations: scalar `compileExecutable` and homogeneous-provider `compileExecutableMatrix`.
- Select exactly one compiler package (`effect-build-bun` or `effect-build-deno`). There is no registry, fallback, raw argv, retry, or automatic installation.
- Keep package manager, orchestrator runtime, compiler, and artifact target independent. Applications provide one official Effect platform layer at composition time.
- Keep exactly three lockstep public packages: `effect-build`, `effect-build-bun`, and `effect-build-deno`. Providers depend one way on core.
- Shared lifecycle code owns sibling staging, scoped child processes, executable validation, optional hashing, and atomic replacement. Provider packages own discovery inputs, probing, target mapping, argv, and diagnostics.
- `effect-build/Provider.define` is the only provider-author SPI. It is closed to Bun and Deno and never exposes lifecycle or process capabilities.
- Library source uses Effect platform-neutral services. Do not import `node:*` or call `Effect.runPromise` under `packages/*/src/`.
- Preserve compiler CLI behavior for project configuration and environment unless a future public option explicitly changes it.
- Interruption closes the scope and terminates the compiler child. Do not translate interruption into a build error.
- Keep internal adapters and process capabilities package-private.
- Run `bun run verify` before handing off a complete implementation.

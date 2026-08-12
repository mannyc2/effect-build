# effect-build execution rules

- Keep one public operation: `compileExecutable`.
- Select exactly one compiler module (`effect-build/bun` or `effect-build/deno`). There is no registry, fallback, raw argv, retry, or automatic installation.
- Keep orchestrator runtime, compiler, and artifact target independent. Applications provide one official Effect platform layer at composition time.
- Shared lifecycle code owns sibling staging, scoped child processes, executable validation, optional hashing, and atomic replacement. Compiler adapters own discovery, probing, target mapping, argv, and diagnostics.
- Library source uses Effect platform-neutral services. Do not import `node:*` or call `Effect.runPromise` under `src/`.
- Preserve compiler CLI behavior for project configuration and environment unless a future public option explicitly changes it.
- Interruption closes the scope and terminates the compiler child. Do not translate interruption into a build error.
- Keep internal adapters and process capabilities package-private.
- Run `pnpm verify` before handing off a complete implementation.

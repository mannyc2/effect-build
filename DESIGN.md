# Design

effect-build binds native executables as ordinary Effect services over the portable platform spawner. It does not own
release graphs, registry retries, application restart policy, artifact records, or JavaScript build APIs.

## Decided

- A binding is a Context.Service whose make captures only the platform services it needs and resolves one executable.
  Method calls retain the caller's tracing and Scope context.
- Call arguments are TypeScript types; schemas describe actual configuration and tool-output decoding boundaries.
- ChildProcess.Command is the complete native request; no argv/options transport exists beside it.
- Runs drain one stdout reader and stderr concurrently with exit, then check the exit code.
- Streams acquire on consumption and finish only after output and checked exit; sessions use the caller's Scope.
- Errors have real tagged reasons and safe diagnostics, without argv, env, or stdout.
- Staging, native-header checks, digests, environment replacement, and layout validation are explicit opt-ins.
- Directory publication is per-file replacement and may leave a partial commit; cleanup cannot undo a committed rename.
- Digests use bounded incremental hashing until the native Crypto service supports incremental input.
- Methods use Effect.fn, streams Stream.withSpan, and sessions Effect.withSpanScoped; spans contain method names only.
- Tool names a native executable; the unrelated Effect AI subpath can be imported under an alias.
- JavaScript build APIs and archive/wheel file writers are outside the native tool boundary.
- Node SEA retains direct native --build-sea assembly as a binding; postject injection is removed.
- Notarytool uses its supported credential interfaces; Apple-ID passwords use native argv with Redacted diagnostics.
- Application watchdogs, paired persistent writers, restart, and delivery policy stay in the-show.

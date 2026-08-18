# Effect capability map

Exact coordinate: `effect@4.0.0-rc.108`, commit `bef7bf38ae4b73d5511043f707aed083de5da7cc`.

| Capability | Exact source | What Effect already guarantees | What effect-build must still own |
|---|---|---|---|
| ChildProcess.Command / Spawner / Handle | `packages/effect/src/unstable/process/ChildProcess.ts` | Selected argv, cwd/env/stdio, scoped process handle, typed platform failure, signals and streams | Provider request validation, binary/version relation, native diagnostic interpretation, output semantics |
| Scope | `packages/effect/src/Scope.ts` | Lifetime and finalizer ordering; interruption closes scope | Provider-specific cancel/kill/dispose protocol and publication point of no return |
| Stream / Sink | `Stream.ts`, `Sink.ts` | Backpressure-capable typed byte flow | Provider framing, event schemas, stderr/stdout meaning |
| FileSystem / Path | `FileSystem.ts`, `Path.ts` | Platform-neutral filesystem/path services | Borrowed vs durable outputs, staging topology, atomic replacement and provenance |
| Context / Layer | `Context.ts`, `Layer.ts` | Dependency construction and scoped acquisition | Whether a provider actually has reusable state worthy of a service |
| Cause / interruption | `Cause.ts`, `Effect.ts` | Failure, defect and interruption remain distinct | Finite provider errors; never translate interruption into a build error |
| Logger / Tracer | `Logger.ts`, `Tracer.ts` | Structured logs, spans and annotations | Native diagnostics preservation, redaction and provider metadata |

## Architectural consequence

[EFF-003 · UPSTREAM-DIRECT] Effect already supplies the generic process, scope, stream, filesystem, service, interruption and telemetry machinery. A public effect-build abstraction earns its existence only by adding provider-domain invariants: selected-tool identity, finite native failures, output ownership, target/runtime relations, or a real lifecycle state machine. Merely wrapping an Effect in a service adds compatibility rent without eliminating an invalid state.

## Shape rules

1. **Direct function:** pure construction or a one-shot operation whose authority arrives in the request/environment.
2. **Thin Effect function:** one-shot native call needing typed failure, interruption boundary, filesystem or tracing.
3. **Context service/Layer:** construction acquires reusable selected state, callbacks, caches, sockets or a long-lived engine.
4. **Scoped handle:** provider owns watch/rebuild/serve/process/context lifetime with an explicit finalizer.
5. **Selected command:** exact executable/cwd/env/project/process semantics are part of the product.
6. **Package-private adapter:** generic process, staging, publication, hashing, diagnostic conversion and tool discovery plumbing.

A long-lived `Compiler` service for a stateless command is not justified by Effect alone; conversely, an esbuild `BuildContext` should not be compressed into a one-shot function.

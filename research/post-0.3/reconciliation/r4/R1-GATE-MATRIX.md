# R3/R4 effect on the 29 R1 selected-candidate gates

Classification is conjunctive:

- `full-gate-closed` means every phrase in R1's `pre_freeze_gate` was executed
  against the selected provider operation at the pinned observation coordinate;
- `partially-informed` means an R3/R4 receipt executes a shared law or a strict
  subset, but the provider-operation conjunction remains open;
- `untouched` means these receipts add no operation-relevant execution.

Full gate closure is not a support-range or host-matrix admission. The R3 policy
tables contain no reviewed admission by default.

| Candidate | R1 pre-freeze gate | Classification | Exact R3/R4 effect and remaining conjunction |
|---|---|---|---|
| CAN-BUN-001 | GC/native backing lifetime and concurrency | untouched | No Bun Transpiler backing/GC/concurrency probe. |
| CAN-BUN-002 | provider work after Effect interruption | partially-informed | `esbuild-one-shot-interruption-law` establishes the Effect Promise boundary and one real provider continuation, but no Bun transpile execution occurred. |
| CAN-BUN-003 | non-interruptible execution boundary | untouched | No Bun synchronous transpile execution. |
| CAN-BUN-004 | latency and adversarial accuracy | untouched | No Bun scan fixture. |
| CAN-BUN-005 | adversarial accuracy boundary | untouched | No Bun scanImports fixture. |
| CAN-BUN-006 | cancellation and retained artifact lifetime | untouched | No Bun.build memory artifact retention or cancellation execution. |
| CAN-BUN-007 | partial writes; pre-existing outputs; interruption remnants | partially-informed | `executable-publication-laws` and `scoped-process-and-remnant-laws` establish the staged-vs-provider-direct distinction and durable partial remnants; Bun host-API direct write was not interrupted. |
| CAN-BUN-008 | collection bounds and signal outcome | partially-informed | `scoped-process-and-remnant-laws` executes Effect-owned signal/termination/reaping; Bun stdout collection and Bun exit/signal outcome remain untested. |
| CAN-BUN-009 | partial writes; replacement; signal remnants | partially-informed | R3 launch reauthentication rejects replacement and R4 executes generic partial/signal remnants; the Bun build command itself was not exercised. |
| CAN-BUN-010 | readiness; recovery; subtree termination; remnants | partially-informed | R4 executes Unix subtree termination and durable remnants; Bun watch readiness and failed-rebuild recovery remain open. |
| CAN-BUN-011 | target matrix; acquisition; interruption remnants | partially-informed | `executable-publication-laws` supplies the wrapper publication law only; Bun host-API compile target/acquisition/interruption cells remain open. |
| CAN-BUN-012 | target matrix; acquisition; interruption and publication certification | partially-informed | R3 has the exact selected-command compile identity/relation/reauthentication policy and R4 has publication/process laws; no Bun target/acquisition matrix was executed. |
| CAN-DENO-007 | collection bounds and diagnostics execution | untouched | No Deno transpile stdout/diagnostic execution. |
| CAN-DENO-008 | interruption and map remnants | partially-informed | R4 proves provider-direct remnants can survive scoped interruption, but no Deno transpile map operation was interrupted. |
| CAN-DENO-009 | declaration failure and topology | untouched | No Deno declaration fixture. |
| CAN-DENO-010 | host-target; cache/offline; denort relation; runtime | partially-informed | R3 has the exact selected-command compile policy and a mandatory Deno/denort relation; host-target execution, cache/offline states, and embedded runtime remain open. |
| CAN-ESB-001 | one-shot provider continuation after interruption | full-gate-closed | `r4-author-laws:esbuild-one-shot-interruption-law` interrupts the Effect fiber while a real esbuild 0.28.2 onLoad is blocked, then observes provider continuation, onEnd, and memory output after release. |
| CAN-ESB-002 | partial writes and interruption remnants | partially-informed | `scoped-process-and-remnant-laws` executes partial durable remnants, but not esbuild one-shot direct write. |
| CAN-ESB-003 | large-input temporary-file cleanup | untouched | No esbuild transform temporary-file fixture. |
| CAN-ESB-004 | runtime rendering receipt | untouched | No analyzeMetafile runtime rendering fixture. |
| CAN-ESB-005 | runtime rendering receipt | untouched | No formatMessages runtime rendering fixture. |
| CAN-ESB-011 | race matrix; post-dispose; delayed plugin cleanup | full-gate-closed | `r4-author-laws:esbuild-context-lifecycle-matrix` executes concurrent rebuild coalescing, cancel and dispose races, rebuild/watch/serve post-dispose refusal, dispose idempotency, and delayed onDispose cleanup. Dispose waits for an active build plugin but does not await async onDispose cleanup; that cleanup is observed finishing later. |
| CAN-ESB-012 | context races and mixed-generation remnants | partially-informed | The context race half is closed by the ESB-011 receipt; no write:true mixed-generation tree/remnant schedule was run. |
| CAN-ESB-015 | bounds; bin form; signal and reaping | partially-informed | R4 executes official Effect child termination/reaping; esbuild CLI bound and native-bin-vs-node-shim forms remain open. |
| CAN-ESB-016 | partial writes; bin form; signal and reaping | partially-informed | R4 executes generic partial remnants and Effect child reaping; esbuild CLI direct-write/bin-form execution remains open. |
| CAN-ESB-017 | termination choice; descendants; remnants | partially-informed | R4 executes signal/force-kill, Unix descendant termination, and remnants; esbuild watch stdin-vs-signal choice and watch-specific output remain open. |
| CAN-NODE-001 | exact binary capability; host-target and runtime matrix | partially-informed | R3 has the exact direct `--build-sea` builder/base identity with mandatory build-sea/LIEF capabilities and relation; no host-target/runtime matrix was executed. |
| CAN-NODE-002 | generator/base relations; cleanup and interruption | partially-informed | R3/R4 establish non-overridable participant relations, borrowed cleanup authority, and scoped child interruption, but no Node blob generator/base fixture ran. |
| CAN-NODE-003 | injector candidate; target matrix; lifecycle | partially-informed | R4 establishes private executable publication/lock/process laws, but R3 intentionally selects direct `--build-sea`, not a postject candidate; injector and target cells remain open. |

Totals: **2 full-gate-closed**, **17 partially-informed**, **10 untouched**.

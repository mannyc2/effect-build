# R6 Rolldown verdicts

Date: 2026-08-21.
Status: **executed freeze research; package and portable-profile candidates
deferred independently**.

## Provider-native package gate: defer

Rolldown 1.2.4 has a truthful provider-native candidate surface. Exact
execution establishes reusable acquisition, repeated generation after source
mutation, concurrent generation, release, and post-release rejection. The
package/native/host identity remains relational rather than version-only.

The lifecycle experiment also established an important boundary: two generate
calls can overlap, and `close()` can resolve while an already-started generate
continues. Calls begun after closure reject with `ALREADY_CLOSED`. Rolldown has
`Symbol.asyncDispose`, but the reusable build exposes no provider cancel or
dispose operation. An Effect wrapper must therefore gate new work, wait for
owned in-flight work before release completes, and never claim that upstream
`close()` itself cancels or joins active generation.

The 0.4 first-party package gate is not complete. There is no implemented
`effect-build-rolldown` package, five-host native/package coherence matrix,
packed external consumer, namespace/export gate, or publication/trusted-
publisher evidence. The package is deferred rather than added to the lockstep
train. This does not reject Rolldown as a provider or prevent a later plan from
rerunning the gate.

## Incremental Node-main profile gate: defer

The existing unchanged fixture shows esbuild and Rolldown both regenerate a
narrow in-memory main after source mutation. The corrected sealed-main probe
also accepts exact Rolldown output under the same consumer used for Bun and
esbuild at the executed coordinates.

Those facts do not prove an `IncrementalNodeMain` contract. The close/in-flight
race, complete import and external policy, repeated-output identity, resource
bounds, five-host cells, and independently packed adapters remain open. The
profile is therefore deferred independently of the provider-package verdict.

## Surface consequence

No `effect-build-rolldown` package and no Rolldown portable-profile export are
present in the 0.4 freeze. Rolldown stays in the research and compatibility
ledgers with explicit rerun gates; the five other first-party packages remain
the lockstep train.

# Architecture synthesis

## Governing decision rule

Architectural validity asks whether an abstraction has coherent laws, honest failures, clear ownership, truthful substitution, and fewer invalid states. Public compatibility asks whether the library is ready to maintain that contract. Product priority asks whether it belongs in the next release.

Existing adoption affects only the third question. A generic library must create the evidence for its product thesis through domain analysis, competing implementations, examples, and falsifiers; it cannot require users to exist before exposing the capability users would select it for.

## Candidate comparison

| Candidate | Strength | Dominant failure | Disposition |
|---|---|---|---|
| Provider-native only | Maximum fidelity and smallest common ontology | Applications cannot depend on real substitution roles without choosing a provider | Permanent canonical baseline; whether it is product-sufficient is a maintainer decision |
| Provider-native operations plus finite role capabilities and ordinary Effect composition | Preserves native fidelity while making only explicit, law-bound substitutions | Each role creates a compatibility commitment and must eliminate invalid states rather than list observations | **Recommended macro-architecture** |
| General transformation/build/executable algebra | Uniform graph and vocabulary | Admits meaningless provider/runtime/lifecycle combinations, recreates Effect composition, and pushes semantics into escape hatches | Reject |

## Target machine

```text
application
  ├─ chooses a provider-native operation when it needs provider semantics
  │    └─ provider owns request, validation, target mapping, diagnostics, and lifecycle
  │
  └─ chooses a finite role capability when it depends only on that role
       ├─ consumer/assembler publishes protocol and semantic capability requirements
       ├─ negotiation rejects incompatible roles before provider execution
       ├─ producer adapter either rejects or mints the role's opaque canonical value
       ├─ official Effect Scope/process/Stream primitives provide temporal mechanics
       ├─ proposed shared machinery must enforce borrowed or single-file durable ownership laws
       └─ ordinary Effect composition connects producer and consumer
```

There is no registry, provider fallback, hidden installation, automatic substitution, raw generic argv API, general build-plan interpreter, or retry of outcome-unknown mutations.

## Canon versus projections

The architecture needs one authoritative value per finite role, not peer representations kept in sync:

- provider request/result values remain authoritative inside provider modules;
- profile adapters project them into an opaque role value only after satisfying the profile law;
- provider metadata remains evidence, not semantic proof;
- files, paths, source maps, telemetry, and provenance are projections with distinct authority;
- durable artifacts begin only at a named commit boundary.

## Profile admission rule

A profile may be semantically approved before it has users, but not before its domain is explicit. `Semantically-proposed` requires at least two concrete candidate adapters and a falsification plan; it does not claim substitution. `Portable-demonstrated` requires at least two executed adapters passing the same fail-closed adversarial suite. Every profile specification must state:

- admitted requests and deliberately excluded states;
- canonical value and constructor authority;
- lifetime and commit semantics;
- normalized failures and preserved provider errors;
- application-visible substitution observations;
- provider-specific information retained outside the canon;
- at least two concrete candidate adapters and the plan by which the library will construct their proof;
- positive examples, adversarial cases, and falsifiers.

The lack of a second implemented adapter is not an adoption veto. It is a proof-construction task owned by the library. The adapter remains a trusted conformance boundary: an opaque or sealed value does not prove arbitrary JavaScript closure from final bytes.

## Corrected profile status

| Role | Synthesis status | Reason |
|---|---|---|
| Negotiated Node SEA main capability | `semantically-proposed` | Coherent narrowed law; current C2 value is too permissive and no complete current adapter matrix exists |
| Node executable assembly from that main | `semantically-proposed` | Node SEA domain is coherent; complete portable conformance and publication laws are not current-head evidence |
| Browser module payload | `semantically-proposed` | Stronger boundary than application/HTML role; Deno association/closure evidence remains unresolved |
| HTML module graph build | `semantically-proposed`, separate future role | Requires finite HTML language and provider-owned transform; current broad application claim is falsified |
| Incremental Node main | historical evidence only pending refreshed law | Scoped rebuild/generate is plausible, but its relation to the corrected Node canon must be redone |
| Runtime-neutral executable | `falsified` | Embedded Bun, Deno, and Node runtime identities are material |
| Portable typed command-watch events | `falsified` for human-output commands | No stable upstream machine protocol |
| Durable cross-platform output tree | `rejected` | No common atomic replacement/rollback law |
| Generic declaration set/rollup | prior candidates falsified; domain remains open | Different topology does not prove declarations can never have a narrower graph/package role |

## Minimal primitive set

The smallest presently defensible conceptual set is:

1. **Selected provider tool authority** — one selected locator and selection-time version/capability/compatibility observation; it constructs official Effect commands and owns no process abstraction.
2. **Borrowed output authority** — cleanup-root claim, containment, revocable observation, mutation/expiry semantics, and exact callback/Cause policy.
3. **Durable single-file publication** — same-parent staging, pre-commit validation, an explicit rename commit boundary with platform-specific replacement/durability limits, and an explicit post-commit outcome.
4. **Executable inspection** — native format/runtime/system observations layered on durable-file publication.
5. **Role-specific opaque capabilities** — e.g. a sealed Node SEA main or browser payload snapshot.

These are architectural concepts. Which become public `Author/*` APIs versus package-private shared machinery remains a compatibility decision. Publicity must be justified by third-party integration laws, not merely by internal reuse.

## What an authorized hard cut would delete

Semantically, the target removes:

- runtime-neutral executable requests;
- ambiguous `Compiler` or provider-neutral meanings layered around the provider-selected `compileExecutable` operation required by the governing workspace instruction;
- generic `withJavaScriptBundle` as the name for a Node main;
- public command/process duplication;
- a universal source-locator string;
- consumer inspection of provider metadata to decide whether a profile value is valid;
- optional bags containing chunks, assets, addons, imports, snapshots, and code cache for unrelated roles;
- generic typed watch events inferred from terminal text;
- implied multi-file transactions;
- a `Recipe` layer when ordinary Effect composition carries the whole law.

No production source reduction or source-line forecast is claimed; production implementation has not begun.

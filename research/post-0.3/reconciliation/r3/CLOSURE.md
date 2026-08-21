# R3 provider-owned compatibility closure

Status: **research-closed by executable receipt**. This report does not authorize
production exports or implementation.

## Closure result

The proof is a total evaluator over a complete provider observation, not a
shared range-matching language. Bun, Deno, esbuild, and Node SEA own finite
policy code in `r3-provider-policies.ts` for exactly Bun selected-command
compile, Deno selected-command compile, esbuild installed-API build-memory and
context-memory, and Node direct `--build-sea` assembly. The evaluator in
`r3-compatibility.ts` supplies only the decision vocabulary and fail-closed
ordering.

| Required question | Executable evidence | Receipt claim |
|---|---|---|
| Complete identities for all five selected operation/lane policies | `r3-provider-compatibility.test.ts`: “constructs complete identities…” | `r3-provider-compatibility:provider-owned-total-evaluator` |
| Operation, lane, host, and target holes | test: “fails exact … deny holes…” | `r3-provider-compatibility:provider-owned-total-evaluator` |
| Present, missing, and indeterminate capability | test: “separates present, missing, timeout…” | `r3-provider-compatibility:provider-owned-total-evaluator` |
| Node/Deno/esbuild participant relations | test: “blocks Node builder/base, Deno/denort…” | `r3-provider-compatibility:provider-owned-total-evaluator` |
| Peer and composed-profile checks | test: “checks provider/core peers…” | `r3-provider-compatibility:provider-owned-total-evaluator` |
| Selected-command replacement | test: “reauthenticates selected command…” | `r3-provider-compatibility:launch-reauthentication-and-cache-authority` |
| Cache authority | test: “cache key … sensitive to every authority component” | `r3-provider-compatibility:launch-reauthentication-and-cache-authority` |
| Exact `allowUntestedVersion` eligibility | test: “only pure policy uncertainty…” | `r3-provider-compatibility:exact-untested-override-eligibility` |

Every refusal carries exactly one provider owner, reason, operation coordinate,
and evaluation phase. `SupportUnknown` is the only refusal that advertises an
override. Missing capabilities, indeterminate probes, relation failures,
peer/profile failures, denied coordinate holes, incomplete identity, and launch
replacement remain blocked.

Observed CI evidence and reviewed admission are deliberately separate. A new
observation can populate evidence, but cannot add itself to the provider's
reviewed admission set. Cache keys include the observed content identities,
provider and policy revisions, operation/lane/host/target, capability schema,
capability results, relation inputs/results, and peer/profile inputs/results.
The retained v0.3 Bun 1.3.9 and Deno 2.9.3 compile receipt coordinates and the
newer Bun 1.3.14 / Deno 2.9.5 observations are diagnostic evidence only in
these research tables. No table contains a reviewed admission by default, and
the tests prove that an exact admitted identity does not admit a nearby version.

## Reproduction

```sh
bun test research/post-0.3/r3-provider-compatibility.test.ts
```

Expected result: 11 tests, 350 assertions, zero failures. The fail-closed
producer is `certify-r3-r4.mjs`; its three R3 claim tuples are listed exactly in
`expected-conclusions.json`.

No host-only gap remains for the evaluator itself: all policy decisions are
pure over authenticated observations. Obtaining those observations on each
supported host remains a provider certification responsibility, not an R3
compatibility-model ambiguity.

## R1 gate effect

- **Closed as an architecture/design gate:** R1's “minimum private
  identity/holes/capabilities/relations evaluator” now has executable provider
  tables, complete failure ownership, and exact override behavior. It is no
  longer an open evaluator-shape question.
- **Closed as a launch-boundary law:** PF-4's content reauthentication and
  same-length replacement case is executed against an actual atomically
  replaced file, then rejected by the evaluator.
- **Not closed per provider/support cell:** PF-4's dual-bin/symlink variants,
  every command provider's real selected path, PF-5 acquisition/offline, PF-8
  assembly cells, and PF-9 host matrix still require exact-coordinate receipts.
  The finite example tables prove the mechanism; they do not admit the entire
  operation canon.

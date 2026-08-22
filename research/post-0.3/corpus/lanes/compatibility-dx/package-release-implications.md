# Package and release implications

## Policy ownership and release unit

| Change | Primary owner | Expected release |
|---|---|---|
| add exact tested provider point within existing policy | provider package evidence bundle/docs | provider patch when shipped to users |
| widen/narrow provider operation policy | provider package | provider patch/minor according to public policy contract |
| add known-bad hole | provider package, urgent | patch/security release |
| change generic evaluator/state/error schema | core | core release; providers revalidate peers |
| widen provider/core peer range | provider package | provider release after packed-consumer tests |
| widen Effect peer range | every affected package | coordinated release after exact declaration/runtime endpoints |
| profile protocol major | profile/core and providers/adapters | coordinated major/minor according to pre-1.0 policy |
| add protocol adapter | owning package | release with exact two-way tests |
| change offline/no-install guarantee | core/provider contracts | documented release; breaking if guarantee weakens |
| upstream releases a new version | nobody automatically | no release until observation/policy decision |

## Independent provider cadence

The historical synthetic receipt demonstrates that a provider package can be independently versioned from core with a peer range. The inspected `0.3.0` workspace does not yet publish that cadence; providers use `workspace:^`. Independent cadence is therefore an architectural option, not current released fact.

To make it truthful:

- provider packages declare explicit core peers;
- profile protocol identities are explicit;
- packed consumers test all supported peer endpoints;
- core does not import provider implementation details;
- provider support policy and receipts ship with the provider package or a versioned policy artifact.

## Exact points versus policy

An exact CI point can be added without promising neighbors. A policy range is a product promise and may require a provider release even if runtime code does not change. A receipt-only update can be operational evidence, but users need a versioned artifact to know which policy their installed package applies.

## Prereleases

Bun canary, Deno RC/canary/LTS distinctions, and Effect beta/RC endpoints require separate policy. A general stable range must not accidentally include prereleases. Prerelease support should be exact or separately matched, produce warnings, and have a stated expiration/maintenance cadence.

## Security holes

A security hole can be narrower than the provider package's exposed surface. For example, the esbuild Windows serve advisory should not mark unrelated Linux bundle operations incompatible. Policy releases must encode host/operation predicates and avoid overbroad “esbuild unsupported” messaging.

## Core/protocol skew

Core npm peers and profile protocol versions solve different problems. A provider may load with a core according to npm but fail protocol negotiation. Do not widen peers as a substitute for protocol adapters, and do not bump protocol merely to encode a tool version.

## Recommended cadence implications — PROPOSAL

- Provider packages release when user-visible compatibility policy changes.
- Core releases when state composition, selection invariants, receipt schema, or public diagnostics change.
- Profile protocol changes follow their own version and migration schedule.
- Exact CI receipts are immutable artifacts tied to source SHA and need not force a release until policy changes.
- Offline asset manifests may be refreshed independently only if they are externally versioned and cryptographically bound to the provider policy; otherwise release the provider package.

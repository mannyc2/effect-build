# Portable-profile protocol compatibility state machine

## Scope

A portable profile is a semantic contract such as a `NodeMainProgram` or future browser output role. Its protocol identity is independent of npm package versions. Provider `0.7.0` and core `0.4.0` can be npm-peer compatible while disagreeing on profile protocol `@1` versus `@2`.

## Protocol identity — PROPOSAL

```text
ProtocolIdentity {
  namespace: "effect-build/profile"
  profile: string
  major: integer
  minor: integer
  featureBits: sorted string[]
  schemaDigest: sha256
  semanticInvariantsDigest: sha256
}
```

A schema digest alone is insufficient: two schemas can accept the same shape while assigning different lifecycle or artifact semantics. The semantic-invariants digest points to a versioned normative specification.

## States

| State | Meaning | Result |
|---|---|---|
| `protocol-exact-match` | required and provided identities/digests match | success |
| `protocol-backward-compatible` | core policy explicitly accepts provider minor/features and adapter proves required invariants | success with observation |
| `protocol-adapter-required` | a registered adapter can convert without erasing required semantics | preflight adapter selection, then re-evaluate |
| `protocol-feature-missing` | provider lacks a required feature bit/invariant | failure |
| `protocol-incompatible` | major or semantic invariant mismatch | required failure state |
| `protocol-identity-missing` | provider/profile does not report identity | failure for public portable-profile work |
| `protocol-adapter-ambiguous` | more than one adapter path exists without explicit authority | failure |

## Rules

- Never infer protocol compatibility from npm SemVer alone.
- Adapters are explicit package-private/public objects with their own identity and exact tests.
- A profile adapter cannot convert an opaque provider watch process into stable typed events unless it actually observes a stable provider protocol; historical receipts falsified such a machine-readable cross-provider watch protocol for the exercised Bun/Deno commands.
- Protocol validation happens before provider work and destination mutation.
- Tool-version override cannot override protocol failure.

## Migration policy

A protocol-major bump requires coordinated core/provider work or a tested adapter. A protocol-minor addition is compatible only when feature negotiation and defaults preserve old invariants. Deprecated protocol majors need an explicit support window; package peer ranges should not be used as a hidden migration mechanism.

## Current status

The inspected public `0.3.0` packages do not expose the proposed portable-profile protocol surface. Research prototypes are evidence/proposals only. Initial public profile identities and migration windows remain `UNKNOWN` maintainer decisions.

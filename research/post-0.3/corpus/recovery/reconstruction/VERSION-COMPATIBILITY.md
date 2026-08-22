# Version compatibility

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Recover a provider-owned, operation-specific compatibility model that is stricter than one exact version and more honest than accepting arbitrary untested versions.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Model

Compatibility belongs to a **provider package + lane + operation**, not to core and not merely to a tool name.

Each operation policy contains:

```text
operation identity
matrix-tested version set/range
provider-policy-supported range or disjoint set
known-incompatible predicates with reasons
required capability probes
relational requirements
strict default
explicit unknown-but-capable override behavior
```

> **Provenance:** `REMOTE-COMPILED` · observation · confidence **high** · compatibility evaluator/tests compiled and executed in successful runs at `9b0d2f59567a7684b62df932c67b7a96050b605f`


## Admission states

| State | Meaning | Default | Override |
|---|---|---|---|
| `matrix-tested` | Version was exercised in maintained CI for this operation/lane | Admit | Not needed |
| `policy-supported` | Version satisfies a complete supported range/set and capabilities, but may not be every matrix cell | Admit with exact observation | Not needed |
| `untested` | Version is outside supported policy but operation capability probes pass and no known incompatibility/relation fails | Reject | Explicit Layer-level `allowUntestedVersion` may admit with warning |
| `known-incompatible` | Version matches a documented regression/semantic break | Reject | Never |
| `missing-capability` | Required operation/API/flag is absent | Reject | Never |
| `relation-unsatisfied` | Cross-tool relation such as Node SEA builder/base equality fails | Reject | Never |
| `invalid-version` | Version cannot be parsed under provider policy | Reject | Never |

The override must emit a structured warning and record `untested-override` in tool/build-step observations. It cannot bypass output validation, cleanup, target inspection, protocol checks, or publication laws.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · compatibility-model receipt and compatibility law test at 9b0d


## SemVer requirements

Use a complete SemVer implementation rather than handwritten lexical or dotted-number comparison.

Required behavior:

- exact versions and complete ranges;
- unions/disjoint support such as `>=1.3.9 <1.4.0 || >=1.4.2 <1.5.0`;
- prerelease semantics consistent with SemVer range rules;
- build metadata handling;
- explicit known-incompatible holes;
- provider-specific non-SemVer predicates only when upstream versioning requires them;
- serialization/display of the exact policy admitted by the package release.

The branch's late handwritten prototype stripped prerelease details and included simplified comparators. It was useful as a contract probe, not sufficient as release compatibility machinery.

> **Provenance:** `REPOSITORY-DOCUMENTED` · observation · confidence **medium** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/compatibility.ts


> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · npm semver source listed in evidence/UPSTREAM-SOURCES.md


## Boundary evidence versus supported ranges

Exercising oldest and newest points demonstrates those points, not every intervening version. A continuous range is a provider-maintainer policy supported by:

1. upstream compatibility/release information;
2. capability probes;
3. a maintained oldest/current/newest matrix;
4. known-incompatibility holes;
5. issue/incident updates;
6. an explicit provider release that owns the widened range.

Therefore the branch's exercised points are recorded as exact evidence:

| Lane/operation family | Exercised observations | What may be claimed now |
|---|---|---|
| Bun command | 1.3.9 and 1.3.14-era research | Those exercised points and claims in receipts; not an automatically continuous range |
| Bun host API | 1.3.9 and 1.3.14 host-shape probes | Those API shapes at those points |
| Deno command/API | 2.9.3 and 2.9.5 probes | Versioned behavior at those points; current upstream contract must be refreshed |
| Esbuild API | 0.28.1 and 0.28.2 probes | Those points; a package policy may define a range after maintained CI |
| Node SEA | matching 25.5.0 and 26.7.0; one mismatched 26-builder/25-base case | Same-version exercised success; mismatch rejection policy |

## Relational compatibility: Node SEA

Current Node SEA documentation states that the Node binary used to create the blob must match the binary into which the blob is injected. The branch independently observed that a Node 26.7 builder accepted a Node 25.5 base yet produced a non-running executable. Equality is therefore a non-overridable relation, not merely a warning.

```text
builder.version == base.version
```

The builder executable and base executable should both be observed by identity/digest where practical, not inferred from a requested version string.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · node-sea-relations receipt at 9b0d


> **Provenance:** `OFFICIAL-UPSTREAM-CONTRACT` · observation · confidence **high** · Node 26.1 SEA documentation listed in evidence/UPSTREAM-SOURCES.md


## Provider-specific policy and release cadence

Core should define common vocabulary/evaluation only. Each provider package owns:

- its exact operations and lanes;
- version detection;
- capability probes;
- tested/policy ranges and incompatibilities;
- declaration compatibility;
- warning remediation;
- CI matrix and release cadence.

This allows an Esbuild-only compatibility widening without forcing Bun/Deno/Node SEA releases. Provider packages should declare bounded peer ranges on core, while profile protocol strings remain the runtime contract.

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · independent-versioning receipt: compatible core accepted and incompatible core rejected by bounded peer range


## Developer experience

A rejection should report:

- provider package, lane, operation;
- selected host/package/command identity;
- observed version;
- tested matrix policy and provider-supported policy;
- known incompatibility or missing capability details;
- relational observations;
- exact remediation: select supported version or enable explicit untested override.

No error should suggest an override when the failure is known-incompatible, missing-capability, invalid-version, relation-unsatisfied, protocol-incompatible, or output-invalid.

## CI maintenance design

For every supported provider operation:

1. **Oldest supported** cell.
2. **Newest supported/current** cell.
3. **Prerelease** cell when provider policy intends prerelease support.
4. **Known-incompatible** negative cell.
5. **Unknown-but-capable override** cell.
6. **Missing capability** negative probe.
7. **Relational** negative cells where applicable.
8. Provider declaration import/type-check at each supported endpoint.
9. Real operation behavior and cleanup/publication tests.
10. Receipt records containing exact versions, source SHA, policy, observations, and conclusions.

A provider release may widen policy only after the matrix and corresponding receipts pass at the exact source SHA.

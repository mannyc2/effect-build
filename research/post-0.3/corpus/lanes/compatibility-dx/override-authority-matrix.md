# Override authority matrix

## Principle

An override is user authority over **untested policy uncertainty**, not authority to erase known facts or required invariants. The only proposed compatibility override transforms:

```text
unknown-but-required-capabilities-present
  -> explicit-untested-override
```

It does not transform any other required state.

## Stable override observation

```text
UntestedOverride@1 {
  overrideId
  createdBy: user | application-owner | CI-policy-owner
  createdAt
  scope {
    provider, operation, lane, hostPredicate, targetPredicate?
  }
  selectedObservationId
  executableSha256 / packageIntegrity
  providerVersionIdentity
  capabilityProbeSchemaDigest
  requiredCapabilitiesDigest
  relationsDigest
  providerCoreGraphDigest
  effectObservationDigest
  protocolObservationDigest
  policyId
  policyRevision
  expiresAt? / maxPolicyRevision?
  rationale
}
```

A path, version string, or environment variable such as `ALLOW_UNSUPPORTED=1` is not a stable override.

## Matrix

| State | Override available? | Authority | Reason |
|---|---:|---|---|
| `exactly-tested-and-supported` | no need | maintainer policy/evidence | already admitted |
| `policy-supported-but-not-this-CI-point` | no need | maintainer policy | already admitted, warning only |
| `unknown-but-required-capabilities-present` | **yes** | user/application/CI owner | uncertainty remains after positive bounded probes |
| `unknown-and-capability-insufficient` | no | — | absence of evidence; override would blind admission |
| `known-incompatible` | no | — | explicit contrary evidence/policy |
| `missing-required-capability` | no | — | operation cannot satisfy required contract |
| `relational-requirement-unsatisfied` | no | — | multi-party invariant fails |
| `protocol-incompatible` | no | — | semantic contract mismatch |
| `tool-not-found` | no | — | no selected tool exists |
| `tool-selection-ambiguous` | no | — | authority is explicit selection, not compatibility override |
| `selected-binary-changed` | no | — | observation no longer identifies launched bytes |
| provider/core peer failure | no | — | package graph invariant |
| Effect declaration/runtime failure | no | — | library/runtime invariant |
| offline asset missing | no | — | required material unavailable |

## Precedence and persistence

1. Explicit executable selection has priority over PATH discovery.
2. Project-local override lock has priority over user-global policy, because it is reviewable with the project.
3. CI may require a separately signed/approved override record.
4. An override must stop matching when executable/package integrity, capability schema, required relations, Effect/protocol graph, or policy revision changes.
5. Overrides are read only; they cannot trigger installation or policy refresh.

## Recommended UX

```text
effect-build compatibility inspect --provider bun --operation compile-executable --executable /abs/path
# prints immutable observation ID and eligible remediation

effect-build compatibility override create   --observation sha256:...   --scope project   --reason "validated in internal fixture EB-421"
```

The command names are illustrative, not an implementation commitment. A library API must accept the same structured object and return a stable warning.

## Audit behavior

An active override is always observable in structured logs and artifact receipts. Metrics label only `override_active=true`; the rationale and identity remain in low-cardinality logs/receipts with path redaction. A successful build under override must not be counted as an exact supported CI point.

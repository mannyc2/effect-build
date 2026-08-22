# Compatibility policy candidates

## Evaluation criteria

A candidate must represent non-contiguous sets, holes, provider-specific version identities, prereleases/channels, API/command asymmetry, capabilities with known semantic incompatibility, absent/indeterminate capabilities, explicit unknown-version authority, relations, explicit/ambiguous selection, offline/no-install behavior, multiple installed versions, executable replacement, provider/core peer skew, profile protocol skew, exact Effect endpoints, and a decision before destination mutation.

## Candidate A — exact tested-version allowlist

### State model

```text
Key = provider + operation + lane + host + exactVersionString
Decision = key in testedSet ? supported : unsupported
```

### Strengths

- Conservative and easy to explain.
- Every success can point to an exact execution.
- No accidental range interpolation.

### Falsifiers

- Deno stable and LTS can share `2.9.3`; exact version string is not exact identity.
- Bun canary needs revision/digest.
- Node SEA compatibility is relational; `26.7.0` alone is insufficient.
- esbuild context and CLI have different lifecycle capabilities at the same version.
- It cannot represent policy-supported-but-not-this-CI-point without redefining the allowlist as policy rather than test evidence.
- It cannot distinguish tool-not-found, ambiguity, missing capability, protocol skew, or peer skew.
- It creates a release bottleneck for every new patch even when maintainers intentionally adopt a broader policy.

**Disposition: FALSIFIED as a complete model.** Exact sets remain a valid matcher and evidence set inside the hybrid model.

## Candidate B — contiguous version range

### State model

```text
Key = provider + operation
Decision = minVersion <= selectedVersion < maxVersion
```

### Strengths

- Familiar npm-like UX.
- Compact policy and low maintenance when an upstream line is truly compatible.

### Falsifiers

- Two passing endpoints do not prove interior points.
- Known-bad holes require subtraction, turning the model into a non-contiguous set.
- SemVer build metadata cannot identify Bun revisions; Deno channels are not encoded by a bare version.
- npm prerelease matching is tuple-specific and cannot be approximated by numeric comparison.
- API/command asymmetry and host-specific security holes require more keys and predicates.
- SEA equality cannot be expressed as a unary version range.

**Disposition: FALSIFIED.** Proper SemVer ranges may be one reviewed matcher in a hybrid policy, never inferred from endpoint tests.

## Candidate C — capability-first probing

### State model

```text
Decision = every required capability probe returns present
```

### Strengths

- Handles custom builds and future versions.
- Aligns the decision with the requested operation.
- Can discover API/command asymmetry.

### Falsifiers

- A flag/function may exist with known broken semantics.
- Help text can advertise a feature that fails for a target or relation.
- Capability presence does not establish package peers, Effect declarations/runtime, protocol identity, or SEA equality.
- Probe failure, timeout, and explicit absence have different epistemic meanings.
- A binary can be replaced after probing.
- An unknown-but-capable version still lacks maintainer support policy; capability presence cannot silently convert unknown into supported.

**Disposition: FALSIFIED as the admission policy.** Bounded capabilities remain prerequisites and evidence inside the hybrid model.

## Candidate D — hybrid provider/operation policy

### State model

```text
OperationKey = provider + operation + lane + host/target predicate
Identity = provider-specific parsed identity + canonical binary/package identity
Evidence = exact observed CI/receipt points
Policy = exact sets | SemVer ranges | opaque predicates | holes
Prerequisites = bounded capabilities
Relations = predicates over multiple observations
Composition = tool policy × package peers × Effect × profile protocol × relations
Authority = optional stable override for unknown-but-capable only
```

### Decision precedence

1. selection failures and binary replacement;
2. known incompatibility and holes;
3. explicit missing capabilities;
4. indeterminate/insufficient capability observation;
5. relational failure;
6. provider/core peer, Effect, and protocol failures;
7. exact tested and policy-supported successes;
8. unknown-but-capable, optionally transformed into explicit-untested-override.

### Why this candidate survives

- Non-contiguous support is a union of matchers; holes are explicit exclusions evaluated first.
- Provider identities are sum types, so Deno channel and Bun revision survive parsing.
- Capabilities are operation/lane-specific and cannot overrule known incompatibility.
- Relations quantify over named observations.
- Evidence and policy are separate, preserving exact CI strength.
- Explicit executable selection, candidate enumeration, digesting, and re-observation represent multiple versions and replacement.
- npm peers, Effect, and protocol machines remain independent.
- Override authority is narrow and durable.

### Cost

- More schema and diagnostics.
- Requires policy revisioning and owner discipline.
- Needs dense CI and receipt tooling.
- Some providers cannot fully eliminate TOCTOU without OS-specific execution-by-handle support.

**Disposition: PROPOSAL retained provisionally.** It is the smallest candidate tested here that survives all required falsifiers. Initial support ranges and public operation cells remain `UNKNOWN` until the missing provider breadth inventory and exact widening executions are available.

## Adversarial comparison table

| Falsifier | A exact list | B range | C capabilities | D hybrid |
|---|---:|---:|---:|---:|
| non-contiguous support | partial | no | n/a | yes |
| known-bad holes | only as separate deny list | no | no | yes |
| Deno channel identity | no | no | partial | yes |
| prerelease ordering | exact only | only with full SemVer engine | no | yes |
| API/command asymmetry | only with expanded key | only with expanded key | yes | yes |
| capability present, semantics bad | deny list needed | deny list needed | no | yes |
| unknown-but-capable override | no | no | silently admits | yes |
| SEA equality | no | no | partial | yes |
| explicit/ambiguous selection | outside model | outside model | outside model | yes |
| changed bytes | outside model | outside model | outside model | yes |
| provider/core peers | outside model | outside model | outside model | composed |
| protocol skew | outside model | outside model | outside model | composed |
| exact Effect endpoints | exact only | range conflates | outside model | composed |
| pre-mutation decision | possible | possible | possible | required |

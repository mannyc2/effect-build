# Typed error and warning taxonomy

## Diagnostic envelope — PROPOSAL

```text
CompatibilityDiagnostic {
  code: stable machine code
  severity: error | warning
  state
  message: concise human summary
  provider?
  operation?
  lane?
  observationId?
  policyId?
  policyRevision?
  evidenceClass?
  why: structured fields, not only prose
  remediation[]: typed actions
  override: unavailable | eligible | active
  providerWorkBegan: boolean
  destinationMutationOccurred: boolean
  traceId?
}
```

Messages may improve without breaking automation. Callers branch on `code` and `state`.

## Errors

| Code | State / meaning | Required structured fields | Permitted remediation | Override |
|---|---|---|---|---|
| `EFFECT_BUILD_TOOL_NOT_FOUND` | `tool-not-found` | requested selector, redacted search roots, executable name | install/select externally; provide absolute path | no |
| `EFFECT_BUILD_TOOL_SELECTION_AMBIGUOUS` | `tool-selection-ambiguous` | candidate count and redacted candidate tokens/provenance | select one explicit executable | no |
| `EFFECT_BUILD_TOOL_IDENTITY_UNPARSEABLE` | identity grammar failed | raw output digest, grammar revision | select known build; add provider parser policy | only if opaque exact identity can still be observed and capabilities complete; otherwise no |
| `EFFECT_BUILD_TOOL_VERSION_KNOWN_INCOMPATIBLE` | `known-incompatible` | matched exclusion id, operation/host predicate, source | choose non-matching identity; change operation | no |
| `EFFECT_BUILD_TOOL_VERSION_UNKNOWN` | `unknown-but-required-capabilities-present` without authority | exact observation and policy revision | use tested/policy version or create explicit stable override | eligible |
| `EFFECT_BUILD_REQUIRED_CAPABILITY_MISSING` | `missing-required-capability` | capability id, positive absence probe | choose capable tool/lane | no |
| `EFFECT_BUILD_CAPABILITY_PROBE_FAILED` | `unknown-and-capability-insufficient` | probe id, exit class, bounded output digests | fix executable/environment; run exact CI probe | no |
| `EFFECT_BUILD_CAPABILITY_PROBE_TIMED_OUT` | `unknown-and-capability-insufficient` | probe id, timeout, termination result | fix hung tool; adjust reviewed probe spec | no |
| `EFFECT_BUILD_RELATION_UNSATISFIED` | `relational-requirement-unsatisfied` | relation id, participant observation ids, expected/observed | select matching participants/change flags | no |
| `EFFECT_BUILD_SELECTED_BINARY_CHANGED` | `selected-binary-changed` | before/after digest and file-identity tokens | restart selection/preflight | no |
| `EFFECT_BUILD_PROVIDER_CORE_PEER_INCOMPATIBLE` | peer range failure | provider/core instances and authored range | align packages/publish corrected range | no |
| `EFFECT_BUILD_PROVIDER_CORE_PEER_MISSING` | peer missing | provider instance, missing peer | install compatible core | no |
| `EFFECT_BUILD_EFFECT_DECLARATION_INCOMPATIBLE` | declaration endpoint failed | Effect/TS versions, declaration receipt id | select tested Effect endpoint | no |
| `EFFECT_BUILD_EFFECT_RUNTIME_INCOMPATIBLE` | runtime endpoint failed | exact runtime identity and fixture | select tested Effect endpoint | no |
| `EFFECT_BUILD_EFFECT_DECLARATION_RUNTIME_SKEW` | declaration/runtime differ | both identities and graph path tokens | dedupe/align graph | no |
| `EFFECT_BUILD_EFFECT_MULTIPLE_RUNTIMES` | duplicate runtime identities | runtime identity tokens/count | dedupe package graph | no |
| `EFFECT_BUILD_PROFILE_PROTOCOL_INCOMPATIBLE` | `protocol-incompatible` | required/provided protocol identities | upgrade/downgrade or select tested adapter | no |
| `EFFECT_BUILD_PROFILE_PROTOCOL_MISSING` | protocol identity absent | provider/profile | use provider implementing protocol | no |
| `EFFECT_BUILD_OFFLINE_ASSET_UNAVAILABLE` | required cached asset missing | asset type/version/target/cache token | pre-provision asset outside run | no |
| `EFFECT_BUILD_OFFLINE_NETWORK_ATTEMPT` | provider attempted network under offline policy | provider process event, destination class (redacted) | pre-cache dependencies/assets; fix flags | no |
| `EFFECT_BUILD_NO_INSTALL_INVARIANT_VIOLATION` | effect-build attempted install/substitution | attempted action | report defect; use compliant release | no |
| `EFFECT_BUILD_DESTINATION_PREFLIGHT_FAILED` | destination invalid before provider work | destination token, failed invariant | fix destination/permissions | no |
| `EFFECT_BUILD_PREFLIGHT_INTERNAL_DEFECT` | evaluator defect, not compatibility result | cause digest, trace id | report defect | no |

## Warnings

| Code | When emitted | Required fields |
|---|---|---|
| `EFFECT_BUILD_TOOL_POLICY_SUPPORTED_NOT_CI_POINT` | policy success without exact receipt | identity, policy revision, nearest/representative evidence ids without implying interpolation |
| `EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE` | stable override active | override id, observation id, scope, expiry/policy revision |
| `EFFECT_BUILD_PRERELEASE_SELECTED` | SemVer prerelease/RC/canary selected | provider-specific prerelease/channel identity |
| `EFFECT_BUILD_UPSTREAM_EXPERIMENTAL_OPERATION` | upstream marks operation experimental | source id and operation |
| `EFFECT_BUILD_WEAK_BINARY_IDENTITY` | digest/stat identity unavailable or partial | missing identity components and TOCTOU impact |
| `EFFECT_BUILD_PROBE_TOCTOU_RISK` | path-based launch after hash | observation/recheck generation, launch mode |
| `EFFECT_BUILD_ROOT_PACKAGE_OVERRIDE_ACTIVE` | npm root override/extensions changed graph | override digest and affected package names |
| `EFFECT_BUILD_OFFLINE_PROVIDER_ACQUISITION_POSSIBLE` | operation may acquire assets unless pre-cached | declared asset types and enforcing flags |
| `EFFECT_BUILD_POLICY_STALE` | policy revision older than bundled source/expiry | policy id/revision/age; never auto-update during build |

## Message examples

Good:

> `EFFECT_BUILD_RELATION_UNSATISFIED`: Node SEA builder `26.7.0` cannot use base `25.5.0`; relation `node-sea.builder-base-version-equality@1` requires equality. No provider process was started and the destination was not created.

Bad:

> Unsupported version.

Every failure states whether provider work began and whether destination mutation occurred. Preflight compatibility failures should report `false/false`.

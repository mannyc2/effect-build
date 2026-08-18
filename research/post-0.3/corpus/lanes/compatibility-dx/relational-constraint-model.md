# Relational compatibility model

## Purpose

Unary tool admission is insufficient whenever compatibility depends on two or more selected observations. Relations are named, typed predicates evaluated after every participant has been selected and observed but before provider work.

## Model — PROPOSAL

```text
RelationalRequirement {
  id
  revision
  participants: NonEmptyArray<ParticipantRef>
  predicate: declarative expression or registered pure evaluator
  failureCode
  evidenceSource
  remediationTemplate
  sensitivity
}

ParticipantRef =
  | selectedTool(name)
  | packageInstance(name)
  | host
  | target
  | asset(name)
  | protocol(name)
  | effectEndpoint(kind)
```

The evaluator receives immutable observations. It must be pure, bounded, and deterministic. A relation cannot run a provider build to discover compatibility; execution-dependent relations remain `UNKNOWN` until a dedicated CI probe produces policy evidence.

## Required relation classes

### Node SEA builder/base equality

```text
nodeSea.builder.version == nodeSea.base.version
```

**UPSTREAM-DIRECT:** Node requires the blob-producing binary version to equal the binary receiving it.  
**RECORDED-EXECUTION:** `25.5.0==25.5.0` and `26.7.0==26.7.0` passed; `26.7.0!=25.5.0` built but the output failed execution.

The relation should also compare target compatibility and, under strongest policy, official distribution/source identity. It is non-overrideable.

### Node SEA snapshot/code-cache host relation

```text
crossPlatform == false || (useSnapshot == false && useCodeCache == false)
```

Documented by Node. Failure is known incompatible before work.

### esbuild package/API/native binary coherence

```text
package.version == api.version
AND nativeBinary.version == api.version when a native binary is used
AND platform package matches host
```

A custom native binary with a different version is provider/core skew, not merely an unknown tool.

### Deno/denort relation

```text
denort.version == deno.version
AND denort.target == requestedTarget
AND denort.channel/source policy satisfies provider requirement
```

The exact metadata available from `denort` requires an execution probe. If it cannot be established offline, fail `unknown-and-capability-insufficient` or `offline-asset-unavailable`; do not download silently.

### Provider/core peer relation

```text
resolvedCore.version satisfies provider.manifest.peerDependencies["effect-build"]
```

Evaluated by the npm peer machine using the actual resolved graph.

### Effect platform package relation

```text
platformPackage.effectRuntimeInstance == application.effectRuntimeInstance
```

This protects Context/service identity from duplicate Effect runtimes.

### Profile protocol relation

```text
provider.profileProtocol satisfies core.requiredProfileProtocol
```

Delegated to the protocol machine; independent of npm versions.

### Executable replacement relation

```text
preWorkObservation.executableIdentity == probedObservation.executableIdentity
```

Includes digest and available file identity, not path alone.

## Result

```text
RelationResult =
  | Satisfied { requirementId, participantObservationIds }
  | Unsatisfied { requirementId, expected, observed, remediation }
  | Indeterminate { requirementId, missingObservation, probeRequired }
```

`Unsatisfied` maps to `relational-requirement-unsatisfied`. `Indeterminate` maps to `unknown-and-capability-insufficient`, not to a warning.

## Override rule

No generic untested-version override applies to a failed or indeterminate required relation. A maintainer may revise the relation policy after new direct evidence, but that is a package/policy release, not per-run user authority.

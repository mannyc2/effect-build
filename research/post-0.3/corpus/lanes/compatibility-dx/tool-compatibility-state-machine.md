# Selected-tool and operation compatibility state machine

## Scope

This machine answers only: **may this exact selected tool identity perform this exact operation/lane on this host/target under policy revision P?** It does not answer npm peer, Effect, portable-profile protocol, or multi-tool relational compatibility; those machines compose later.

## Canonical selected-tool observation — PROPOSAL

```text
SelectedToolObservation@1 {
  observationId: sha256(canonical CBOR/JSON payload)
  observedAt
  provider
  operation
  lane
  host { os, arch, libc?, kernelClass?, runtimeHost? }
  target?

  selection {
    request: explicitPath | configKey | packageResolution | pathSearch | hostProcess
    requestedValueRedacted?
    candidates[] { provenance, canonicalPathToken, order }
    chosenCandidate
    ambiguityPolicy
  }

  executable? {
    canonicalPathToken
    realPathToken
    fileIdentity { device?, inode?, volumeSerial?, fileIndex? }
    size
    mtimeNs?
    modeClass
    sha256
  }

  packageIdentity? {
    name, version, integrity?, resolvedLocationToken
  }

  reportedIdentity {
    rawVersionOutputDigest
    rawVersionOutputTruncated?
    providerVersionIdentity
  }

  capabilities[] {
    capabilityId
    result: present | absent | indeterminate
    probeId
    probeSchema
    durationMs
    exitClass
    stdoutDigest?
    stderrDigest?
  }

  policy { policyId, revision, operationKey }
  probeEnvironmentDigest
  replacementCheckGeneration
}
```

Paths are tokenized/redacted by default; durable receipts may contain encrypted or explicitly opted-in full paths. The full executable digest is not a metric label.

## Binary identity and replacement caveat

A canonical path is not immutable. Symlinks can retarget, an installer can replace bytes in place, and a shim can route by working directory. Preflight must:

1. canonicalize and hash the chosen executable;
2. run identity/capability probes against that exact path;
3. re-stat and re-hash after probes;
4. re-stat and re-hash immediately before provider work;
5. fail `selected-binary-changed` if identity differs.

This bounds but does not eliminate TOCTOU. A portable guarantee that provider work executes the already-opened, already-hashed file is `UNKNOWN`; operating systems differ. Receipts must state whether the final launch was path-based or descriptor/handle-bound.

## States

| Required state | Meaning | Nature | Override |
|---|---|---|---|
| `exactly-tested-and-supported` | exact operation/host/identity observation is in evidence and policy admits it | evidence + product policy | unnecessary |
| `policy-supported-but-not-this-CI-point` | policy admits the identity, but no exact matching CI receipt is attached | product policy | unnecessary; emit warning |
| `unknown-but-required-capabilities-present` | no policy admission/denial; all bounded required probes are positive | transient observation | eligible for stable explicit override |
| `unknown-and-capability-insufficient` | policy unknown and probes are incomplete, timed out, unparseable, or cannot establish semantics | transient epistemic state | no; improve probe/select known identity |
| `known-incompatible` | an explicit hole/deny predicate matches | product policy backed by evidence/source | no untested override |
| `missing-required-capability` | a required operation capability is explicitly absent | exact transient observation; may become policy fact | no |
| `relational-requirement-unsatisfied` | delegated relation machine failed | transient/composed observation | no |
| `protocol-incompatible` | delegated profile protocol machine failed | product/protocol fact | no |
| `tool-not-found` | no candidate satisfies selection request | transient environment | no |
| `tool-selection-ambiguous` | multiple candidates exist and policy requires explicit choice | transient environment | no; select one |
| `selected-binary-changed` | bytes/file identity changed after observation | transient security/correctness failure | no; reselect and restart preflight |
| `explicit-untested-override` | user authority admits one immutable unknown-but-capable observation | user authority + stable observation | already the override state |

## Transition precedence

```text
START
  -> resolve candidates
     none -> tool-not-found
     multiple without deterministic explicit authority -> tool-selection-ambiguous
  -> observe identity
  -> bounded capabilities
  -> re-observe bytes
     changed -> selected-binary-changed
  -> known deny/hole lookup
     match -> known-incompatible
  -> required capability evaluation
     absent -> missing-required-capability
     indeterminate -> unknown-and-capability-insufficient
  -> relations
     fail -> relational-requirement-unsatisfied
  -> composed protocol/peer/Effect gates
     fail -> corresponding machine state
  -> exact evidence + policy match
     yes -> exactly-tested-and-supported
  -> policy match
     yes -> policy-supported-but-not-this-CI-point
  -> all capabilities present
     no -> unknown-and-capability-insufficient
     yes, no matching override -> unknown-but-required-capabilities-present
     yes, stable matching override -> explicit-untested-override
```

Known holes are checked before positive range match. A policy like `>=x <y` plus a hole is represented as an admission matcher and an earlier exclusion matcher, never as a text warning after admission.

## Policy ownership

- The **provider package** owns provider-native identity parsing, operation capability definitions, and provider-specific known holes.
- **Core** owns generic state composition, selection/replacement invariants, policy schema, diagnostic contracts, and receipt format.
- A **portable profile package/core module** owns protocol identities and adapter requirements.
- The **application/user** owns explicit executable selection and eligible overrides.
- CI supplies observations; it does not autonomously rewrite support policy.

## Existing implementation gap — GITHUB-DIRECT

At the inspected live head, explicit paths must be absolute; otherwise discovery returns the first PATH match. The observation records only name/version/path. It does not enumerate ambiguity, hash bytes, preserve provider-specific identity, or recheck replacement. This is adequate for the current exact provider paths but fails the requested compatibility experience.

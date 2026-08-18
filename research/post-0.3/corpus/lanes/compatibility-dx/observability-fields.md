# Observability fields, privacy, redaction, and cardinality

## Event model — PROPOSAL

### Low-cardinality metric labels

```text
effect_build_compatibility_decisions_total {
  provider,
  operation,
  lane,
  state,
  evidence_class,
  host_os,
  host_arch,
  host_libc_class,
  policy_id,
  policy_revision_class,
  override_active,
  provider_work_began,
  destination_mutated
}
```

Do not label metrics with full version strings, paths, hashes, revisions, error messages, target filenames, source names, user rationale, or candidate counts beyond small buckets.

### Structured log / trace fields

- `event.name`: `effect_build.compatibility.preflight`, `.decision`, `.probe`, `.relation`, `.provider_start`, `.publish`.
- `trace_id`, `span_id`, `run_id`.
- `provider`, `operation`, `lane`.
- `state`, diagnostic `code`, severity.
- `policy.id`, `policy.revision`.
- `observation.id`.
- provider-specific version identity: raw version (bounded), normalized SemVer, prerelease/channel, revision/commit.
- executable/package full SHA-256 or integrity in secure receipt/log channel.
- selection method and candidate count bucket.
- capability IDs and result (`present/absent/indeterminate`), probe duration/exit class.
- relation IDs and participant observation IDs.
- provider/core, Effect, and protocol identities.
- `override.id`, active/scope/expiry; rationale only in protected audit log.
- `probe_provider_process_started`, `provider_work_began`, `staging_mutated`, `destination_mutated`.
- offline mode, declared acquisition class, observed network-attempt class.

## Redaction rules

1. **Paths:** default to basename plus HMAC token with per-project or per-run salt. Never send full home/workspace/cache paths to telemetry.
2. **Arguments:** emit from an allowlist; redact values for environment, define, token, key, certificate, URL query, and arbitrary provider flags.
3. **Environment:** record only allowlisted variable names and value digests/classes; never values for secrets.
4. **stdout/stderr:** cap bytes, strip ANSI, redact path/URL/token patterns, store SHA-256 and a bounded excerpt in local receipt. Remote telemetry receives exit class and digest only by default.
5. **Source and artifacts:** never log source contents, bundled code, assets, or destination contents. Output receipts contain relative manifest path, size, digest, and role only.
6. **Binary identity:** digest is allowed in local/audit receipt; metrics use `identity_strength=strong|weak` only.
7. **Override rationale:** protected audit field, never metric label.
8. **Canary crash-report caveat:** selecting a Bun canary may activate upstream crash reporting; emit a local privacy warning sourced to upstream documentation.

## Cardinality controls

- Map versions to `stable|prerelease|canary|opaque` and optional `major.minor` only in metrics.
- Capability and relation IDs come from bounded registries. Unknown IDs go in event bodies, not labels.
- Candidate count uses `0`, `1`, `2`, `3+` buckets.
- Policy revisions use current/previous/other class in metrics; exact revision in logs.
- Do not label by SHA, path token, trace ID, or destination.

## Persistent compatibility receipt

A local receipt may retain exact identities for reproducibility:

```text
CompatibilityReceipt@1 {
  sourceSha
  policyId/revision
  requestDigest
  selectedObservations[]
  capabilityResults[]
  relationResults[]
  peer/effect/protocolResults
  decision
  override?
  probeProviderProcessStarted
  providerWorkBegan
  stagingMutationOccurred
  destinationMutationOccurred
  outputManifest?
  redactionProfile
}
```

Receipts are immutable and content-addressed. They must state their redaction profile so absence of full paths is not confused with missing evidence.

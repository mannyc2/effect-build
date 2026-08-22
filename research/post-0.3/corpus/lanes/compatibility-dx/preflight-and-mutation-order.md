# Preflight and mutation order

## Required ordering — PROPOSAL

Compatibility must be knowable before provider work or destination mutation. The only permitted preflight side effects are bounded process execution, reads, hashing, and temporary resources explicitly classified as probe resources and cleaned before admission.

1. **Validate request schema.** Normalize provider, operation, lane, target, flags, offline mode, and explicit selectors. No filesystem mutation.
2. **Validate destination intent.** Resolve parent, collision policy, atomic-publication support, and permissions using non-mutating checks where possible. Do not create the final destination.
3. **Resolve selection candidates.** Use explicit path/config/package/host identity. Enumerate PATH candidates rather than silently choosing first when uniqueness is required.
4. **Fail not-found or ambiguity.** No probe or provider work.
5. **Canonicalize selected identity.** Resolve real path, stat/file identity, full SHA-256, package integrity, and selection provenance.
6. **Read provider-specific version identity.** Strict parse or retain opaque identity; record channel/revision/ABI fields.
7. **Run bounded operation-specific capability probes.** No installation, network acquisition, blind retries, or destination writes.
8. **Re-observe selected bytes.** Fail on replacement during probes.
9. **Evaluate known holes and incompatibilities.** Exclusions precede positive ranges.
10. **Evaluate required capabilities.** Distinguish absent from indeterminate.
11. **Observe all relation participants.** Builder/base, denort, package/native binary, host/target, assets.
12. **Evaluate relational constraints.** Fail before work.
13. **Evaluate provider/core npm peers.** Inspect actual graph.
14. **Evaluate Effect declarations/runtime.** Detect skew and duplicates.
15. **Evaluate profile protocol.** Select at most one explicit adapter and re-evaluate.
16. **Evaluate evidence and support policy.** Exact tested, policy supported, or unknown.
17. **Resolve eligible override.** Exact immutable match only; otherwise fail unknown.
18. **Final selected-binary recheck.** Hash/stat immediately before launch.
19. **Create private staging area.** This is the first provider-work preparation mutation. It is not the destination.
20. **Begin provider work.** Trace `providerWorkBegan=true`; pass exact selected paths and offline flags.
21. **Verify outputs in staging.** Syntax/run/manifest/target checks as operation requires.
22. **Recheck durable inputs/selected identities where meaningful.** Record any post-work drift.
23. **Publish atomically.** Replace destination only after complete verification.
24. **Persist receipt.** Include state, override, tool/package/protocol identities, work/mutation booleans, and output manifest.
25. **Clean staging.** Cleanup failure is separate from compatibility and must not delete a published artifact.

## Provider work definition

Provider work begins when the selected provider performs the requested build/compile/assemble operation. Identity/help probes are preflight probe work and must be separately tagged. An esbuild in-memory semantic smoke probe may start its native service; the receipt must say `probeProviderProcessStarted=true` while `providerWorkBegan=false` because no user operation ran.

## Destination mutation definition

- Reading/statting parent directories: no.
- Creating a private, randomly named staging directory outside the destination namespace: staging mutation, not destination mutation.
- Creating/truncating the requested output path or replacing its parent-visible entry: destination mutation.
- Atomic rename/replace after verification: destination mutation occurred.

## Failure invariant

For all compatibility preflight errors:

```text
providerWorkBegan == false
destinationMutationOccurred == false
```

If a probe violates this invariant, emit `EFFECT_BUILD_PREFLIGHT_INTERNAL_DEFECT` or `EFFECT_BUILD_NO_INSTALL_INVARIANT_VIOLATION`; do not recast it as provider incompatibility.

## Offline/no-install guarantee — PROPOSAL

`effect-build` itself never installs, upgrades, downloads, or silently substitutes providers. In offline mode it also passes provider controls that forbid dependency/network acquisition where available and preflights declared assets. This is distinguishable from a stronger OS-level network-denial guarantee. Without an external sandbox, a provider may still attempt network I/O; such an attempt must fail and be reported, never retried with altered policy.

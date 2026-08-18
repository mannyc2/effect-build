# effect-build compatibility and developer-experience research

**Repository:** `mannyc2/effect-build`  
**Live research branch:** `codex/post-0.3-native-capability-architecture`  
**Live head at final recheck:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Observation time:** `2026-08-17T21:34:58Z` (`2026-08-17T17:34:58-04:00` America/New_York)  
**Historical reproducible receipt source:** `9b0d2f59567a7684b62df932c67b7a96050b605f`  
**Research mode:** read-only source, documentation, and receipt analysis

## Result

**PROPOSAL — recommended state model:** a hybrid provider-and-operation policy whose decision is the composition of five independent machines:

1. selected tool and operation compatibility;
2. provider-package/core-package peer compatibility;
3. Effect declaration/runtime compatibility;
4. portable-profile protocol compatibility;
5. relational constraints among selected binaries, packages, hosts, and assets.

The model keeps **exact observations**, **maintainer support policy**, **bounded capability observations**, **user override authority**, and **cross-component relations** as separate facts. It never reduces them to one `supported` boolean.

The state machine gives exact CI points privileged evidence but does not interpolate ranges from endpoints. A policy-supported version that was not this CI point is a different success state from an exact tested point. An unknown version with all required capabilities is still unknown and requires a stable, explicit override. Known incompatibility, an absent capability, a failed relation, protocol skew, peer skew, ambiguous selection, and changed executable bytes are not overrideable through the untested-version mechanism.

## Candidate disposition

| Candidate | Disposition | Principal falsifier |
|---|---|---|
| exact tested-version allowlist | **FALSIFIED as the complete model** | cannot express policy-supported untested points, channel/revision identity, relations, peer/protocol skew, or capability-bearing unknowns |
| contiguous version range | **FALSIFIED** | cannot represent non-contiguous support, known-bad holes, operation/API asymmetry, Deno channel identity, or exact SEA equality |
| capability-first probing | **FALSIFIED** | a capability may exist while semantics are known incompatible; it also erases evidence strength, package peers, protocols, and relational constraints |
| hybrid exact sets/ranges/holes/predicates/capabilities/relations | **retained provisionally** | survives the required falsifiers, but initial provider/operation support commitments remain `UNKNOWN` pending the missing provider-breadth inventory and exact execution |

## Evidence boundaries

- **GITHUB-DIRECT:** live files, manifests, workflows, source, PR/branch metadata.
- **UPSTREAM-DIRECT:** official provider/runtime/package-manager documentation and official repositories.
- **RECORDED-EXECUTION:** GitHub Actions receipts or successful exact jobs. Every receipt is scoped to its SHA, runner, tool bytes, operation, and fixture.
- **INFERENCE:** a conclusion logically derived from direct evidence, with limitations stated.
- **PROPOSAL:** the API/policy model designed here.
- **UNKNOWN:** a behavior requiring execution, missing input, or maintainer choice.
- **FALSIFIED:** a candidate contradicted by a source, receipt, or adversarial scenario.

The historical architecture artifact for `9b0d2f59567a7684b62df932c67b7a96050b605f` was downloaded and its SHA-256 independently verified as `d783cfb14665c891f32e76aca095de08777c5b00e9fb517b26faa38eeb5582d9`. It records exact Bun `1.3.9`/`1.3.14`, Deno `2.9.3`/`2.9.5`, esbuild `0.28.1`/`0.28.2`, Node SEA `25.5.0`/`26.7.0`, package-peer, and role/profile executions. It does **not** establish continuous ranges.

The live head's main merge-test workflow failed only at formatting after production build/type/unit/consumer/architecture/lint work; individual real-tool, target, publication-host, esbuild, and Effect endpoint jobs succeeded. The live-head architecture research workflow failed during prototype type-checking before final receipt-producing stages. Therefore this package uses historical receipts for executable research conclusions and records the later source as unreceipted.

## Required-input limitation

`effect-build-research-synthesis-2026-08-17.zip` and `effect-build-provider-native-breadth-research.zip` were not attached to this conversation and were not discoverable in the file library. Upstream/comparative work and live-repository inspection are complete. **Final operation-specific future policy remains provisional** until reconciled against that operation inventory. No missing archive proposition is treated as fact.

## Most important design decisions

- Select a binary explicitly or fail on ambiguity; PATH-first discovery without surfacing alternatives is insufficient.
- Observe the selected binary by canonical path, stat identity, full digest, raw version output, provider-specific parsed identity, channel/revision, and bounded operation-specific capabilities.
- Re-observe immediately before provider work. A changed digest or file identity is `selected-binary-changed`, before destination mutation.
- Provider/core npm peers, Effect declarations/runtime, profile protocol, and tool/operation policy are independent machines.
- Override authority is narrow: unknown-but-capable only, keyed to an immutable observation and policy revision.
- `effect-build` never installs, upgrades, downloads, or silently substitutes a provider. Provider-owned acquisition such as Deno `denort` must be declared and preflighted separately.
- Destination publication starts only after compatibility preflight; provider work goes to staging and is published atomically after verification.
- Exact CI success adds an observation. Maintainer policy promotion is a separate reviewed change.

## Exact unknowns retained

1. The complete provider-native operation inventory, because both requested archives were unavailable.
2. Initial continuous support ranges for every provider/operation/host cell; endpoint successes are not ranges.
3. Whether Bun's revision string is sufficient identity for all distribution channels without a byte digest.
4. A stable machine-readable Deno channel query across all relevant releases; Deno documents channel identity but the compatibility probe contract must be executed.
5. Exact offline cache-layout contracts for Deno's esbuild backend and `denort` on all targets.
6. Node SEA cross-host/cross-target relations beyond exact same-version builder/base and documented snapshot/code-cache constraints.
7. Which future portable profiles are public, and their protocol migration policy.
8. Whether Effect declaration compatibility and runtime compatibility can ever be widened independently for a package release.
9. A portable OS primitive that eliminates the executable time-of-check/time-of-use window by executing the already-hashed file handle.
10. Policy commitments for prerelease/canary channels.

## Maintainer decisions required

- Choose the first public `CompatibilityPolicy` schema and policy ownership boundary.
- Decide whether automatic PATH discovery is allowed only when unique, or disabled by default in CI/release mode.
- Choose the accepted binary identity strength on filesystems where stable inode/file-index data is unavailable.
- Approve the no-install/offline guarantee and provider-acquisition declaration format.
- Choose override persistence scope: project lockfile, CI input, application configuration, or all with precedence.
- Decide whether policy widening requires a provider-package release in every case.
- Define the first public profile protocol identities and migration support window.
- Select exact candidate versions for widening probes. This research intentionally does not select unsupported initial ranges.

## Package map

- `upstream-versioning-survey.md` — provider version grammars and comparative systems.
- `operation-version-matrix.csv` — exact observations, policy status, holes, unknowns, and proposed override examples.
- `compatibility-policy-candidates.md` — four distinct candidate state models and falsifiers.
- `*-state-machine.md` — the five composable compatibility machines.
- `typed-error-and-warning-taxonomy.md` — stable error/warning codes and payloads.
- `developer-experience-scenarios.md` — twenty concrete scenarios with mutation, logging, privacy, and remediation outcomes.
- `runtime-probe-specifications.md` — bounded, non-installing, operation-specific probes.
- `evidence-ledger.json` and `source-bibliography.md` — claim provenance and primary-source coordinates.
- `manifest.sha256` — SHA-256 for every other file in this archive; the manifest excludes itself.

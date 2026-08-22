# Falsifiers and open questions

## Candidate falsifier ledger

| Falsifier | Exact allowlist | Contiguous range | Capability-first | Hybrid |
|---|---|---|---|---|
| non-contiguous supported versions | requires becoming a policy set, loses tested/policy distinction | fails | not a version policy | passes |
| known-bad holes | separate deny system required | fails | fails when capability still present | passes |
| provider-specific grammar | exact raw string incomplete for Deno channel | fails | partial | passes with sum identity |
| prerelease ordering | exact-only | fails if naive parser | ignores ordering | passes with strict SemVer matcher |
| API/command asymmetry | expanded key required | expanded key required | passes shape, not semantics | passes |
| capability present but known incompatible | deny system required | deny system required | fails | passes |
| missing capabilities | generic unsupported | generic unsupported | passes | passes with typed absence |
| unknown-but-capable override | cannot express cleanly | cannot express cleanly | silently admits | passes narrowly |
| Node SEA equality | fails | fails | partial | passes relation |
| explicit selection / ambiguity | outside model | outside model | outside model | passes |
| offline/no-install | outside model | outside model | outside model | passes as preflight/acquisition policy |
| multiple versions / shims | exact value may hide actual binary | hides actual binary | probes chosen path only | passes selection provenance |
| changed executable bytes | fails | fails | fails without recheck | passes bounded recheck |
| provider/core peer skew | outside model | outside model | outside model | composed machine |
| protocol skew | outside model | outside model | outside model | composed machine |
| exact Effect endpoints | conflates peer/test unless duplicated | range overclaims | outside model | composed machine |
| decision before mutation | possible | possible | possible | required and audited |

## Attempted falsifiers against the hybrid model

1. **Opaque custom executable with no parseable version:** retained as `OpaqueIdentity`; exact digest/predicate or unknown capable, never range-ordered.
2. **Known-bad semantics while every help flag exists:** exclusion precedence wins before capability admission.
3. **Probe timeout:** maps to capability-insufficient, not absence or override eligibility.
4. **Binary replaced between probe and work:** final digest relation fails.
5. **Provider/core peer passes but protocol fails:** independent protocol machine blocks.
6. **Exact tool passes but Effect duplicates exist:** Effect machine blocks.
7. **Deno stable and LTS both report 2.9.3:** channel/provenance/digest distinguish identities.
8. **Node SEA participants individually admitted but unequal:** relation blocks.
9. **Offline Deno compile has compiler but lacks denort:** asset preflight blocks without download.
10. **Policy range includes an advisory hole:** exclusion matcher wins.

No required falsifier found a state the hybrid model cannot represent. This is a design result, not runtime certification.

## Exact open questions

### Missing inputs

- `effect-build-research-synthesis-2026-08-17.zip` was unavailable.
- `effect-build-provider-native-breadth-research.zip` was unavailable.
- Therefore the final operation inventory and future operation-specific policy are provisional.

### Provider identity

- What stable machine-readable field exposes Deno's baked channel in every targeted release? If none, should acquisition provenance plus digest be normative?
- Are Bun revision and digest sufficient across official npm/Homebrew/install-script distributions, or must distribution provenance be part of policy?
- How should custom source builds report commit and build configuration?

### Probes and TOCTOU

- Which supported OSes can launch the exact already-opened executable handle after hashing?
- What maximum probe budgets avoid hangs while not rejecting cold-start native tools?
- Which esbuild in-memory lifecycle smoke is strong enough without becoming user provider work?
- How should antivirus/quarantine replacement on Windows be distinguished from malicious/accidental replacement?

### Offline

- Exact Deno `DENO_DIR` and esbuild-backend asset coordinates across target versions.
- Whether every provider exposes flags sufficient to prevent network, or whether CI/release mode requires an OS sandbox.
- Whether package graph inspection can be guaranteed without package-manager execution in all supported layouts.

### Policy and release

- Initial exact/range cells for each provider operation and host.
- Whether policy-supported untested points are admitted by default or require application opt-in.
- How long prerelease/canary observations remain valid.
- Whether known holes can be shipped as signed remote policy without violating offline/no-install determinism; no remote policy is proposed here.
- Package/provider independent versioning and first explicit core peer ranges.

### Effect and protocols

- Exact TypeScript versions/options constituting declaration support.
- Whether declaration and runtime endpoints may differ under any tested relation.
- First public profile protocol identities, feature negotiation, and adapter support window.
- How protocol semantic-invariant digests are authored and reviewed.

## Execution-required probes retained as UNKNOWN

- Deno channel machine-output probe across stable/LTS/RC/canary.
- Deno offline compile for each target with explicit/sibling/cache denort sources.
- Custom esbuild native binary/package skew behavior for all host package managers.
- Node SEA cross-host targets and official/non-official matching source builds.
- Executable replacement race fixtures on Linux, macOS, and Windows.
- Exact candidate versions chosen for CI widening.

## Maintainer decision checklist

- [ ] Approve hybrid schema and state precedence.
- [ ] Approve explicit-selection/ambiguity default.
- [ ] Approve stable override object and persistence location.
- [ ] Approve no-install and offline semantics.
- [ ] Select exact widening candidates; do not select ranges from endpoints.
- [ ] Reconcile provider-native breadth archive before final operation policy.
- [ ] Define provider/core peers and profile protocol IDs.
- [ ] Decide release unit for policy-only changes.

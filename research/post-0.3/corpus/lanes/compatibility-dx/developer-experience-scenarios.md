# Developer-experience scenarios

All hypothetical coordinates are labeled as such and are not support commitments. Every compatibility failure shown below occurs before provider work and destination mutation unless explicitly stated.

## Scenario matrix

| # | Provider / operation | Identity and selection | Result | Diagnostic | Override | Provider work / destination |
|---:|---|---|---|---|---|---|
| 1 | Bun — compile executable | `1.3.9+cf6cdbbba`; absolute provisioned path from tool-pins | `exactly-tested-and-supported` | `none` | no | yes after preflight / staging only then atomic publish |
| 2 | Bun — Bun.build bundle | `1.3.14 (revision not captured in receipt)`; host process identity | `exactly-tested-and-supported` | `none` | no | yes / callback-owned temp only |
| 3 | esbuild — context/rebuild bundle | `package/API/native 0.28.2`; workspace package resolution | `exactly-tested-and-supported` | `none` | no | yes / borrowed temp; destination only after verification |
| 4 | Deno — compile executable | `2.9.4 stable (hypothetical policy P includes exact identity)`; explicit absolute binary | `policy-supported-but-not-this-CI-point` | `EFFECT_BUILD_TOOL_POLICY_SUPPORTED_NOT_CI_POINT` | no | yes / staging then publish |
| 5 | Deno — Deno.bundle host API | `1.40.0 stable`; explicit path | `missing-required-capability` | `EFFECT_BUILD_REQUIRED_CAPABILITY_MISSING` | no | no / no |
| 6 | Bun — compile executable | `canary revision abc123, sha256 D`; explicit path | `unknown-but-required-capabilities-present` | `EFFECT_BUILD_TOOL_VERSION_UNKNOWN + prerelease warning` | yes | no until override / no |
| 7 | esbuild — serve | `0.27.4`; package resolution | `known-incompatible` | `EFFECT_BUILD_TOOL_VERSION_KNOWN_INCOMPATIBLE` | no | no / no |
| 8 | Bun — compile executable | `none`; explicit missing /opt/tools/bun | `tool-not-found` | `EFFECT_BUILD_TOOL_NOT_FOUND` | no | no / no |
| 9 | Bun — bundle | `1.3.9 and 1.3.14 installed`; PATH search finds two candidates | `tool-selection-ambiguous` | `EFFECT_BUILD_TOOL_SELECTION_AMBIGUOUS` | no | no / no |
| 10 | Deno — bundle command | `custom 2.9.5 stable, digest D-custom`; explicit absolute custom executable | `unknown-but-required-capabilities-present` | `EFFECT_BUILD_TOOL_VERSION_UNKNOWN` | yes | no until override / no |
| 11 | Bun — compile executable | `1.3.9 before; bytes D2 after`; explicit path | `selected-binary-changed` | `EFFECT_BUILD_SELECTED_BINARY_CHANGED` | no | no / no |
| 12 | Deno — compile executable offline | `2.9.3 stable`; explicit Deno; offline mode | `missing-required-capability` | `EFFECT_BUILD_OFFLINE_ASSET_UNAVAILABLE` | no | no / no |
| 13 | Deno — bundle | `compiled from 2.9.3`; host API selected inside compiled executable | `missing-required-capability` | `EFFECT_BUILD_REQUIRED_CAPABILITY_MISSING` | no | no / no |
| 14 | Deno — declaration bundle | `hypothetical custom 2.9.x`; explicit path | `unknown-and-capability-insufficient` | `EFFECT_BUILD_CAPABILITY_PROBE_FAILED` | no | no / no |
| 15 | Node — assemble SEA | `builder 26.7.0; base 25.5.0`; two explicit paths | `relational-requirement-unsatisfied` | `EFFECT_BUILD_RELATION_UNSATISFIED` | no | no / no |
| 16 | provider/core — load provider package | `provider 0.7.0; core 0.5.0; peer >=0.4 <0.5`; lockfile graph | `peer-range-incompatible` | `EFFECT_BUILD_PROVIDER_CORE_PEER_INCOMPATIBLE` | no | no / no |
| 17 | portable profile — NodeMainProgram adapter | `provider protocol @1; core requires @2`; package adapter registry | `protocol-incompatible` | `EFFECT_BUILD_PROFILE_PROTOCOL_INCOMPATIBLE` | no | no / no |
| 18 | esbuild — context bundle | `0.28.3 exact hypothetical future identity`; explicit package resolution | `explicit-untested-override` | `EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE` | active | yes / staging then publish |
| 19 | Effect — consumer compile/runtime | `declarations beta.104; runtime rc.108`; npm graph | `effect-declaration-runtime-skew` | `EFFECT_BUILD_EFFECT_DECLARATION_RUNTIME_SKEW` | no | no provider work / no |
| 20 | esbuild — one-shot bundle | `package/API 0.28.2; custom native binary reports 0.28.1`; custom binary environment/path | `relational-requirement-unsatisfied` | `EFFECT_BUILD_RELATION_UNSATISFIED` | no | no / no |

## Full scenario records

### 1. Bun — compile executable

- **Host:** ubuntu-24.04 -> linux-x64-gnu
- **Exact version or identity:** `1.3.9+cf6cdbbba`
- **Selected executable and method:** absolute provisioned path from tool-pins
- **Discovered capabilities and relations:** compile flag/target present; digest stable
- **Compatibility result:** `exactly-tested-and-supported`
- **Typed error or warning:** `none`
- **Explanation:** Exact live/historical point
- **Permitted remediation:** none
- **Override available:** no
- **Persistent result/artifact observation:** receipt with digest/revision/policy
- **Provider work began:** yes after preflight
- **Destination mutation:** staging only then atomic publish
- **Logging/tracing:** info event; no raw path metric
- **Privacy/redaction/cardinality:** path token, digest in receipt; bounded versions

### 2. Bun — Bun.build bundle

- **Host:** Bun 1.3.14 host
- **Exact version or identity:** `1.3.14 (revision not captured in receipt)`
- **Selected executable and method:** host process identity
- **Discovered capabilities and relations:** Bun.build and required options present
- **Compatibility result:** `exactly-tested-and-supported`
- **Typed error or warning:** `none`
- **Explanation:** Exact host API receipt
- **Permitted remediation:** none
- **Override available:** no
- **Persistent result/artifact observation:** host-process observation
- **Provider work began:** yes
- **Destination mutation:** callback-owned temp only
- **Logging/tracing:** host-api span
- **Privacy/redaction/cardinality:** no source contents; revision low-card log

### 3. esbuild — context/rebuild bundle

- **Host:** Node 24.14.1 on ubuntu
- **Exact version or identity:** `package/API/native 0.28.2`
- **Selected executable and method:** workspace package resolution
- **Discovered capabilities and relations:** context/rebuild/cancel/dispose present; coherent versions
- **Compatibility result:** `exactly-tested-and-supported`
- **Typed error or warning:** `none`
- **Explanation:** Current exact package check + CI
- **Permitted remediation:** none
- **Override available:** no
- **Persistent result/artifact observation:** package integrity/API identity receipt
- **Provider work began:** yes
- **Destination mutation:** borrowed temp; destination only after verification
- **Logging/tracing:** context lifecycle span
- **Privacy/redaction/cardinality:** package path token; no entry contents

### 4. Deno — compile executable

- **Host:** ubuntu-24.04 -> linux-x64-gnu
- **Exact version or identity:** `2.9.4 stable (hypothetical policy P includes exact identity)`
- **Selected executable and method:** explicit absolute binary
- **Discovered capabilities and relations:** compile flags and matching denort present
- **Compatibility result:** `policy-supported-but-not-this-CI-point`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_POLICY_SUPPORTED_NOT_CI_POINT`
- **Explanation:** Illustrates policy/evidence split; no current commitment
- **Permitted remediation:** run exact CI for stronger evidence
- **Override available:** no
- **Persistent result/artifact observation:** policy revision + digest receipt
- **Provider work began:** yes
- **Destination mutation:** staging then publish
- **Logging/tracing:** warning once per run
- **Privacy/redaction/cardinality:** version allowed in logs, no cache path

### 5. Deno — Deno.bundle host API

- **Host:** ubuntu-24.04
- **Exact version or identity:** `1.40.0 stable`
- **Selected executable and method:** explicit path
- **Discovered capabilities and relations:** `Deno.bundle` is absent; upstream documents the API as added in 2.5
- **Compatibility result:** `missing-required-capability`
- **Typed error or warning:** `EFFECT_BUILD_REQUIRED_CAPABILITY_MISSING`
- **Explanation:** The old runtime cannot satisfy the requested host-API operation
- **Permitted remediation:** select a known capable Deno identity and enable the required unstable flag
- **Override available:** no
- **Persistent result/artifact observation:** failed preflight receipt
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** error event
- **Privacy/redaction/cardinality:** raw help truncated/hashed

### 6. Bun — compile executable

- **Host:** ubuntu-24.04
- **Exact version or identity:** `canary revision abc123, sha256 D`
- **Selected executable and method:** explicit path
- **Discovered capabilities and relations:** all required flags present; no deny relation
- **Compatibility result:** `unknown-but-required-capabilities-present`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_VERSION_UNKNOWN + prerelease warning`
- **Explanation:** Canary is untested upstream and absent policy
- **Permitted remediation:** select tested stable or create stable override
- **Override available:** yes
- **Persistent result/artifact observation:** immutable observation persisted
- **Provider work began:** no until override
- **Destination mutation:** no
- **Logging/tracing:** warning/error with revision
- **Privacy/redaction/cardinality:** canary crash-report privacy note; digest not metric

### 7. esbuild — serve

- **Host:** Windows
- **Exact version or identity:** `0.27.4`
- **Selected executable and method:** package resolution
- **Discovered capabilities and relations:** serve present
- **Compatibility result:** `known-incompatible`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_VERSION_KNOWN_INCOMPATIBLE`
- **Explanation:** Matches GHSA Windows serve hole
- **Permitted remediation:** upgrade to >=0.28.1 or avoid serve
- **Override available:** no
- **Persistent result/artifact observation:** matched-hole receipt
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** security-class error
- **Privacy/redaction/cardinality:** no URL/request data; advisory id low-card

### 8. Bun — compile executable

- **Host:** ubuntu-24.04
- **Exact version or identity:** `none`
- **Selected executable and method:** explicit missing /opt/tools/bun
- **Discovered capabilities and relations:** none
- **Compatibility result:** `tool-not-found`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_NOT_FOUND`
- **Explanation:** Selected path does not exist
- **Permitted remediation:** provision/select externally
- **Override available:** no
- **Persistent result/artifact observation:** selection failure record
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** single error
- **Privacy/redaction/cardinality:** redacted path token only

### 9. Bun — bundle

- **Host:** ubuntu-24.04
- **Exact version or identity:** `1.3.9 and 1.3.14 installed`
- **Selected executable and method:** PATH search finds two candidates
- **Discovered capabilities and relations:** not probed until selection
- **Compatibility result:** `tool-selection-ambiguous`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_SELECTION_AMBIGUOUS`
- **Explanation:** First-on-PATH would hide choice
- **Permitted remediation:** provide absolute path or lock selection
- **Override available:** no
- **Persistent result/artifact observation:** candidate provenance tokens
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** candidate_count metric
- **Privacy/redaction/cardinality:** no full PATH; candidate tokens HMAC

### 10. Deno — bundle command

- **Host:** ubuntu-24.04
- **Exact version or identity:** `custom 2.9.5 stable, digest D-custom`
- **Selected executable and method:** explicit absolute custom executable
- **Discovered capabilities and relations:** bundle/watch/platform present; channel observed; digest does not match the recorded official point
- **Compatibility result:** `unknown-but-required-capabilities-present`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_VERSION_UNKNOWN`
- **Explanation:** Matching version text does not prove custom bytes equal the observed build
- **Permitted remediation:** use the recorded official digest or create an override bound to this exact observation
- **Override available:** yes
- **Persistent result/artifact observation:** custom digest receipt
- **Provider work began:** no until override
- **Destination mutation:** no
- **Logging/tracing:** selection provenance span
- **Privacy/redaction/cardinality:** custom path redacted; signer metadata opt-in

### 11. Bun — compile executable

- **Host:** ubuntu-24.04
- **Exact version or identity:** `1.3.9 before; bytes D2 after`
- **Selected executable and method:** explicit path
- **Discovered capabilities and relations:** probe positive, final digest differs
- **Compatibility result:** `selected-binary-changed`
- **Typed error or warning:** `EFFECT_BUILD_SELECTED_BINARY_CHANGED`
- **Explanation:** Installer/replacement invalidated observation
- **Permitted remediation:** restart preflight with new bytes
- **Override available:** no
- **Persistent result/artifact observation:** before/after digest receipt
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** security/error event
- **Privacy/redaction/cardinality:** digests retained, paths tokenized

### 12. Deno — compile executable offline

- **Host:** ubuntu -> windows-x64
- **Exact version or identity:** `2.9.3 stable`
- **Selected executable and method:** explicit Deno; offline mode
- **Discovered capabilities and relations:** compile present; matching denort absent
- **Compatibility result:** `missing-required-capability`
- **Typed error or warning:** `EFFECT_BUILD_OFFLINE_ASSET_UNAVAILABLE`
- **Explanation:** Deno would normally acquire denort; effect-build must not
- **Permitted remediation:** pre-provision DENORT_BIN/cache outside run
- **Override available:** no
- **Persistent result/artifact observation:** asset-preflight record
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** offline error
- **Privacy/redaction/cardinality:** cache root token; no remote URL labels

### 13. Deno — bundle

- **Host:** compiled Deno runtime
- **Exact version or identity:** `compiled from 2.9.3`
- **Selected executable and method:** host API selected inside compiled executable
- **Discovered capabilities and relations:** Deno.bundle explicitly absent
- **Compatibility result:** `missing-required-capability`
- **Typed error or warning:** `EFFECT_BUILD_REQUIRED_CAPABILITY_MISSING`
- **Explanation:** Command support does not imply compiled-runtime API
- **Permitted remediation:** use selected deno command or uncompiled host
- **Override available:** no
- **Persistent result/artifact observation:** lane-specific receipt
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** capability error
- **Privacy/redaction/cardinality:** only function identity, no program data

### 14. Deno — declaration bundle

- **Host:** ubuntu-24.04
- **Exact version or identity:** `hypothetical custom 2.9.x`
- **Selected executable and method:** explicit path
- **Discovered capabilities and relations:** bundle present; declaration capability indeterminate due probe failure
- **Compatibility result:** `unknown-and-capability-insufficient`
- **Typed error or warning:** `EFFECT_BUILD_CAPABILITY_PROBE_FAILED`
- **Explanation:** Help/JSON cannot establish required declaration semantics
- **Permitted remediation:** run exact non-mutating smoke in CI or choose observed identity
- **Override available:** no
- **Persistent result/artifact observation:** probe failure digests
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** probe span
- **Privacy/redaction/cardinality:** truncate diagnostics; paths redacted

### 15. Node — assemble SEA

- **Host:** ubuntu-24.04/linux-x64-gnu
- **Exact version or identity:** `builder 26.7.0; base 25.5.0`
- **Selected executable and method:** two explicit paths
- **Discovered capabilities and relations:** --build-sea present; equality relation fails
- **Compatibility result:** `relational-requirement-unsatisfied`
- **Typed error or warning:** `EFFECT_BUILD_RELATION_UNSATISFIED`
- **Explanation:** Exact historical falsifier and upstream rule
- **Permitted remediation:** select equal-version base/builder
- **Override available:** no
- **Persistent result/artifact observation:** both observations + relation result
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** relation span
- **Privacy/redaction/cardinality:** binary path tokens; versions low-card

### 16. provider/core — load provider package

- **Host:** fresh npm consumer
- **Exact version or identity:** `provider 0.7.0; core 0.5.0; peer >=0.4 <0.5`
- **Selected executable and method:** lockfile graph
- **Discovered capabilities and relations:** tool caps irrelevant; peer fails
- **Compatibility result:** `peer-range-incompatible`
- **Typed error or warning:** `EFFECT_BUILD_PROVIDER_CORE_PEER_INCOMPATIBLE`
- **Explanation:** Historical ERESOLVE fixture
- **Permitted remediation:** align package versions
- **Override available:** no
- **Persistent result/artifact observation:** package graph receipt
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** peer error
- **Privacy/redaction/cardinality:** package names/versions allowed; locations tokenized

### 17. portable profile — NodeMainProgram adapter

- **Host:** any
- **Exact version or identity:** `provider protocol @1; core requires @2`
- **Selected executable and method:** package adapter registry
- **Discovered capabilities and relations:** required invariant/features missing
- **Compatibility result:** `protocol-incompatible`
- **Typed error or warning:** `EFFECT_BUILD_PROFILE_PROTOCOL_INCOMPATIBLE`
- **Explanation:** npm versions may still satisfy
- **Permitted remediation:** upgrade/downgrade or select tested adapter
- **Override available:** no
- **Persistent result/artifact observation:** protocol identities/digests
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** protocol span
- **Privacy/redaction/cardinality:** no user source/schema contents

### 18. esbuild — context bundle

- **Host:** ubuntu-24.04
- **Exact version or identity:** `0.28.3 exact hypothetical future identity`
- **Selected executable and method:** explicit package resolution
- **Discovered capabilities and relations:** all lifecycle capabilities; no holes; peers/effect/protocol pass
- **Compatibility result:** `explicit-untested-override`
- **Typed error or warning:** `EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE`
- **Explanation:** Unknown exact point admitted by stable user authority only
- **Permitted remediation:** run widening CI and promote policy later
- **Override available:** active
- **Persistent result/artifact observation:** override + observation receipt
- **Provider work began:** yes
- **Destination mutation:** staging then publish
- **Logging/tracing:** override warning every run
- **Privacy/redaction/cardinality:** reason protected; digest not metric label

### 19. Effect — consumer compile/runtime

- **Host:** ubuntu-24.04
- **Exact version or identity:** `declarations beta.104; runtime rc.108`
- **Selected executable and method:** npm graph
- **Discovered capabilities and relations:** peer may accept both; endpoints differ
- **Compatibility result:** `effect-declaration-runtime-skew`
- **Typed error or warning:** `EFFECT_BUILD_EFFECT_DECLARATION_RUNTIME_SKEW`
- **Explanation:** Peer satisfaction is not runtime identity equality
- **Permitted remediation:** dedupe and align exact endpoint
- **Override available:** no
- **Persistent result/artifact observation:** graph/declaration/runtime receipt
- **Provider work began:** no provider work
- **Destination mutation:** no
- **Logging/tracing:** Effect compatibility span
- **Privacy/redaction/cardinality:** package locations tokenized

### 20. esbuild — one-shot bundle

- **Host:** ubuntu-24.04
- **Exact version or identity:** `package/API 0.28.2; custom native binary reports 0.28.1`
- **Selected executable and method:** custom binary environment/path
- **Discovered capabilities and relations:** build flag present; coherence relation fails
- **Compatibility result:** `relational-requirement-unsatisfied`
- **Typed error or warning:** `EFFECT_BUILD_RELATION_UNSATISFIED`
- **Explanation:** Package/native skew can corrupt protocol
- **Permitted remediation:** restore matching binary/package
- **Override available:** no
- **Persistent result/artifact observation:** package/api/native observations
- **Provider work began:** no
- **Destination mutation:** no
- **Logging/tracing:** relation error
- **Privacy/redaction/cardinality:** binary path redacted; versions logged

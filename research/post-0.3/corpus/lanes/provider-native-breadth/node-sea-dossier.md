# Node SEA dossier

## State model

[SEA-001 · UPSTREAM-DIRECT] Node SEA is an active-development, Node-version-coupled assembly and mutation product. Its state machine is main/config → optional blob → copy/select base executable → inject/post-process → optional signing/verification → run. The runtime asset API is a separate embedded-resource domain, not a host builder lane.

| ID | Operation | Surface | Input/output ownership | Lifecycle | Role/shape | Evidence |
|---|---|---|---|---|---|---|
| S01 | direct --build-sea | selected command | durable direct | one-shot child | NodeMainExecutable refined / selected command | UPSTREAM-DIRECT; source-established |
| S02 | CommonJS main | build + runtime | durable/runtime process | build then run | NodeMainExecutable CJS / native config | UPSTREAM-DIRECT; source-established |
| S03 | ESM main | build + runtime | durable/runtime process | build then run | NodeMainExecutable ESM / native config | UPSTREAM-DIRECT; source-established |
| S04 | asset embedding/runtime API | config + runtime API | durable + borrowed no-copy view | build then run | none / provider-native capability | UPSTREAM-DIRECT; source-established |
| S05 | code cache | build config | durable | build/runtime | none / native option | UPSTREAM-DIRECT; source-established |
| S06 | startup snapshot | build config | durable | build executes code | none / native operation | UPSTREAM-DIRECT; source-established |
| S07 | execArgv policy | config + runtime | durable/runtime | runtime-owned | none / native config | UPSTREAM-DIRECT; source-established |
| S08 | legacy blob/injection | selected commands/postprocessor | durable staged | multi-process | none / private or explicit pipeline | UPSTREAM-DIRECT; source-established |
| S09 | signing/verification | external post-processing | durable trust artifact | external process chain | SignedExecutable future only / separate mutation operation | UPSTREAM-DIRECT; source-established |
| S10 | builder/base relation | selected relation | durable | build then validation | none / preflight/private validation | RECORDED-EXECUTION; historically-observed |

## Source-established truths

Node 26.7.0 documents CommonJS and ESM main support, assets, execution arguments, direct generation/base executable selection, legacy blob injection, code cache, startup snapshot, and platform signing considerations. Cache and snapshot are host/version/architecture sensitive; snapshot executes code at build time and has restrictions.

## False similarities and preserved distinctions

Calling SEA `compile` would hide the builder/base relation, mutation point, signing identity, version coupling, and cross-target limitations. Runtime `getAsset*` is not a peer of a command build. A Node executable built by a different Node version can be produced yet fail at runtime, as the exact historical relation receipt showed.

## Provider-only breadth

SEA assets and no-copy views, code cache, startup snapshot, execArgv policy, base executable selection, injection sentinel/postprocessor, and signing/verification boundaries have no honest portable peer. Signing must remain a separate privileged mutation/trust operation.

## Runtime gates

Expand the builder/base exact-version and architecture matrix; test CJS/ESM, assets, cache, snapshot, execArgv precedence, direct generation versus legacy injection, interruption at every stage, partial artifacts/cleanup, signature invalidation and verification, macOS/Windows/Linux formats, and cross-target claims.

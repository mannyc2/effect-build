# Effect declaration and runtime compatibility state machine

## Why Effect needs its own machine

Effect participates in at least three coordinates:

1. npm peer resolution;
2. TypeScript declarations used to compile `effect-build` and the consumer;
3. runtime module identity loaded by the application/provider layers.

A peer range can accept a version that has never been declaration-checked. A workspace can compile against one prerelease while loading another instance at runtime. Declaration and runtime compatibility must therefore be observed separately.

## Inputs

```text
EffectCompatibilityObservation@1 {
  declaredPeerRange
  declarationEndpoint {
    version, packageIntegrity?, declarationDigestSet,
    typescriptVersion, compilerOptionsDigest
  }
  runtimeEndpoints[] {
    version, packageLocationToken, packageIntegrity?, moduleIdentityToken
  }
  platformPackages[] {
    name, version, visibleEffectRuntimeInstance
  }
  exactCiReceipt?
}
```

## States

| State | Meaning | Result |
|---|---|---|
| `effect-exact-declaration-runtime-supported` | exact endpoint passed declaration, unit, packed-consumer, and runtime checks | strongest success |
| `effect-peer-supported-unobserved` | peer range accepts endpoint, but exact declaration/runtime endpoint not tested | warning/policy decision; not exact evidence |
| `effect-declaration-incompatible` | TypeScript declarations fail or public types differ incompatibly | failure |
| `effect-runtime-incompatible` | runtime APIs/semantics fail at exact endpoint | failure |
| `effect-declaration-runtime-skew` | compile endpoint differs from runtime endpoint without an explicit tested relation | failure |
| `effect-multiple-runtime-identities` | more than one Effect runtime instance is visible where singleton/service identity matters | failure or explicit architecture-specific policy |
| `effect-peer-incompatible` | npm peer machine rejects the endpoint | failure delegated from peer machine |
| `effect-endpoint-unknown` | range and graph may parse, but exact declarations/runtime cannot be established | failure unless maintainers define a separate Effect experimental override; none proposed here |

## Exact repository evidence

- Authored peer: `>=4.0.0-beta.104 <4.1.0-0`.
- Exact CI endpoints: `4.0.0-beta.104` and `4.0.0-rc.108`.
- Workspace development endpoint: `4.0.0-rc.108`.
- The verifier uses an isolated fresh packed consumer and preserves the peer range.

These are two exact prerelease points. They do not certify every beta/RC between them or future prereleases matching the peer range.

## Admission policy — PROPOSAL

For a release:

- `exact-declaration-runtime-supported` is admitted.
- `peer-supported-unobserved` may be admitted only if maintainers explicitly choose a broader peer-policy promise and accept a warning; it must never be displayed as exact-tested.
- declaration failure, runtime failure, skew, duplicate runtime identity, and peer failure are non-overrideable by a tool-version override.

## CI requirements

Each exact Effect endpoint widening job must install packed artifacts into a clean consumer, compile declarations with the supported TypeScript matrix, execute provider/core unit and integration fixtures, inspect `npm ls`/equivalent for duplicate Effect identities, and record exact package integrity/lockfile/toolchain coordinates.

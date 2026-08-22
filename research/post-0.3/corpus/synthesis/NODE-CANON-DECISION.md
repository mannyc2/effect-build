# Node canon decision

## Decision

Do not adopt the current C2 `NodeMain` bag as the final canonical value.

`resolutionTarget: "node"`, a module format, external-import observations, ordered steps, and a borrowed file are useful evidence, but they do not establish that Node SEA can execute the main. A non-built-in external can be accurately observed and still be unloadable by the injected SEA loader. Syntax checking likewise does not prove loader closure, runtime APIs, resources, main semantics, or target relations.

Adopt a **profile-specific opaque main capability** as the architectural direction. Treat it as semantically proposed until real adapters pass its adversarial matrix.

## Canonical family

The useful canonical family is descriptive, not a finalized TypeScript interface:

```text
NodeMain<Profile>
  protocol family and profile identity
  role = direct main
  format = CommonJS | ESM
  semantic compatibility agreement
  profile-specific closed load/resource state
  scoped sealed content snapshot
  producer and compatibility evidence envelope
```

The value is opaque because independent optional fields would recreate invalid combinations. Only a trusted profile adapter may mint it. The consumer revalidates every fact it can observe, but arbitrary JavaScript closure cannot be proven solely from final bytes.

## Initial candidate profile

The strongest currently defensible candidate is a SEA default-loader main:

```text
profile: NodeMain/sea-default-loader
one directly executed JavaScript main
format: CommonJS or ESM
default injected SEA loader
finite normalized literal Node built-ins only
no surviving package, local-module, JSON, native-addon, chunk, or runtime asset edge
asset-free
snapshot = false
code cache = false
dynamic-import policy explicit; "none" is a deliberate initial cut
```

This is not a claim that Node SEA itself lacks assets, snapshots, code cache, native addons, filesystem loading, or execution-argument configuration. Those remain outside this portable profile and available to a provider-native Node SEA surface; exact public breadth and permanence remain maintainer decisions. The profile deliberately selects a smaller state space that multiple producers could potentially seal.

## Semantic agreement versus assembler identity

The producer should bind its main to a deterministic semantic compatibility fingerprint, not an assembler-instance token.

Semantic terms may include:

- exact Node release for the first profile version;
- accepted main format;
- normalized required built-ins/features;
- SEA feature policy;
- system constraints only where producer semantics actually depend on them;
- protocol/profile versions.

Assembler-private facts remain outside the main's reusable semantic identity:

- selected binary path and selection-time observation;
- builder/base binary equality and identity checks;
- destination;
- signing/notarization policy;
- publication mechanics;
- credentials.

Exact Node release is a defensible initial compatibility cut. Binding addon-free JavaScript bytes to an exact OS/architecture or binary digest is not yet an established universal requirement.

## Sealed content, not “authenticated producer”

Prefer `SealedContentSnapshot` or `IntegrityBoundSnapshot` over “authenticated content.” A digest establishes only:

```text
bytes acquired by the consumer == bytes sealed by the producer adapter
```

It does not authenticate the author, provider, provenance, safety, closure, runtime success, or signature.

The semantic contract should hide file-versus-bytes transport. A producer may use a private file, buffer, or stream, but the consumer receives one scoped immutable snapshot or a typed `Expired`/`Changed`/acquisition failure. Whether SHA-256 is public or an internal integrity observation remains a cost and compatibility decision.

## Required profile law

The following is a conformance requirement, not current execution evidence.

For an admitted source request and semantic assembler agreement:

1. a conforming producer either rejects the request or mints one direct-main capability;
2. the capability has exactly one format and profile;
3. no packaging-coupled load/resource state excluded by the profile survives;
4. the consumer never branches on producer identity or raw provider metadata;
5. scoped acquisition yields exactly the sealed bytes or a typed lifetime/integrity failure;
6. for admitted conformance cases, an assembler preserves the profile's stated application-visible observations without branching on producer identity;
7. provider errors and evidence remain inspectable without becoming semantic validity fields.

The law promises packaging/load closure, not hermetic execution. Runtime input through arguments, environment, network, user files, clocks, and subprocesses remains application behavior.

## Invalid states removed

The supported constructors must make these states unrepresentable for this profile:

- importable-module role paired with direct-main semantics;
- unknown or mismatched format;
- non-built-in package/local/JSON/addon imports;
- chunks or runtime assets under an asset-free profile;
- unresolved or opaque load states treated as admissible;
- snapshots or code cache silently enabled;
- an expired or changed borrow accepted as current content;
- a main bound to incompatible semantic terms;
- a consumer reconstructing semantics from a raw path and provider metadata.

## Direct provider surface

Full Node SEA stays provider-native and may expose:

- CJS and ESM mains;
- assets;
- snapshots and code cache under their documented constraints;
- custom execution arguments;
- selected/custom executable;
- filesystem loading through explicit application code;
- native-addon extraction;
- signing and post-processing.

The native request may accept a raw file or bytes because it makes no portable producer-to-assembler claim.

## Composition

The source-to-executable composition is ordinary scoped Effect composition:

```text
assembler semantic offer
  -> producer accepts/rejects offer
  -> producer lends sealed main
  -> assembler consumes it within the borrow
  -> platform-qualified durable-file commit, if its publication gate succeeds
```

`NodeSourceExecutable` does not currently earn a profile protocol, plan language, registry, or `Recipe` architecture. Prefer an ordinary discoverable function such as `NodeMainExecutable.fromProgram` or `assembleNodeMainProgram`.

## Durability distinction

Separate:

- **durable executable** — caller owns the committed file after the operation;
- **distributable/release-ready executable** — required signing, notarization, trust, and publication policy has completed.

Signing is not a universal prerequisite for durable file ownership.

## Evidence status and gates

Status: `semantically-proposed`.

Before `portable-demonstrated`, construct the proof rather than waiting for adopters:

- Bun and esbuild adapters for CJS and ESM;
- exact Node main execution under SEA, not only bundle creation or syntax checks;
- legal and adversarial imports, computed loaders, `createRequire`, assets, addons, workers, and source-relative file behavior;
- built-in/API feature policy;
- builder/base matching and mismatch receipts;
- mutation, alias, symlink, hard-link, expiry, interruption, and duplicate-core laws;
- Linux, macOS, and Windows staging/commit/inspection behavior;
- packed consumer and protocol-skew tests.

If adapters cannot conservatively seal the profile without unsafe acceptance, retain provider-native operations. Do not weaken the capability into an observation bag.

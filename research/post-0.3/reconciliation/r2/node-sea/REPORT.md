# Node SEA provider-native breadth

**Research date:** 2026-08-19  
**Repository:** `mannyc2/effect-build`  
**Immutable source branch:** `claude/research-corpus-reconciliation-63pjhg`  
**Immutable base SHA:** `c4cefd0acc2b7854cc25513967af1a8d415ccab0`  
**Authorized output branch:** `research/r2-node-sea-native-breadth`  
**Authorized directory:** `research/post-0.3/reconciliation/r2/node-sea/**`  
**Current Node reference:** `v26.7.0` at `b4f23d3619c98bed09af93a21192f6080197a8c6`  
**Research mode:** repository-backed, official documentation/source only; no runtime probes executed  
**Status:** source shape complete; runtime, cross-target, cancellation, cleanup, and signing proof pending

> **Pushed-head recording rule.** A Git commit cannot truthfully embed its own final SHA in a file
> that contributes to that SHA. The immutable pushed head is therefore recorded by the remote Git
> ref, the draft PR metadata/body, and the final publication receipt rather than self-embedded here.
> `MANIFEST.sha256` records the content hashes of the four substantive dossier files.

## 1. Executive result

Node SEA has **three provider operations**, not one:

1. `assemble-direct` — `node --build-sea <config>` performs preparation-blob generation and
   LIEF-backed binary injection inside the selected Node process.
2. `generate-preparation-blob` — `node --experimental-sea-config <config>` writes the modern
   preparation blob as a private, scope-borrowed intermediate.
3. `inject-preparation-blob` — an explicitly selected external injector mutates a copied base with
   that blob, after which target-specific candidate repair, validation, digesting, and atomic
   publication occur.

The direct route and legacy route are different identities. They have different selected
participants, capability prerequisites, mutation paths, failure surfaces, evidence, and historical
availability. A caller must choose one; an adapter must never fall back between them.

The largest truthful Node-native surface includes:

- CommonJS and, on exact lines beginning with Node 25.7.0, ESM mains;
- assets configured at build time and looked up through `node:sea` at runtime;
- copied asset values, Blob values, and a no-copy runtime-borrowed raw view;
- startup snapshots;
- CJS code cache from Node 20.6.0 and ESM code cache from Node 25.9.0;
- fixed execution arguments and three runtime-extension policies;
- explicit filesystem loading through `module.createRequire()`;
- native-addon extraction to a temporary file followed by `process.dlopen()`;
- default-base and selected-base direct modes;
- host/target construction possibilities across PE, Mach-O, and ELF.

That surface is not one portable role and is not one publicly supported matrix. Documentation and
tagged source establish advertised shape. They do **not** certify cross-target execution,
cancellation, child termination, cleanup, partial-write remnants, binary repair, signing,
publication, or any effect-build support coordinate.

The R2 recommendation is therefore:

- **ship** the three operation identities, the exact classification, the relation model, the
  runtime-capability map, the staging/publication laws, and candidate-correctness boundary;
- **defer** all public host/target/version cells, ESM/cache/snapshot/native-addon certification,
  cross-target construction, exact external-injector candidates, and lifecycle guarantees to
  R3/R4/R5 execution;
- **reject** a merged direct/legacy operation, runtime asset lookup as a provider operation,
  historical raw-JavaScript injection as the current legacy identity, illegal configuration
  combinations, version-relation overrides, publication-before-repair, and any universal signing
  or Apple distribution abstraction in R2.

## 2. Evidence and judgment discipline

This dossier applies the reconciled corpus model rather than treating a source inventory row as an
export proposal.

### 2.1 Classification

Every atomic row is exactly one of:

```text
operation | request mode | modifier | result field | sub-operation
| relation | runtime capability | post-production mutation
| external-platform-primitive | portable-role | architecture-law
```

Only `operation` rows receive:

```text
provider / operation / lane / lifecycle
/ {resource-result, output-publication}
```

This eliminates several category errors in the prior breadth dossier:

- `assets`, `useSnapshot`, `useCodeCache`, `mainFormat`, `execArgv`, and
  `execArgvExtension` are request modes or relations, not operations;
- `sea.isSea()`, `getAsset*()`, and `getAssetKeys()` are runtime capabilities, not build
  operations;
- copying, injection, repair, validation, hashing, and rename are sub-operations or mutation laws;
- `codesign` and format inspectors are external platform primitives;
- candidate ad-hoc signing is a post-production correctness mutation, while Developer ID signing,
  notarization, containers, stapling, and Gatekeeper belong to R9.

### 2.2 Independent judgments

Each row keeps these independent:

- **evidence** — what an official document/source/commit or repository record establishes;
- **validity** — current, historical, derived, proposed, unknown, or falsified;
- **public support** — rejected, shape-only, candidate, admitted, or excluded;
- **priority** — required/high/medium/low;
- **implementation** — implemented, partial, absent, or not applicable;
- **certification** — documentation-only, runtime-proof-pending, certified, or excluded.

An upstream feature being documented does not admit it. A version being observed does not create a
range. An upstream CI platform does not become an effect-build support cell. A successful
configuration parse or blob write does not prove a durable executable.

## 3. Exact source basis

### 3.1 Repository basis

The immutable repository basis is `c4cefd0acc2b7854cc25513967af1a8d415ccab0`. The governing sources are listed in
`EVIDENCE-COORDINATES.csv`, including:

- corpus governance, decision record, reconciliation, reconciliation gates, and R1-R5/R9 program;
- the prior provider-native Node SEA dossier;
- the complete Node-canon lane;
- lifecycle and ownership laws;
- compatibility relation and preflight/mutation-order research;
- `APPLE-DISTRIBUTION-BOUNDARY.md`.

The key repository law is that operation identity is semantic, while evidence coordinates are
separate and exact. Publication is not a filesystem side effect; it is the validated transition
from a private candidate to an atomic durable result.

### 3.2 Current upstream reference

Current behavior in this report means exact Node tag `v26.7.0` at commit
`b4f23d3619c98bed09af93a21192f6080197a8c6`, released August 5, 2026. The important source coordinates are:

- `doc/api/single-executable-applications.md` lines 124-204 — introduction and direct workflow;
- lines 205-229 — direct configuration and builder/base/cross-platform relations;
- lines 230-261 — assets;
- lines 262-273 — snapshot and code cache;
- lines 274-331 — execution arguments and extension policies;
- lines 336-375 — runtime asset APIs;
- lines 377-450 — CJS/ESM loader behavior and native addons;
- lines 451-562 — legacy blob generation and manual injection;
- lines 563-572 — upstream CI platform coverage;
- `src/node_sea_bin.cc` — `InjectIntoELF`, `InjectIntoMachO`, `InjectIntoPE`,
  `MarkSentinel`, `InjectResource`, and `BuildSingleExecutable`;
- `src/node_sea.cc` — serialization/deserialization, config parsing, snapshot/cache generation,
  asset reads, and runtime resource views.

The v26.7.0 source tree contains LIEF version `0.17.0-`, but that source fact does not prove every
Node binary at the same semantic version was built with LIEF.

### 3.3 Maintained-line check

At the research date, the latest official release index listed v26.7.0 Current, v24.19.0 LTS, and
v22.23.2 LTS. Their versioned SEA documents are not equivalent:

| Exact line | Direct `--build-sea` | Legacy blob/injection | Main format documented |
|---|---:|---:|---|
| v26.7.0 | yes | yes | CommonJS and ESM |
| v24.19.0 | no | yes | CommonJS only |
| v22.23.2 | no | yes | CommonJS only |

This is a central compatibility fact. It is illegal to infer v26's direct or ESM surface backward
onto maintained v24 or v22.

## 4. Availability ledger

| Boundary | Exact version/commit | Meaning |
|---|---|---|
| Initial SEA | v19.7.0 / v18.16.0; `164bfe82cc7bf94e99649e3584e9c031a26dc93d` | Historical raw `NODE_JS_CODE` CJS injection. Different identity; not the modern preparation-blob route. |
| Modern JSON/blob route | v20.0.0; `491a5c968fd4e72e87f460cb583004dde10f4bbd` | `--experimental-sea-config`, serialized preparation blob, modern `NODE_SEA_BLOB` contract. |
| Startup snapshot | v20.6.0; `ac34e7561ab4771ed1a953efc92dc851ed468e3d` | `useSnapshot`. |
| CJS code cache | v20.6.0; `6cd678965fed3f3e30efe267742c38f14c71151c` | `useCodeCache` for CommonJS; dynamic `import()` caveat. |
| Assets and initial runtime APIs | v21.7.0 / v20.12.0; `ce8f085d2608cd54930efe0bcc42e5b2fa4614c3` | Asset map and `isSea`, `getAsset`, `getAssetAsBlob`, `getRawAsset`. |
| Embedded execution arguments | v24.7.0, backported v22.20.0; `3fc70198e0ab7c34eee8887a7cc0d429a9fdebc7` | `execArgv`. |
| Execution-argument extension | v24.7.0, backported v22.20.0; `6722642e3d009a4d57f00357978f7879af82d403` | `none`, `env`, `cli`. |
| Asset-key enumeration | v24.8.0 / v22.20.0; `6428e2e4ca09539d696a8f43edaaf149b2751967` | `getAssetKeys()`. |
| Direct build | v25.5.0; `b351910af1a783052d4578f13be1a1af713f6511` | In-core `--build-sea` using LIEF. |
| Default executable correction | v25.7.0; `62b0758c4701183a9c4c76d3ccc498eae4188fba` | Uses actual process executable, not caller-controlled `argv0`. |
| ESM main | v25.7.0; `2d874dfb8e079e73fcc313b46b8dd5de37ad9b07` | `mainFormat=module`; initial ESM omitted snapshot/cache support. |
| ESM code cache | v25.9.0; `9ff27fdb014c21e869966ffcd053c8e2d872d8c3` | ESM `useCodeCache`; ESM snapshot remains unsupported. |
| Current source reference | v26.7.0; `b4f23d3619c98bed09af93a21192f6080197a8c6` | Direct and legacy routes, CJS/ESM, current runtime capabilities. |

The availability predicate is never just `version >= X`. Exact binary capabilities, release-line
backports, build flags, selected participants, target, request modes, and repair/validation
availability are all inputs.

## 5. Provider operation inventory

### 5.1 `assemble-direct`

Semantic key:

```text
node-sea / assemble-direct / selected-command / one-shot
/ {caller-owned-value, atomic-published-durable}
```

The selected Node process parses the config, chooses the current executable when `executable` is
omitted or reads the explicitly selected base, generates the preparation blob, injects it through
the LIEF-backed format path, flips the fuse, writes the configured output, and copies permissions.

The native command writes its configured path directly. That is not sufficient for effect-build's
publication law. The adapter must substitute a private same-parent candidate path into the config.
Only after target-specific repair, native structural validation, future target-runtime smoke,
final hashing, and authenticated-input recheck may it atomically rename to the public destination.

Direct build can fail even at a nominally sufficient Node version when the exact binary lacks
`HAVE_LIEF` or SEA support. This must be a bounded required-capability decision with
present/absent/indeterminate outcomes, not a version guess.

### 5.2 `generate-preparation-blob`

Semantic key:

```text
node-sea / generate-preparation-blob / selected-command / one-shot
/ {scope-borrowed-value, none}
```

The output blob is a private intermediate. It is authorized only within the assembly scope and must
not be exposed as the operation's durable public product. The generator's exact identity and the
eventual base relation are preserved even if both pathnames initially refer to the same binary.

The modern identity starts at Node 20.0.0. The initial Node 18.16/19.7 raw-JavaScript route is
historical evidence and must not be silently accepted as a weaker implementation of this operation.

### 5.3 `inject-preparation-blob`

Semantic key:

```text
node-sea / inject-preparation-blob / selected-command / one-shot
/ {caller-owned-value, atomic-published-durable}
```

This operation owns the executable-producing half of the legacy route. It copies the authenticated
base to private staging, prepares the candidate for mutation when required, invokes one exact
injector with the target-derived resource/fuse arguments, performs final correctness repair,
validates, hashes, rechecks, and atomically publishes.

The official docs demonstrate `npx postject`, but that spelling is not an injector identity. It can
resolve different package bytes, depend on network/install state, and change without the request
changing. R3 must select finite exact injector candidates and prove their executable/package
identity, offline behavior, format support, failure behavior, and known holes.

## 6. Builder/base relationships

The relation is participant-dependent, not route-name-dependent.

### 6.1 Direct default base

When `executable` is omitted, the current source resolves the actual running Node executable. The
builder and base participants collapse into one authenticated executable. No separate equality
relation is needed.

The v25.7.0 default-path correction matters: earlier direct v25.5/v25.6 cells require an adversarial
custom-`argv0` probe before admission.

### 6.2 Direct explicit base

When `executable` is supplied, the builder and base are separate participants. Official v26.7
documentation requires the Node version used to build to equal the version of the binary into which
the blob is injected. This is a non-overridable relation.

This corrects prior corpus wording that confined builder/base equality to the legacy route. The
accurate law is: **equality applies wherever the participants are separate**.

### 6.3 Legacy route

The blob generator and candidate base are inherently separate participants, even when they resolve
to identical bytes. Their versions must match. Historical recorded execution in the corpus is an
exact observation, not a version range.

### 6.4 Custom builds

Equal semantic version is necessary under the official contract, but documentation does not prove
that all custom builds with the same version share compatible SEA serialization/runtime behavior.
Relevant build differences include SEA being disabled, LIEF being omitted, and source/build-option
skew. Public support therefore needs exact-binary capability and relation proof.

## 7. Configuration mode law

### 7.1 Main format, snapshot, and code-cache matrix

Current v26.7.0 state:

| Main | Snapshot | Code cache | Current legality | Notes |
|---|---:|---:|---|---|
| CommonJS | false | false | legal shape | baseline |
| CommonJS | true | false | legal shape | main runs during preparation; deserialize-main callback required |
| CommonJS | false | true | legal shape | dynamic `import()` documented not to work |
| CommonJS | true | true | ambiguous/redundant | current source warns cache is redundant; adapter must canonicalize or reject before launch |
| ESM | false | false | legal shape from v25.7.0 | absent from v24.19/v22.23 |
| ESM | false | true | legal shape from v25.9.0 | unavailable in v25.7-v25.8.x |
| ESM | true | false | illegal | current docs/source reject ESM plus snapshot |
| ESM | true | true | illegal | ESM plus snapshot is already illegal |

“Legal shape” is not certification. Each admitted version/host/target route cell still needs exact
execution.

### 7.2 Cross-target modes

Official docs state that cross-platform SEA generation must disable snapshot and code cache because
those artifacts are platform-bound and may crash when loaded on another platform. This relation is
non-overridable.

Disabling both makes cross-target construction *advertised as possible*; it does not admit every
host/target/architecture cell. The base must already be the requested target format/architecture,
the route/injector must handle it, target-specific repair must be available, and the candidate must
run on the target.

### 7.3 Execution arguments

`execArgv` embeds fixed Node flags. `execArgvExtension` then determines whether launch-time
extension is possible:

- `none` — only embedded arguments; ignore `NODE_OPTIONS`;
- `env` — allow `NODE_OPTIONS`; upstream default for backward compatibility;
- `cli` — parse `--node-options=...` as Node arguments rather than user-script arguments.

These are policy-relevant request modes. Effect-build must not treat Node's `env` default as its own
security decision by accident. Each mode needs exact argv partition, quoting, malformed-input, and
flag-eligibility probes. The selected policy belongs in the receipt.

## 8. Module-loading restrictions

Node SEA is a single injected main, not a packaged filesystem.

### 8.1 Common behavior

By default, injected-main `require()` and ESM imports resolve built-in modules only. A module that
exists only on the filesystem fails. Bundling into one authenticated script is therefore the
default deterministic closure.

`module.createRequire()` explicitly creates a normal filesystem-based loader. That is a truthful
provider-native capability but is outside the strict sealed-main portable role because it
reintroduces external runtime acquisition.

### 8.2 CommonJS main

The injected CommonJS `require` is not the normal file-loader `require`. Current documentation
guarantees `require.main` but not the usual properties such as loader caches/resolution helpers.
The effective `__filename`/`module.filename` is `process.execPath`; `__dirname` is its directory.

### 8.3 ESM main

On ESM-capable exact lines:

- `import.meta.url`, `.filename`, and `.dirname` identify `process.execPath`;
- `import.meta.main` is true;
- `import.meta.resolve` is unsupported;
- dynamic import can load built-ins by default but not filesystem modules.

ESM is not available in the exact maintained v24.19.0 and v22.23.2 docs. ESM code cache is a second
boundary at v25.9.0, not part of initial v25.7 ESM support. ESM snapshot remains illegal.

### 8.4 Native addons

Official docs show a provider-native path: embed a `.node` file as an asset, write it to a temporary
file, and call `process.dlopen()`. This is not equivalent to ordinary sealed-main closure. It adds
target ABI, temporary-file ownership, permissions, cleanup, and route-specific binary correctness.

The documented Linux arm64 container/native-addon crash is tied to output produced with postject.
It is a known legacy-route hole; it must not be projected onto direct LIEF output without execution,
and it must not be ignored when selecting a legacy injector.

## 9. Assets and runtime-capability mapping

Assets are configured during construction and consumed at runtime. They are not additional provider
operations.

| Runtime capability | Ownership/result | Availability boundary | R2 disposition |
|---|---|---|---|
| `sea.isSea()` | boolean value | v21.7.0 / v20.12.0 | ship classification; certify later |
| `sea.getAsset(key[, encoding])` | caller-owned copied ArrayBuffer or string | v21.7.0 / v20.12.0 | ship |
| `sea.getAssetAsBlob(key[, options])` | Blob value | v21.7.0 / v20.12.0 | ship |
| `sea.getRawAsset(key)` | **runtime-borrowed-view**, no copy | v21.7.0 / v20.12.0 | ship capability; reject mutation |
| `sea.getAssetKeys()` | caller-owned string array | v24.8.0 / v22.20.0 | ship |

The raw view is materially different from the copied APIs. Current docs warn that writing may crash
if the embedded section is read-only or improperly aligned. The public contract must not imply
ownership or mutability. Its authority ends with the SEA runtime; R4 must prove post-close/use-after-
scope behavior for any wrapper that exposes it.

Asset preparation reads source paths at build time. R3/R4 must cover missing paths, permissions,
symlinks, duplicate effective keys, empty and large assets, source mutation between authentication
and read, encoding, copied-value isolation, Blob behavior, raw-view lifetime, and arbitrary-size
bounds.

## 10. Host, target, architecture, and injector identity

### 10.1 Construction format

Current direct source recognizes ELF, Mach-O, and PE independently of the builder executable's own
format. That supports a *construction hypothesis* for cross-target work; it is not a support claim.

The requested target determines:

- base executable format and machine architecture;
- injected resource/note/segment contract;
- final suffix/permissions where relevant;
- required candidate repair and validation;
- the target runtime oracle.

A target label inferred from a filename is insufficient. The adapter must inspect the base and final
candidate.

### 10.2 Upstream CI context

Current docs say Node regularly tests SEA on Windows, macOS arm64, and Linux except Alpine and
s390x. macOS x64 is not currently in the documented SEA CI set. This is evidence context only. It
does not admit those cells, does not prove all architectures, and does not prove a cross-target
builder topology.

### 10.3 External injector

Legacy route selection must be finite and exact. At minimum, a candidate definition needs:

- package and executable content identity;
- version and provenance;
- no-install/offline acquisition behavior;
- command path reauthentication;
- ELF/Mach-O/PE capability;
- resource, segment, note, and fuse behavior;
- duplicate-resource/already-injected handling;
- target architecture behavior;
- cancellation and process-tree behavior;
- partial-write/remnant behavior;
- known issue/deny-hole mapping.

The official `npx postject` example satisfies none of the identity requirements by itself.
Accordingly, this dossier ships the operation identity but defers every injector implementation
candidate.

## 11. Candidate correctness versus Apple distribution

Only the first item below belongs to R2:

1. **Candidate correctness repair** — transformations strictly required so the mutated executable is
   structurally valid and runnable on the target, such as removing a stale signature before legacy
   Mach-O mutation and applying ad-hoc signing after the final mutation when required.
2. **Developer ID or distribution-trust signing** — excluded; R9.
3. **Notarization** — excluded; R9.
4. **App bundles, ZIPs, DMGs, and installer packages** — excluded containers; R9.
5. **Stapling and Gatekeeper assessment** — excluded; R9.

There is no universal signing abstraction. On current direct Mach-O source, LIEF removes an
existing code signature internally. On the legacy path, official docs tell the user to remove the
copied candidate's signature before injection. After final mutation, current docs show ad-hoc
`codesign --sign -` for macOS. Windows trust signing is optional and an unsigned binary is still
runnable; it is not a correctness prerequisite.

Cross-target macOS construction is therefore more than “LIEF can edit Mach-O.” The selected
execution topology must also be able to perform final candidate repair and target-native validation.
If it cannot, the cell is ineligible rather than partially published.

## 12. Lifecycle, staging, validation, and publication

The native Node direct command and example legacy workflow do not provide effect-build's durable
publication semantics. The adapter-level sequence is:

1. resolve exact route, builder, optional base, injector, repair, and validator identities;
2. evaluate version, capability, mode, host/target, architecture, and repair relations;
3. authenticate all inputs;
4. create private same-parent staging;
5. rewrite Node/blob output to private staging;
6. acquire scoped child-process ownership;
7. generate the blob or run direct build;
8. for legacy, copy the base and inject with the exact selected injector;
9. apply target-specific candidate repair after the final content mutation;
10. structurally inspect format, architecture, SEA resource/fuse, permissions, and signature state;
11. run target-runtime probes when the cell is being certified;
12. hash final bytes and recheck authenticated inputs/candidate identity;
13. atomically rename the same-parent candidate to the destination;
14. produce a receipt that keeps evidence, validity, support, priority, implementation, and
    certification distinct.

### 12.1 Interruption

Documentation does not establish interruption behavior. The required law is:

- before rename, interruption closes the scope, terminates/reaps owned children, and performs
  best-effort private cleanup;
- interruption remains interruption rather than being rewritten as a build error;
- cleanup/termination failures are secondary causes and do not mask the primary cause;
- no private remnant is represented as a durable result;
- atomic rename is the commit point;
- after successful rename, later interruption does not revoke the durable output.

R4 must execute interruption at every stage, including ignored signals, descendant processes,
partial writes, validator/repair hangs, cleanup failures, Windows locks, and the instant around
rename.

### 12.2 Validation order

Validation must follow the last mutation. For macOS, validating before ad-hoc signing validates the
wrong bytes. Digesting before signing records the wrong bytes. Publishing before either creates an
unvalidated durable artifact.

The candidate pathname must retain one authenticated object identity across mutation, repair,
validation, digesting, and rename. Symlink swaps, rename swaps, same-length replacement, inode
replacement, and Windows handle/lock behavior belong to R4.

## 13. Legal and illegal state summary

### 13.1 Legal shape, still uncertified

- direct default-base CommonJS on exact Node binaries with built-in SEA/LIEF;
- direct explicit-base CommonJS with same-version builder/base;
- legacy CommonJS blob+injection with same-version generator/base and exact injector;
- current v26 ESM plain mode;
- current v26 ESM with code cache on exact versions beginning v25.9.0;
- CJS snapshot or CJS code cache individually;
- asset embedding and runtime lookup on exact supporting lines;
- execArgv with explicitly selected extension policy;
- cross-target construction only when snapshot/cache are false, with target base, repair, validation,
  and runtime proof still required.

### 13.2 Illegal or rejected

- direct build before v25.5.0 or on a binary lacking LIEF/SEA support;
- treating v24.19.0/v22.23.2 as direct-build or ESM lines;
- ESM before v25.7.0;
- ESM code cache before v25.9.0;
- ESM plus snapshot;
- cross-target plus snapshot or code cache;
- builder/base version mismatch wherever participants are separate;
- base lacking the current SEA resource/fuse/runtime contract;
- unknown or unpinned external injector;
- target/base format or architecture mismatch;
- already-injected or malformed base without an explicit legal replacement law;
- writing through `getRawAsset()` as a supported operation;
- public-path direct writes or publication before final repair/validation;
- historical `NODE_JS_CODE` raw injection as a fallback for modern blob injection;
- universal signing or Apple distribution work in R2.

### 13.3 Canonicalization required

CJS `useSnapshot=true` plus `useCodeCache=true` is not a useful two-feature promise in current
source; Node warns that code cache is redundant. The provider decision table must either reject the
ambiguous request or normalize it to snapshot semantics with an explicit diagnostic. Silent
acceptance would misstate intent.

## 14. Ship / defer / reject

### 14.1 Ship

Ship into the reviewed architecture/crosswalk:

- exactly three provider operations and their semantic keys;
- explicit direct versus legacy route selection;
- default-base participant collapse and explicit-base relation;
- modern blob route boundary at v20.0.0;
- direct boundary at v25.5.0 plus exact LIEF/SEA capability;
- ESM and ESM-cache version gates;
- CommonJS/ESM, snapshot/cache, asset, and argv request-mode classification;
- runtime-capability map and raw-view ownership;
- exact external-injector identity requirement;
- target-derived format/architecture/repair relations;
- candidate correctness versus distribution boundary;
- private same-parent staging, scoped children, final-mutation validation, digest recheck, and
  atomic-rename publication laws;
- independent evidence/support/implementation/certification judgments.

“Ship” here means the model and operation identity are ready for downstream design. It does not
mean runtime support is certified.

### 14.2 Defer

Defer until execution:

- every public version/host/target/architecture support cell;
- direct custom-build capability beyond exact probes;
- external injector candidate selection;
- all cross-target cells;
- ESM execution and ESM code-cache cells;
- snapshot/cache correctness and cache-rejection behavior;
- native addons;
- Linux arm64 postject/container hole resolution;
- raw-view lifetime wrapper proof;
- cancellation, descendant termination, cleanup, remnants, TOCTOU, Windows locks, and atomic
  publication;
- unchanged-consumer portable sealed-main proof.

### 14.3 Reject

Reject:

- one `buildSea` identity that hides direct versus legacy;
- fallback from direct to legacy;
- `getAsset*` as build operations;
- unpinned `npx postject` as an identity;
- version-range inference from one tag or upstream CI;
- any override of illegal/non-overridable relations;
- historical raw-JS injection as the modern operation;
- raw borrowed-view mutation;
- publication before correctness repair and validation;
- Developer ID signing, notarization, distribution containers, stapling, or Gatekeeper in R2;
- a provider-independent universal signing primitive.

## 15. Falsifiers and empirical probes

The most important falsifiers are deliberately executable:

1. **Route identity:** replace the direct builder with a marker and prove legacy is not launched;
   replace the injector and prove direct is not launched.
2. **Direct capability:** exact Node version passes but `--without-lief` binary refuses direct build.
3. **Default base:** adversarial `argv0` on v25.5/v25.6 versus corrected v25.7+ behavior.
4. **Builder/base:** equal, adjacent mismatch, same pathname with replaced bytes, same version custom
   builds, and SEA-disabled base.
5. **Mode boundaries:** v25.7 ESM, v25.8 ESM+cache refusal, v25.9 ESM+cache success, ESM+snapshot
   refusal, snapshot+cache canonicalization.
6. **Loader closure:** builtins, relative/package/absolute imports, dynamic imports, JSON, hooks,
   `createRequire`, and normal `require` property inventory.
7. **Assets:** missing/unreadable/symlinked/mutated inputs, duplicate keys, empty/large bytes,
   encodings, copied isolation, Blob behavior, raw-view lifetime.
8. **Injector:** exact offline identity, all formats, duplicate resource/fuse, signed base, malformed
   base, architecture mismatch, Linux arm64 native-addon/container case.
9. **Cross-target:** every proposed host/target route constructs, repairs, validates, and launches on
   the target; builder-host success alone is insufficient.
10. **Lifecycle:** interrupt before/during/after every child and write; ignored signals; descendants;
    cleanup failure; partial remnants; Windows locks.
11. **TOCTOU:** same-path/same-length replacement, symlink/rename swap, candidate replacement between
    validation/digest/rename.
12. **Publication:** concurrent readers never observe partial output; cross-device conditions are
    rejected; interruption after commit preserves the durable artifact.
13. **macOS repair:** signed/unsigned thin and fat bases; direct versus legacy; signature state before
    mutation, after mutation, after ad-hoc sign, after validation.
14. **Receipt:** observed capability does not imply support; admitted shape does not imply
    certification; every refusal has one owner/reason/phase.

No probe was implemented or executed in R2.

## 16. R3 / R4 / R5 handoffs

### R3 — minimum compatibility evaluator proof

R3 owns:

- exact provider implementation identity for direct Node, blob generator, base, and injector;
- direct capability presence/absence/timeout/indeterminate;
- builder/base relation in explicit direct and legacy modes;
- exact operation/lane/host/target deny holes;
- mode gates for direct, ESM, ESM cache, snapshot/cache, assets, argv extension;
- target format/architecture and candidate-repair eligibility;
- selected-command digest reauthentication between Layer acquisition and launch;
- injector offline/no-install behavior and finite candidates;
- non-overridable relation tests under `allowUntestedVersion`;
- target runtime smoke and exact support decision tables.

The evaluator must not infer ranges from the version ledger or admit upstream CI cells
automatically.

### R4 — lifecycle and author-primitive laws

R4 owns:

- private same-parent staging and authority;
- provider direct-write partial output and remnants;
- scope-borrowed blob authority after closure;
- child/descendant termination and reaping;
- cancellation cause preservation;
- cleanup failures;
- candidate containment and identity;
- same-length/rename/symlink/TOCTOU attacks;
- Windows locks;
- final digest recheck;
- atomic publication and post-commit interruption.

The Node direct command's own direct write is precisely why the config output must be redirected to
a private candidate.

### R5 — portable-role proof

R5 owns unchanged-consumer proof for the strict Node sealed-main role:

- producer output content identity;
- CJS and ESM;
- Node target;
- built-in, bundled, external, dynamic, JSON, and native-addon classifications;
- assets only when explicitly negotiated by the role;
- mutation/TOCTOU and all applicable hosts;
- independent provider-native capability remains available without broadening the portable role.

A failing provider must not cause the role to be weakened. `createRequire`, raw asset views,
snapshots, and execution-argument extension remain provider-native unless a separate truthful role
is proved.

## 17. R9 boundary

R9, not this dossier, owns credential-backed Developer ID Application/Installer work, hardened
runtime and entitlements, nested signing, `.app`, ZIP, DMG, `.pkg`, notarization, stapling,
Gatekeeper, quarantine, submission recovery, and no-blind-retry semantics.

R2 hands R9 only a validated executable candidate and exact provenance. It does not invent a
universal signing request or pre-commit to a distribution container.

## 18. Unknowns retained

The following remain intentionally unknown rather than guessed:

- which exact direct Node builds and custom build configurations will be admitted;
- whether equal-version custom builder/base pairs are always compatible;
- exact supported host/target/architecture coordinates;
- cross-target macOS repair topology outside macOS;
- finite external injector candidate(s), versions, digests, and offline acquisition policy;
- exact direct versus legacy behavior on already-injected or multiply signed bases;
- cancellation and descendant behavior of Node, injector, codesign, and validators;
- partial output/remnants under crashes or filesystem errors;
- ESM/cache/snapshot behavior outside exact source boundaries;
- native-addon ABI/temp-file/cleanup cells;
- raw-view wrapper lifetime after process/scope closure;
- macOS x64 SEA support given current upstream CI omission;
- whether future Node tags change ESM snapshot, import.meta.resolve, code-cache dynamic import, or
  resource contracts.

Each unknown has a falsifier and probe in `ATOMIC-CLAIMS.csv`.

## 19. Production-scope receipt

This research changes documentation only under:

```text
research/post-0.3/reconciliation/r2/node-sea/
```

The intended repository files are exactly:

```text
ATOMIC-CLAIMS.csv
PROVIDER-OPERATIONS.csv
EVIDENCE-COORDINATES.csv
REPORT.md
MANIFEST.sha256
```

No production code, packages, plans, workflows, tests, exports, lockfiles, shared corpus files,
`AGENTS.md`, release configuration, tags, settings, or publications are changed. No runtime probe,
workflow, release, merge, or force-push is authorized or claimed.

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

Only `operation` rows receive the complete semantic identity:

```text
provider / operation / lane / lifecycle
/ {resource-result, output-publication}
```

Evidence coordinates remain separate. The tables do not infer public support from source existence
or exact execution.

### 2.2 Independent judgments

For each row, the dossier separates:

- evidence provenance;
- validity of the semantic interpretation;
- public support/admission;
- priority;
- implementation status;
- certification status;
- recommendation (`ship | defer | reject`).

This prevents “documented upstream” from becoming “supported by effect-build” and prevents one
historical receipt from becoming a range.

## 3. Direct `--build-sea`

### 3.1 Availability boundary

Built-in SEA generation via `--build-sea` was introduced in Node 25.5.0 by commit
`b351910af1a783052d4578f13be1a1af713f6511`. It adds LIEF as the in-core binary mutation engine.
A Node binary may still lack direct-build capability if it was built without LIEF or without SEA.
Version alone is therefore insufficient; the exact selected binary must expose the required
capability.

Node v26.7.0 is the current reference tag for this dossier. Maintained Node v24.19.0 and v22.23.2
document only the older preparation-blob/external-injector flow, not `--build-sea`.

### 3.2 Default base versus explicit base

The direct config's optional `executable` field creates two modes:

- **default-base mode:** omit `executable`; builder and base collapse to the selected running Node
  executable. A v25.7.0 fix changed default-base resolution to the actual executable path rather
  than arbitrary `argv[0]`.
- **explicit-base mode:** supply `executable`; builder and base are separate participants. The Node
  same-version relation applies and must be evaluated before provider work.

Builder/base equality is not a universal SEA relation. It applies when separate participants exist:
legacy injection always, and direct explicit-base mode. The participant-collapsed direct default
has no separate equality check to perform.

### 3.3 Direct mutation behavior

Node's v26.7.0 source reads the selected base into memory, generates the SEA blob, mutates PE,
Mach-O, or ELF with LIEF, marks the sentinel, writes the config-selected output, and copies source
mode bits. The Mach-O path removes an existing code signature before rebuilding the candidate.

That native direct write must not be pointed at the caller's durable destination in the effect-build
adapter. The adapter should supply a private same-parent candidate as Node's `output`, then perform
all wrapper-owned repair/validation/digest steps and publish with one final atomic rename.

## 4. Legacy blob generation and injection

### 4.1 Modern blob route boundary

The modern JSON-based SEA preparation blob / `NODE_SEA_BLOB` contract was introduced in Node 20.0.0
by commit `491a5c968fd4e72e87f460cb583004dde10f4bbd`. This is the legacy route relevant to current SEA.

The initial Node v19.7/v18.16 raw `NODE_JS_CODE` injection protocol is a different historical
identity. It must not be silently treated as the current legacy route or used as fallback.

### 4.2 Blob generation

`node --experimental-sea-config <config>` remains documented in v26.7.0 for dumping the preparation
blob, and it is the principal construction route on maintained v24/v22 lines. The output is an
intermediate, not a final executable. In effect-build it should remain scope-borrowed/private and be
cleaned after injection or failure.

### 4.3 Injection

The modern blob is injected into a copied base using format-specific semantics:

- PE: resource `NODE_SEA_BLOB`;
- Mach-O: section `NODE_SEA_BLOB` in segment `NODE_SEA`;
- ELF: note `NODE_SEA_BLOB`;
- the `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2:0` sentinel becomes `:1`.

Node documents postject as an example, but an effect-build operation may not depend on unpinned
`npx postject`. The injector is a selected command with an exact observable identity and bounded
capability/format support. Candidate injector products and exact support cells remain R3 work.

The legacy path is therefore not one operation. Blob generation and injection have different
results and ownership and remain separate identities.

## 5. CommonJS and ESM main support

### 5.1 CommonJS

CommonJS is the historical and default injected main format. The injected `require()` is not
ordinary file-backed CommonJS `require`; by default it loads built-ins only and exposes only
`require.main` from the ordinary `require` property surface. `__filename` and `module.filename`
resolve to `process.execPath`; `__dirname` resolves to its directory.

### 5.2 ESM

ESM SEA mains were introduced for Node 25.7.0 from commit
`2d874dfb8e079e73fcc313b46b8dd5de37ad9b07` / PR 61813. The corresponding configuration uses
`mainFormat: "module"`. Maintained v24.19.0 and v22.23.2 remain CommonJS-only in their versioned SEA
docs.

ESM supports built-in static imports, top-level await, built-in dynamic `import()`, and injected
`import.meta` main/path facts. `import.meta.resolve` remains unsupported in the v26.7.0 reference.
Filesystem/package module loading remains outside the default loader unless the application
explicitly creates file-backed loading with `module.createRequire()`.

ESM is therefore a version-gated request mode, not a separate provider operation.

## 6. Module-loading restrictions

The provider-native SEA domain is intentionally broader than the strict portable sealed-main role,
but the loader restrictions are still real:

- injected CJS and ESM default loading do not resolve ordinary filesystem/package modules;
- built-ins are available;
- filesystem/package loading can be reintroduced explicitly with `module.createRequire()`;
- ESM dynamic import loads built-ins, not ordinary filesystem modules, in the current reference;
- source-relative asset expectations do not magically become embedded files;
- native addons require explicit asset extraction and `process.dlopen()`.

The direct Node SEA operation should preserve these native capabilities and failures. R5 may select
a narrower portable role; R2 must not erase the provider-native surface to make that role simpler.

## 7. Assets and runtime lookup

### 7.1 Build-time asset configuration

The `assets` config map embeds logical key → source-path bytes during SEA construction. Assets are a
request mode/modifier of the assembler operations, not their own build operation.

### 7.2 Runtime capabilities

Inside a SEA, `node:sea` exposes:

- `isSea()`;
- `getAsset(key, encoding?)` — copied `ArrayBuffer` or decoded string;
- `getAssetAsBlob(key, options?)` — Blob;
- `getRawAsset(key)` — no-copy `ArrayBuffer` view into embedded bytes;
- `getAssetKeys()` — logical keys.

These are runtime capabilities, not selected-command provider operations.

### 7.3 Ownership

`getRawAsset()` is distinct from the copied forms. Node warns callers not to write through the raw
view because the mapped section may be unwritable or unaligned and writes can crash. The truthful
R2 classification is therefore `runtime-borrowed-view`; effect-build must not elevate it to a
caller-owned mutable buffer. Exact lifetime behavior remains empirical and belongs in R4.

## 8. Code cache and startup snapshot

### 8.1 Snapshot

`useSnapshot` was added in Node 20.6.0. It materially changes lifecycle: the main is executed during
preparation and must install a deserialize-main function for final launch. It is a request mode with
its own legal-state matrix, not a generic optimization boolean.

ESM + snapshot remains illegal in v26.7.0.

### 8.2 Code cache

CJS SEA code cache was added in Node 20.6.0. ESM SEA code cache support was added later in Node
25.9.0 by commit `9ff27fdb014c21e869966ffcd053c8e2d872d8c3`.

The code cache is V8/platform-sensitive. Cross-target construction must set both snapshot and code
cache false. Node documentation still states that `import()` does not work with code cache; exact
format/version behavior and cache rejection remain runtime-probe work.

### 8.3 Snapshot plus code cache

Current source warns that `useCodeCache` is redundant with `useSnapshot`. An adapter must not report
both as independently active. R3 must select an explicit normalization/refusal rule for that
ambiguous caller state rather than silently preserving an impossible semantic combination.

## 9. Execution-argument policy

`execArgv` embeds Node execution arguments. `execArgvExtension` controls later extension:

- `none` — embedded arguments only; ignore `NODE_OPTIONS`;
- `env` — allow `NODE_OPTIONS`; current Node default;
- `cli` — parse `--node-options=<...>` at SEA launch.

These are request/runtime policy modes. They are not separate operations. The provider wrapper
should preserve them explicitly and not invent one normalized portable execution-arguments model.

R3 must execute exact quoting/eligibility/precedence cases and decide whether effect-build's own
public default should expose Node's `env` default or require callers to choose explicitly.

## 10. Builder/base, injector, host/target, and architecture relations

### 10.1 Builder/base

Node's documented rule is same Node version between blob builder and injected base. Historical
recorded execution also includes an unequal-version failure. R2 retains it as a non-overridable
relation only where participants are actually separate.

Equal version is necessary but documentation does not prove that every custom same-version build is
interchangeable. Complete binary/build identity and capabilities remain R3 inputs.

### 10.2 Base capability

A base must contain the applicable SEA support/resource/fuse contract. A version string cannot make
a custom SEA-disabled Node executable injectable. R3 therefore needs explicit base capability
observation/refusal.

### 10.3 Injector identity

The legacy injector is independently selected. It is not “Node” and not a hidden package-manager
sub-operation. Its identity, offline availability, supported formats/architectures, and known holes
are compatibility facts. No install/download/fallback is permitted.

### 10.4 Host and target

Node documentation allows cross-platform SEA generation when snapshot and code cache are disabled,
but this does not prove every build-host / target-format / architecture cell. Direct `--build-sea`
can read an explicit base binary and uses LIEF to parse ELF, PE, and Mach-O; that source shape is not
an execution certificate.

The target is therefore derived from the actual selected base/native candidate, not a free generic
triple. Every proposed cross-target cell remains deferred until R3/R4 execution proves construction,
repair, structural validation, target launch, and publication.

## 11. Target-specific candidate correctness repair

This R2 dossier contains only **candidate correctness repair required before first publication**.
It explicitly excludes distribution trust.

### 11.1 macOS

SEA construction mutates Mach-O bytes and invalidates/removes signatures. Node's documented flow
applies an ad-hoc signature with `codesign --sign -` after final SEA construction. The direct
v26.7.0 LIEF path itself removes an existing code signature while mutating Mach-O.

The correct provider pipeline is:

```text
construct/mutate staged candidate
-> remove stale signature before mutation when the selected route requires it
-> finish all SEA content mutation
-> apply only the ad-hoc correctness signature proven necessary for a runnable Mach-O
-> structurally/signature validate
-> digest/recheck
-> atomic publish
```

This signing step makes no Developer ID or distribution-trust claim. Where no target-specific
correctness repair is required, the repair stage is a no-op.

### 11.2 Windows

Node says Windows signing is optional for running the SEA. Certificate signing is therefore not a
universal candidate-correctness step. It belongs to distribution/trust work, outside R2.

### 11.3 Cross-target macOS

A non-macOS build host cannot simply be assumed able to finalize a macOS candidate. If the target
requires a correctness repair unavailable on the current host, the cell is unsupported unless the
architecture explicitly models a later compatible-host correctness-finalization stage. R2 records
the relation but does not claim a cross-host signing proof.

## 12. Distribution/trust boundary

The following are **not Node SEA R2 operations**:

1. Developer ID / distribution-trust signing;
2. notarization;
3. `.app`, ZIP, DMG, or installer-package construction;
4. stapling;
5. Gatekeeper assessment.

Those are R9. R2 must not import them into `effect-build-node-sea`, and it must not create a
universal signing abstraction. Candidate correctness and distribution trust have different
credentials, lifecycle, mutation, result, and failure laws.

## 13. Legal and illegal states

### 13.1 Legal source states, subject to exact version/capability gates

- modern legacy CJS blob generation/injection from Node 20.0.0 onward;
- direct construction from Node 25.5.0 when the selected binary includes LIEF/SEA support;
- direct default-base and explicit-base modes;
- CJS mains;
- ESM mains from Node 25.7.0;
- assets from their documented introduction boundary;
- snapshot on supported CJS lines;
- CJS code cache from Node 20.6.0;
- ESM code cache from Node 25.9.0;
- execArgv/extension modes on lines containing those features;
- filesystem loading deliberately created through `module.createRequire()`;
- native-addon extraction only as an explicit provider-native application behavior.

### 13.2 Illegal or unsupported-by-construction states

- direct `--build-sea` before v25.5.0;
- direct build with a Node binary lacking LIEF/SEA capability;
- modern blob route before v20.0.0;
- `mainFormat=module` before v25.7.0;
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

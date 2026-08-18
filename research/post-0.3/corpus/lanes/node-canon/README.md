# effect-build Node canon research

**Repository observed:** `mannyc2/effect-build`  
**Draft PR:** `#4`  
**Research branch:** `codex/post-0.3-native-capability-architecture`  
**Observed live head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Observed live base branch head:** `15c811bb9904142a33d119766b62082f3c689f13`  
**GitHub observation time:** `2026-08-17T15:23:57Z`  

## Evidence legend

Every material statement in this package is classified as one of:

- **GITHUB-DIRECT** — current repository, ref, PR, workflow, source, or check data read directly through GitHub.
- **UPSTREAM-DIRECT** — an official upstream contract, declaration, source repository, or documentation page.
- **RECORDED-EXECUTION** — an execution result recorded by GitHub Actions or another preserved receipt. It is scoped to the exact recorded command, versions, fixture, host, and commit.
- **INFERENCE** — a conclusion derived from direct evidence, with its assumptions stated.
- **PROPOSAL** — a recommended effect-build domain/API decision, not an existing contract.
- **UNKNOWN** — a question that requires future source inspection or execution.

The package does **not** claim executable certification. No provider was run during this assignment. Archive verification proves only that the authored files are internally intact.

## Executive verdict

**PROPOSAL — reject the current Candidate C2 representation as the final canon.** A borrowed file plus `format`, `resolutionTarget: "node"`, and `externalImportObservations` is too permissive for Node SEA. Current Node SEA's injected main uses a special loader that, by default, loads built-in modules but not ordinary filesystem or package modules. Observing an external import does not make it loadable. `node --check` proves syntax, not loader closure, package resolution, asset availability, API compatibility, main-entry behavior, or SEA configuration legality. [NODE-SEA-26] [NODE-CLI-26] [GH-NODE-CANON-PROBE]

**PROPOSAL — recommend a negotiated, sealed `NodeMain` capability for the default-loader, asset-free SEA subset.** Its semantic value is one authenticated JavaScript **main** snapshot, bound to an exact assembler offer, with a closed finite set of literal Node built-in loads and no remaining package, local-module, JSON-module, native-addon, emitted-asset, auxiliary-file, or unresolved code-loading edge.

The smallest useful profile is:

```text
protocol:  effect-build/NodeMain@2
profile:   effect-build/NodeMain/sea-default-loader@1
role:      main
format:    commonjs | module
content:   borrowed authenticated content snapshot
agreement: exact Node release + system target + SEA feature offer
closure:   finite literal built-ins only; no dynamic import
assets:    none
addons:    none
snapshot:  false
codeCache: false
```

This is a **semantic profile**, not a claim that all Node programs are reducible to one file. Richer cases stay provider-native or receive a distinct future profile.

## Exact answers

### 1. What exact domain does `NodeMainProgram` promise?

**PROPOSAL.** Given a source request and a previously negotiated assembler offer, `NodeMainProgram` produces, within a borrowed lifetime, one authenticated JavaScript main snapshot that:

1. is explicitly CommonJS or ESM;
2. is intended for direct main execution, not importable-module equivalence;
3. is accepted against one exact Node release and system target agreement;
4. has no emitted JavaScript chunks or packaging-coupled side files;
5. has no runtime code-loading edge except a finite, normalized set of literal Node built-ins; and
6. preserves an audit envelope identifying the producer profile and ordered build observations.

It does **not** promise hermetic application behavior. Network access, environment variables, user-supplied files, subprocesses, and other ordinary runtime inputs remain application semantics. It promises packaging/load closure, not a sandbox.

### 2. What exact input domain can Node SEA truthfully accept?

**UPSTREAM-DIRECT.** Current Node SEA is a sum of modes, not “any JavaScript file”:

- one injected CommonJS or ESM script;
- optional assets exposed through `node:sea`;
- optional startup snapshot and code cache subject to restrictions;
- explicit execution-argument policy;
- a selected Node executable and output path;
- a same-version relation between the Node binary that creates the preparation data and the binary receiving it;
- platform signing steps where required for a distributable result.

The injected loader is special. By default, `require`, static `import`, and `import()` can load built-ins, but not ordinary filesystem or package modules. Filesystem loading is an explicit opt-in through `module.createRequire()`. ESM cannot be combined with snapshots; `import()` does not work with code cache; cross-platform snapshots/code cache are unsafe; native addons require explicit asset/extraction handling. [NODE-SEA-26]

**PROPOSAL.** The unchanged portable consumer should use only the strict intersection: one main, no assets, no snapshot, no code cache, fixed execution-argument policy, exact binary/version agreement, temporary output, validation, and atomic publication.

### 3. What information must survive producer-to-assembler composition?

**PROPOSAL.** The protocol/profile identity; main role; exact format; authenticated content size and digest; borrowed lifetime; target-agreement identity and normalized exact Node/system target; normalized built-in requirements; closure profile; producer profile/version; ordered tool/build-step observations; and compatibility state. Raw producer metafiles may survive as opaque evidence, but they are not the semantic contract.

### 4. Which states should be impossible to construct?

Through supported constructors and adapters—not against malicious casts—the strict profile must make these states unrepresentable:

- external package/local/JSON/native-addon imports under a built-ins-only profile;
- assets or chunks under an asset-free one-main profile;
- unknown protocol or profile major versions;
- `role: "importable"` paired with this main profile;
- ESM paired with a CommonJS SEA configuration, or vice versa;
- an expired or digest-changed borrow presented as current content;
- an output bound to one target agreement consumed by another;
- snapshot or code-cache configuration silently enabled;
- unresolved or opaque code-loading observations treated as admissible;
- an unverified raw producer path handed directly to SEA.

### 5. Which checks happen before provider work or destination mutation?

**Before producer provider work:** protocol/profile negotiation, exact target offer, role/format support, producer/assembler capability intersection, destination policy and path-alias checks, and rejection of unsupported optional features.

**Before SEA provider work:** acquire the borrow, copy/materialize into private staging while hashing, verify size/digest/liveness/agreement, validate the producer's sealed closure witness, perform exact-format syntax parsing with the offered Node executable, and reject any observations that require a richer profile. Syntax parsing is only one check.

**Before destination mutation:** enforce builder/base Node identity and version, generate into a same-parent temporary candidate, inspect native format/architecture/runtime observations, complete required signing/verification, optionally hash, then atomically rename. No durable destination is touched before all earlier gates succeed.

### 6. Can an esbuild-produced main and Bun-produced main satisfy one unchanged consumer?

**PROPOSAL — yes, conditionally.** Both adapters can mint the same sealed profile for the subset they can actually prove. The generic consumer branches on neither producer. The adapters must differ internally:

- esbuild's `platform: "node"` and `target` help with Node resolution and syntax lowering, but `target` does not polyfill APIs and externals/assets may remain;
- Bun's `target: "node"` selects Node behavior, but Bun documents that it does not down-convert syntax, so the exact offered Node parser is an essential postcondition;
- both must emit exactly one JavaScript entry, no chunks/assets, no non-built-in external, and no opaque loading construct.

The branch's current probe uses `packages: "external"`; any actual package external observed under that setup must be rejected for the strict SEA profile, not merely recorded. [ESBUILD-API] [BUN-BUNDLER] [GH-NODE-CANON-PROBE]

### 7. How should Node target compatibility be negotiated with the assembler?

**PROPOSAL.** The assembler publishes an immutable offer before producer work:

```text
exact Node release
exact system target
accepted main formats
SEA feature policy
normalized built-in/feature inventory
opaque agreement identity
```

The producer accepts or rejects that offer and binds the emitted `NodeMain` to its agreement identity. The assembler rejects any other identity before SEA work. Exact parser compatibility is checked with the offered Node executable. The assembler privately enforces the same-version builder/base-binary law. A blind producer setting such as `target: node18` is not sufficient negotiation.

### 8. Is `NodeSourceExecutable` a profile, recipe, ordinary function, or unnecessary name?

**PROPOSAL.** It is ordinary scoped Effect composition. It introduces no independent domain object, protocol, interpreter, or algebra. Prefer a plainly named function such as `NodeMainExecutable.fromProgram` or `assembleNodeMainProgram`. Retaining `Recipe/NodeSourceExecutable` is acceptable only as a discoverability alias documented as an ordinary convenience function; it should not imply a new architectural category.

### 9. What other executable compositions remain provider-native?

Bun runtime compilation; Deno compile with its module graph, embedded files, virtual filesystem, and extraction policy; Node SEA assets, snapshots, code cache, execution arguments, native addons, and signing; `@yao-pkg/pkg` project/package traversal and runtime acquisition; ncc-style asset relocation; Rollup/Rolldown plugin graphs, code splitting, and multi-output applications; and importable package/library publication. These are valid products, but not the strict `NodeMain` canon. [BUN-EXECUTABLES] [DENO-COMPILE] [NODE-SEA-26] [PKG-GUIDES] [NCC-REPO]

### 10. What evidence would falsify the proposed canon?

The proposal is falsified or must be revised if official Node changes make the default SEA loader perform ordinary package/filesystem resolution; if two correct adapters mint the same profile but diverge under the same agreement; if a producer exposes an authoritative complete closure certificate that makes a normalized graph smaller and more truthful; if assets/addons are shown to be inseparable from the minimum useful cross-producer domain; if authenticated staging fails mutation/TOCTOU tests; if exact target negotiation still permits syntax/API divergence; or if a generic consumer requires producer-specific branches. The complete list and required future executions are in `falsifiers-and-open-questions.md`.

## Recommendation in one sentence

Adopt a **sealed, authenticated, exact-target `NodeMain` main capability for the asset-free Node SEA default-loader subset**, and leave richer executable semantics provider-native until each richer profile has its own honest sum type and evidence.

## Package map

- `node-sea-admissibility.md` — exact Node SEA domain and the strict admissibility predicate.
- `node-main-domain-model.md` — recommended representation and every requested field decision.
- `legal-and-illegal-states.md` — constructible and rejected state matrix.
- `producer-assembler-negotiation.md` — target offer/agreement and validation order.
- `import-and-asset-classification.md` — complete import/resource taxonomy.
- `composition-api-candidates.md` — five competing canonical models and recommendation.
- `adversarial-examples.md` — counterexamples against regex/metafile/`node --check` reasoning.
- `recorded-execution-audit.md` — what current GitHub evidence does and does not record.
- `evidence-ledger.json` — machine-readable evidence and claim classifications.
- `source-bibliography.md` — exact source locators.
- `falsifiers-and-open-questions.md` — disproof criteria and future execution matrix.
- `live-github-state.json` — live GitHub snapshot used by this package.
- `manifest.sha256` — SHA-256 manifest for every payload file except itself.

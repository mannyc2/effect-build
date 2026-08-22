# Producer–assembler negotiation

## Why negotiation precedes production

A producer option such as `target: "node"` or even `target: "node18"` is not the final consumer contract:

- Bun's Node target selects a runtime environment but does not down-convert syntax. [BUN-BUNDLER]
- Esbuild's target controls syntax transformation and warnings, not runtime API polyfills. [ESBUILD-API]
- Rolldown separates platform, format, code-splitting, external, and syntax-target controls. [ROLLDOWN-DOCS]
- Rollup core does not itself define one exact Node platform/runtime target; resolution and transformations commonly come from plugins. [ROLLUP-CONFIG] [ROLLUP-PLUGINS]
- SEA binds preparation and injected binary versions and changes module loading. [NODE-SEA-26]

Therefore the assembler must advertise the runtime it will actually embed before the producer emits code.

## Proposed protocol

### 1. Assembler offer

**PROPOSAL.** The selected `NodeMainExecutable` assembler exposes an immutable offer:

```text
protocol/profile versions accepted
exact Node release
exact system target
accepted main formats
default-loader profile support
normalized built-in/feature inventory
SEA policy:
  assets = none
  snapshot = false
  codeCache = false
  exec-argument extension policy fixed
opaque agreement identity
```

The offer is a semantic capability, not merely an options object. Its identity changes when any compatibility-relevant term changes.

### 2. Producer acceptance

The producer adapter receives the source request plus offer. It either rejects before invoking Bun/esbuild/Rolldown/Rollup or selects a legal provider configuration. The producer cannot silently weaken the offer.

Examples:

- requested ESM but assembler accepts only CJS → reject before provider work;
- source requires a Node feature absent from exact release → reject before provider work when statically known;
- producer cannot guarantee one output/no assets under configured plugins → reject before provider work;
- producer only supports generic Node syntax and exact parser validation is unavailable → reject.

### 3. Bound output

The returned `NodeMain` carries the agreement identity and normalized exact target facts. The assembler checks identity equality before acquiring content. This prevents a main produced for one offer from being silently consumed by another assembler instance.

## Producer adapters

### Bun

**UPSTREAM-DIRECT.** Bun's bundler supports a Node target, ESM/CJS formats, splitting, externals, package externalization, metafiles, multiple output kinds, asset loaders, and plugins. Bun documents that it does not down-convert JavaScript syntax. [BUN-BUNDLER]

**PROPOSAL.** A strict Bun adapter may mint the profile only when it intentionally configures and validates:

- one entrypoint;
- target Node;
- exact requested format;
- splitting disabled;
- no external package mode;
- no non-built-in externals;
- no emitted chunks/assets/sourcemaps required by runtime;
- no compile-to-Bun executable mode;
- no opaque plugin/loader behavior capable of hiding runtime loads;
- exact offered Node syntax parse after production.

A Bun output that passes these gates can satisfy the same consumer as esbuild. A generic `target: "node"` result cannot.

### Esbuild

**UPSTREAM-DIRECT.** Esbuild's `platform: "node"` changes defaults and resolution behavior; `target` transforms syntax but not APIs; external packages remain runtime dependencies; splitting and file loaders can create chunks/assets; metafiles report the graph known to esbuild. [ESBUILD-API]

**PROPOSAL.** A strict esbuild adapter may mint the profile only when it intentionally configures and validates:

- bundle enabled;
- one entrypoint;
- platform Node;
- exact CJS/ESM format;
- exact Node target corresponding to the offer;
- splitting disabled;
- packages bundled, except recognized built-ins;
- no file/copy loader outputs or runtime side files;
- no unsupported dynamic loading/asset idioms left in the final bytes;
- exactly one JavaScript entry output;
- exact offered Node syntax parse.

The esbuild target is helpful evidence but does not replace feature negotiation.

### Rolldown

**UPSTREAM-DIRECT.** Rolldown has explicit platform, format, target, external, module-type, code-splitting, and output-chunk contracts. Code splitting can be enabled by default; plugins can change resolution/loading; disabling splitting can alter dynamic-import execution order. [ROLLDOWN-DOCS]

**PROPOSAL.** A strict Rolldown adapter must deliberately disable code splitting, restrict plugins/module types, reject assets and non-built-in externals, and validate one entry. Its existence would be architecturally valid even without current product adoption.

### Rollup

**UPSTREAM-DIRECT.** Rollup preserves declared externals, emits chunks/assets, can inline dynamic imports into one bundle, and delegates common Node resolution/CommonJS/JSON behavior to official plugins. [ROLLUP-CONFIG] [ROLLUP-PLUGINS]

**INFERENCE.** Rollup is a genuinely different producer because the exact Node platform/target contract is assembled from core options and plugins rather than one native `platform: "node"` switch. A conforming adapter is possible only with a fixed, evidence-backed plugin/configuration profile. “Rollup output” alone is not enough.

### ncc

**UPSTREAM-DIRECT.** `@vercel/ncc` targets Node applications and can relocate assets, producing JavaScript plus asset outputs. [NCC-REPO]

**INFERENCE.** ncc may satisfy the strict profile only for builds with no required emitted assets or native additions. Its asset-aware output is a useful comparison showing why “single entry JavaScript” and “complete application” are different domains.

## `@yao-pkg/pkg` boundary

**UPSTREAM-DIRECT.** `@yao-pkg/pkg` documents standard patched-Node and enhanced-SEA modes, target triples, ESM behavior, project/package traversal, and native-addon handling. [PKG-GUIDES]

**PROPOSAL.** Treat it as a narrower executable-packaging comparison only. It does not establish that the smallest producer-to-assembler canon should contain package graphs, hidden runtime acquisition, assets, or addon policy. A future `pkg` adapter can consume the strict `NodeMain` only if its selected mode accepts already-sealed content without introducing hidden acquisition or divergent runtime semantics.

## Validation ordering

### Before any producer provider work

1. Resolve protocol/profile versions.
2. Select assembler and obtain offer.
3. Check requested format and exact target compatibility.
4. Check source request uses only the portable adapter's allowed options.
5. Reject plugins/loaders/features whose closure cannot be sealed.
6. Validate destination lexical/canonical policy and input/destination overlap where known.

### After producer work, before returning `NodeMain`

1. Validate provider success and diagnostics.
2. Validate exactly one JavaScript entry output.
3. Reject chunks, runtime assets, native addons, and required side files.
4. Normalize and validate every reported external; reject non-built-ins.
5. Parse/classify final code using an AST-capable check, not regex alone.
6. Reject `createRequire`, computed loaders, eval-generated loaders, opaque plugin helpers, source-relative asset patterns, and unresolved observations.
7. Parse with the exact offered Node in the selected format.
8. Acquire/copy content, compute mandatory size/digest, then seal capability.

### Before any SEA provider work

1. Check agreement identity and exact target.
2. Acquire the live borrow.
3. Materialize a private snapshot while hashing.
4. Verify size/digest and format.
5. Re-run cheap exact-format syntax/preflight checks on staged bytes.
6. Enforce fixed strict SEA configuration.
7. Enforce exact builder/base Node relation.

### Before durable destination mutation

1. Generate into private same-parent staging.
2. Verify output exists and is one file.
3. Inspect native format, OS, architecture, and runtime observations.
4. Run bounded launch probe only in future execution work where host/target permits; do not claim it from static research.
5. Complete signing and verification when policy requires.
6. Compute requested digest.
7. Atomically rename once.

## Can Bun and esbuild share one unchanged consumer?

**PROPOSAL — yes, for the sealed intersection.** The unchanged consumer sees only `NodeMainProgram` and `NodeMainExecutable`. Provider-specific logic is confined to Layers/adapters. It is not enough that one fixture from each producer prints the same text. The proof obligation is that every value the adapter can return satisfies the same profile laws and adversarial rejection matrix.

A counterexample from either adapter—such as a hidden package external accepted under the same profile—falsifies that adapter and may falsify the profile if the state cannot be excluded without producer-specific consumer branching.

## Compatibility observations versus target agreement

Ordered build-step observations remain useful:

```text
Bun 1.3.14 command, strict tested range
esbuild 0.28.2 API, strict tested range
Node 26.7.0 SEA assembler, strict tested range
```

They are historical/audit data. The target agreement is the live semantic compatibility relation. An untested override can be recorded, but it must not bypass closure, content, target, native inspection, signing, or publication checks.

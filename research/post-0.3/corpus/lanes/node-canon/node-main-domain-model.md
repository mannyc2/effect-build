# Node main domain model

## Recommended model: negotiated sealed main capability

**PROPOSAL.** `NodeMain` should be an opaque borrowed capability, not a public bag of independently optional fields. The following is descriptive pseudotype, not implementation code:

```text
NodeMain =
  protocol: "effect-build/NodeMain@2"
  profile:  "effect-build/NodeMain/sea-default-loader@1"
  role:     "main"
  format:   "commonjs" | "module"

  targetAgreement:
    id: opaque agreement identity
    nodeVersion: exact release
    systemTarget: exact OS/architecture/ABI target

  loadClosure:
    kind: "finite-literal-builtins-only"
    builtins: normalized, unique, sorted node: specifiers
    dynamicImport: "none"

  content: BorrowedAuthenticatedContent
    declaredByteLength
    declaredSha256
    acquire -> exclusive authenticated snapshot | Expired | Changed

  evidence:
    producerProfile
    producerVersion
    ordered build-step observations
    compatibility observations
    optional opaque provider observations
```

Only trusted profile constructors/adapters may mint the opaque capability. The assembler still revalidates every property it can observe.

## Domain boundary

`NodeMainProgram` is not “bundle JavaScript.” It is:

> Produce one directly executable Node main whose packaging-time code and resource closure is already reduced to one authenticated JavaScript snapshot compatible with the exact negotiated Node SEA default-loader profile.

That boundary deliberately permits normal runtime application interactions. A program may read a path supplied by a user, make network requests, inspect environment variables, or spawn an executable. The canon does not promise hermeticity or universal runtime success. It rejects **packaging-coupled** dependencies that the executable assembler would otherwise need to discover or preserve.

## Decision for every requested dimension

| Dimension | Must `NodeMain` represent it? | Decision |
|---|---:|---|
| Atomic bytes or file acquisition | Yes, semantically | Represent authenticated content acquisition, not a raw path-vs-bytes union. File, bytes, stream, or provider buffer are transport strategies behind the capability. Acquisition yields an exclusive snapshot or verified private materialization. |
| Authenticated content identity | Yes | Byte length plus SHA-256 are mandatory. This authenticates equality to the producer observation; it is not a publisher signature or provenance attestation. |
| Borrowed lifetime and mutation detection | Yes | Acquisition after scope exit returns `Expired`; changed source content returns `Changed`. The assembler copies/materializes while hashing before SEA work. |
| ESM versus CommonJS | Yes | Required sum discriminator. SEA injects them under different environments. Never infer format from filename or syntax at assembly time. |
| Exact Node runtime and syntax target | Yes, through agreement | Bind to an exact Node release offer. Esbuild-style syntax targets are producer controls, not the final compatibility fact. Parse with the offered Node; negotiate built-in/features separately. |
| Target platform and architecture | Yes, through agreement | Bind to the exact assembler system target. Native-free producer output may accept many offers, but every produced value is tied to the selected one. ABI matters when applicable; strict profile excludes addons. |
| Built-in imports | Yes | Normalize to canonical `node:` specifiers, unique and sorted. Validate against the offered Node inventory/features. Literal `require("fs")` may normalize to `node:fs`. |
| Package imports and external dependencies | Represented by exclusion | Strict profile guarantees none remain. A list of observations is too weak because default SEA cannot load them. A richer filesystem-backed profile would need package acquisition and resolution authority. |
| Static imports | Yes as closure classification | Local/package static imports must be bundled away. Remaining static imports may name only built-ins. |
| Dynamic imports | Excluded in v1 strict profile | Even literal built-in dynamic imports add format/code-cache branches. A future explicit profile can permit finite literal built-ins with code cache fixed false. Computed dynamic imports remain outside. |
| JSON modules | Excluded at runtime | JSON may be transformed/inlined into JavaScript bytes. A surviving JSON import or `require` is illegal. |
| Native addons | Excluded | They require target ABI, asset embedding, extraction, cleanup, and `dlopen` semantics. Use a richer provider-native composition. |
| Unresolved imports | Excluded | Any unresolved or provider-marked external non-builtin is a typed incompatibility, not an observation-only success. |
| Assets and auxiliary files | Excluded from strict profile | Producer side outputs, source-relative reads, sourcemaps required at runtime, WASM, and copied files require a resource graph or SEA asset mapping. |
| Main-entry versus importable-module semantics | Yes | Fix `role: "main"`. The profile makes no importable equivalence claim. |
| Producer profile and provider observations | Yes, as evidence | Preserve exact profile/version and optional opaque provider data. Do not let raw metadata substitute for the semantic closure guarantee. |
| Ordered build-step and compatibility observations | Yes, as evidence | Preserve non-empty order, tool identity/version/path observation, and strict/override state. They explain how bytes were produced without changing their semantic type. |
| Protocol identity and negotiation | Yes | Protocol/profile major and target-agreement identity are mandatory. Unknown or mismatched identities fail before provider work. |

## Authenticated content, not a public file/bytes union

The current planned `NodeMainExecutable.Request` accepts public `File | Bytes` inputs. That is appropriate for the direct Node SEA provider command, but it is not the best canonical producer-to-assembler boundary.

A public union creates redundant validation branches:

- path existence, canonicalization, containment, mutation, permissions, and TOCTOU for files;
- ownership, aliasing, mutable typed arrays, and source naming for bytes;
- duplicate hashing and staging logic in every consumer.

**PROPOSAL.** The portable profile exposes one opaque `BorrowedAuthenticatedContent` capability. A file-backed producer can revalidate and copy from its temporary file. An in-memory producer can copy from its buffer. The assembler receives the same semantic snapshot in both cases.

## Content digest semantics

The digest proves only:

```text
bytes acquired now == bytes the producer sealed
```

It does not prove:

- who authored the source;
- that the producer is trustworthy;
- that the program is safe;
- that it has no dynamic behavior;
- that Node will run it successfully;
- that the final executable is signed.

Those are separate provenance, validation, execution, and publication concerns.

## Format is a sum, not a string annotation

The public representation may use a string discriminator, but constructors and validation should behave as a true sum:

```text
CommonJsNodeMain
  format = commonjs
  allowed injected-main semantics = CJS SEA semantics

EsmNodeMain
  format = module
  allowed injected-main semantics = ESM SEA semantics
```

This avoids states such as ESM bytes with `mainFormat: "commonjs"`, CommonJS expectations about `__dirname` on ESM, or an ESM snapshot request.

## Exact target agreement

The agreement is created before production:

```text
AssemblerOffer
  exact Node release
  exact system target
  accepted formats
  SEA policy: no assets, no snapshot, no code cache
  normalized available built-ins/features
  policy/protocol versions

ProducerAcceptance
  accepted offer identity
  selected format
  source request constraints

NodeMain
  carries exact agreement identity
```

The agreement identity is opaque so the public contract need not expose the selected binary path or all provider-native details. Normalized exact Node/system facts remain visible for diagnostics and audit.

## Built-ins and API compatibility

A built-in module name alone does not prove every API used inside it exists in every Node release. Exact target negotiation narrows the runtime. A producer adapter should either:

- validate source/output feature requirements against the offered release; or
- restrict its supported source language/API surface and reject unknown features.

`node --check` catches parser incompatibility, not missing runtime APIs. The exact offer plus adapter laws are therefore both needed.

## Packaging closure versus application inputs

The strict profile classifies dependencies by role:

- **Allowed operational input:** `fs.readFileSync(process.argv[2])` — the user supplies a file at runtime.
- **Allowed operating-system interaction:** environment, network, subprocesses, clocks, built-in APIs.
- **Illegal packaging-coupled asset:** `fs.readFileSync(new URL("./schema.json", import.meta.url))` — the program expects a sibling that will not exist as an ordinary SEA module file.
- **Illegal packaging-coupled code:** `createRequire(import.meta.url)("some-package")` — the executable expects a package installation.

This boundary prevents the profile from pretending to be hermetic while still protecting the assembler from hidden build outputs.

## Evidence envelope

The semantic core answers “what may the assembler rely on?” The evidence envelope answers “how was that claim produced?” Keep them separate:

```text
semantic validity
  protocol/profile/role/format/agreement/closure/content

audit evidence
  producer identity/version
  ordered steps
  compatibility state
  raw metafile or diagnostics
```

A changed esbuild metafile schema or Bun metadata shape should not change the core protocol. An adapter that lacks enough evidence to seal the semantic core must fail rather than return a weaker value with more observations.

## Consumer invariance

A generic consumer should perform exactly the same semantic operations for Bun and esbuild output:

1. request a `NodeMain` against the assembler offer;
2. acquire authenticated content;
3. assemble using the matching agreement;
4. receive a durable Node executable.

Provider-specific branching belongs inside producer adapters. If the consumer needs to inspect “Bun versus esbuild” to decide admissibility, the canon has failed.

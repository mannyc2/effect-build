# Falsifiers and open questions

## Falsifiers of the recommended canon

The recommendation is deliberately falsifiable. Any of the following evidence requires rejection or revision.

### F1 — official SEA default loader broadens

**Falsifier:** an official supported Node release makes the injected default loader perform ordinary filesystem and package resolution, with stable semantics sufficient for a portable contract.

**Effect:** the finite-builtins-only profile may become unnecessarily narrow. Re-evaluate a filesystem/package-backed profile; do not silently widen protocol version 1.

### F2 — same profile, divergent producer semantics

**Falsifier:** Bun and esbuild adapters both validly mint the same protocol/profile/agreement for a fixture, yet the unchanged assembler/consumer observes materially different main behavior caused by producer output rather than application-defined nondeterminism.

**Effect:** either an invariant is missing from `NodeMain`, one adapter is unsound, or a cross-producer profile is invalid.

### F3 — producer-specific consumer branch is unavoidable

**Falsifier:** the generic consumer must inspect producer identity or raw metafile data to decide how to assemble a value that already claims the same profile.

**Effect:** the semantic canon is incomplete or dishonest.

### F4 — exact target agreement is insufficient

**Falsifier:** a main bound to exact Node release/system agreement passes all prescribed static checks but repeatedly fails because compatibility-relevant binary/build features cannot be represented without selected-binary identity or more detailed feature terms.

**Effect:** promote binary identity/feature fingerprint into the agreement or narrow supported assemblers.

### F5 — authenticated acquisition fails TOCTOU tests

**Falsifier:** same-length mutation, path replacement, symlink swap, or source-buffer aliasing can cause SEA to consume bytes different from the sealed digest while the assembler reports success.

**Effect:** the acquisition abstraction is invalid; replace it with a stronger materialization/handle protocol.

### F6 — complete authoritative graph is smaller

**Falsifier:** multiple official producers expose an authoritative, complete, versioned closure certificate—including computed/plugin-generated loads and packaging-coupled resources—and one normalized graph maps directly to multiple assemblers with fewer invalid states than the sealed-main profile.

**Effect:** reconsider the graph model. “Metafile exists” alone is not this evidence.

### F7 — strict closure cannot be validated without rejecting ordinary useful mains

**Falsifier:** realistic Node main programs that producers can safely bundle into default-loader SEA are systematically rejected because closure sealing cannot distinguish their legal runtime I/O from packaging dependencies, and no bounded producer profile resolves the ambiguity.

**Effect:** revise the closure language or move from source/output analysis to a producer-authored transformation certificate.

### F8 — assets/addons are part of the true minimum

**Falsifier:** representative cross-producer consumers overwhelmingly require keyed assets or native addons, and a small stable asset-key/target contract is independently demonstrated across producers and Node SEA.

**Effect:** adopt a sum such as `NodeSeaApplication = MainOnly | MainWithAssets | MainWithAddons`; do not make every field optional.

### F9 — main-entry abstraction diverges

**Falsifier:** legal output from conforming producers cannot preserve direct main semantics under SEA without producer-specific wrappers that alter observable behavior not represented in the profile.

**Effect:** add an entry-environment invariant/profile or reject the cross-producer main role.

### F10 — durable publication cannot be made target-truthful

**Falsifier:** target signing/notarization, native inspection, cross-build constraints, or runtime validation cannot be completed before atomic publication under a common single-file law.

**Effect:** narrow `NodeMainExecutable` to a staged candidate or provider-native executable result rather than claiming a universally durable validated executable.

### F11 — Node's same-version rule changes

**Falsifier:** official Node source/docs establish a different supported compatibility relation between preparation builder and injected binary.

**Effect:** update assembler negotiation and protocol. Do not retain folklore from old postject flows.

### F12 — future Node `node:vfs` becomes integrated module authority

**Falsifier:** Node officially integrates VFS mounts with SEA module/package resolution under a stable contract.

**Effect:** consider a distinct VFS-backed application profile. Current experimental `node:vfs` alone does not establish this.

## Questions requiring future execution

### Q1 — exact Bun adapter boundary

**UNKNOWN.** At workflow-pinned Bun 1.3.14, can a restricted adapter:

- generate CJS and ESM for the exact Node offer;
- reject all non-built-in externals;
- reject every asset/chunk/addon output;
- detect computed/aliased/eval-generated loaders conservatively;
- pass legal runtime-file-input cases;
- survive exact Node syntax/main execution under SEA?

### Q2 — exact esbuild adapter boundary

**UNKNOWN.** At 0.28.1 and 0.28.2, does the same law set hold with exact target, package bundling, plugin/loader restrictions, and feature-policy checks?

### Q3 — Rolldown adapter validity

**UNKNOWN.** At 1.2.4, can code splitting be disabled without introducing unacceptable dynamic-import ordering changes for the supported profile, and can a fixed plugin-free/fixed-plugin configuration produce the same sealed main laws?

### Q4 — Rollup adapter validity

**UNKNOWN.** Which exact core/plugin versions and condition ordering are required to construct a Node-main profile, and can that adapter remain stable without exposing plugin semantics to consumers?

### Q5 — exact SEA same-version/binary law

**UNKNOWN.** Re-run matching and deliberately mismatched Node 25.5.0/26.7.0 cases with preserved receipts containing:

- builder and base binary path/digest/version/target;
- complete config;
- output native observations;
- stdout/stderr/exit;
- fixture digest;
- source SHA;
- host/container details.

The branch's expected conclusion and PR prose are not a substitute for those current receipts.

### Q6 — ESM/CJS injected-main equivalence laws

**UNKNOWN.** Test exact semantics for:

- `import.meta.main`;
- `require.main`;
- `__filename`, `__dirname`, `module.filename`;
- process arguments;
- built-in subpaths;
- top-level await;
- source-relative resource patterns;
- failures for local/package/dynamic imports.

### Q7 — built-in/API feature inventory

**UNKNOWN.** Is exact Node version plus format enough, or must the offer expose feature flags for experimental/stable built-ins and runtime options? Define the minimum authoritative inventory from Node source/declarations.

### Q8 — content acquisition laws

**UNKNOWN.** Execute same-length mutation, file replacement, symlink swap, hard-link alias, deletion, permission change, producer scope expiry, buffer alias mutation, duplicate-core package, and interrupted copy tests. Verify SEA consumes only the staged digest.

### Q9 — destination/publication laws

**UNKNOWN.** Across Linux, macOS, and Windows:

- validate same-parent staging and atomic rename behavior;
- test destination lock/existing-file policy;
- inspect ELF/Mach-O/PE architecture;
- establish signing/notarization requirements;
- verify interruption before/after commit;
- ensure no partial durable result is returned as success.

### Q10 — pkg 6.22.0 scope

**UNKNOWN.** Does exact pkg 6.22.0 expose a mode that consumes one already-sealed main with no hidden runtime acquisition, package traversal, or semantic rewrite? If not, keep it provider-native/research-only.

### Q11 — asset-profile feasibility

**UNKNOWN.** Construct independent Bun/esbuild/Rolldown/ncc fixtures that emit equivalent logical assets. Test whether a stable authenticated key contract can be defined without rewriting application source or erasing provider naming/loading semantics.

### Q12 — native-addon profile feasibility

**UNKNOWN.** Exercise N-API and version-specific addons across target triples, extraction locations, temp cleanup, concurrent processes, tamper/collision cases, and signing. Determine whether any portable profile survives.

## Minimum future execution matrix

| Axis | Required values |
|---|---|
| Producer | Bun, esbuild; Rolldown and Rollup as constructed challengers |
| Format | CJS, ESM |
| Node | exact oldest/newest supported releases plus current selected release |
| System target | Linux x64/arm64 and libc variants where supported; macOS x64/arm64; Windows x64 and arm64 where supported |
| Fixture | every legal and illegal case in `adversarial-examples.md` |
| Lifetime | success, typed failure, defect, interruption, expiry, mutation |
| Output | one file, chunk, asset, addon, unresolved external, opaque plugin |
| SEA policy | strict subset plus explicit negative snapshot/code-cache/assets cases |
| Publication | existing destination, alias/overlap, lock, signing, atomic commit |
| Package topology | packed consumers, compatible duplicate core, incompatible protocol/core |

## Receipt requirements

A future claim should be labeled **RECORDED-EXECUTION** only when the receipt includes:

- repository source SHA;
- exact source/blob/fixture digests;
- exact command and environment-relevant arguments;
- exact producer/assembler/runtime versions and selected binary identities;
- host OS/architecture/container details;
- complete stdout/stderr and exit status;
- output file list, sizes and digests;
- native/runtime/target observations;
- start/end timestamps;
- conclusion ID and expected/actual classification.

A passing fixture proves that fixture. General profile validity additionally requires complete scenario enumeration, negative tests, invariants, and falsifier coverage.

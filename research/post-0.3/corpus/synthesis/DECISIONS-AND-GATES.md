# Decisions and gates

## Architecture decisions ready for maintainer review

1. Approve native provider operations plus finite role capabilities and ordinary Effect composition as the macro-architecture.
2. Reject a generalized transformation/build/executable algebra.
3. Confirm that provider-native semantics are the permanent baseline, not temporary escape hatches; decide separately whether the governing workspace's one-operation public rule should ever expand to broader `Api`/`Command` namespaces.
4. Replace adoption-based gating with the explicit semantic/proof/release status chain in `README.md`.
5. Withdraw the current broad `BrowserModuleApplication` profile.
6. Replace the current observation-bag `NodeMain` direction with a profile-specific opaque sealed-main capability.
7. Use official Effect process, Scope, Stream, FileSystem, Path, and telemetry mechanisms directly.
8. Reject public generic command/compiler wrappers and universal source locators.
9. Keep raw provider-native command watch separate from portable typed events.
10. Keep build graphs, source maps, durable provenance, and telemetry distinct.

These decisions do not require an existing adopter. They follow from the semantic state model.

## Decisions still requiring maintainer authority

### Native product breadth and existing authorization

- Reconcile the governing workspace instruction that retains one provider-selected public operation, `compileExecutable`, with the different historical rule committed at the live PR head.
- Exact Bun, Deno, esbuild, and Node SEA operations committed in 0.4.
- Exact `Api`/`Command` namespace names and whether Node SEA has an in-process lane.
- Provider-specific convenience helpers versus direct official request/result types.
- Which experimental Deno capabilities receive a public compatibility promise.

### Node role

- Whether the first SEA profile supports both CJS and ESM.
- Whether dynamic import is excluded initially or represented as a separate explicit mode.
- Whether exact Node release is a profile requirement or a provider policy term.
- When system target belongs in producer compatibility.
- Whether public digest is mandatory or internal integrity machinery.
- Exact distinction between durable and distributable executable.
- Whether the initial profile is valuable enough for 0.4; priority does not affect its semantic status.

### Browser role

- Whether Deno can satisfy authoritative entry/style/edge association.
- Whether a weaker, distinctly named output-set role is useful if closure is unprovable.
- Source-map, minification, external, media-type, mount, and browser-engine policies.
- Whether `HtmlModuleGraphBuild` belongs in the first release or later.

### Integration-author surface

- Which shared concepts become public `Author/*` contracts versus package-private mechanisms.
- Exact BorrowedOutput close/acquire race policy, Cause/cleanup precedence, and digest policy.
- Whether host-path observations are common or domain-local.
- Whether third-party adapter authors are part of the 0.4 product audience.

### Migration and release

- The default remains a hard cut with no legacy fallback; an explicit deprecation window would require a maintainer exception.
- Preserve the provider-selected `compileExecutable` operation required by the governing workspace instruction unless the maintainer explicitly supersedes it. Separately decide the hard-cut disposition of `withJavaScriptBundle`, `Integration`, `Provider`, and ambiguous `Compiler` names.
- Independent provider-package release cadence after coordinated migration.
- Protocol version ownership and its relationship to npm peer ranges.

## Missing research that remains valuable

The two absent planned lanes should still be completed before the export map is frozen:

1. **Provider-native breadth:** current official operation-by-operation Bun/Deno/esbuild/Node SEA matrix and proposed native signatures.
2. **Compatibility and DX:** provider/operation policies, exact/non-contiguous sets, capability probes, prereleases, relational constraints, override UX, errors, warnings, CI widening, offline behavior, and package cadence.

Additional useful studies:

- diagnostics and provider-error preservation;
- executable target/runtime/ABI vocabulary;
- third-party adapter walkthrough and duplicate-core/protocol skew;
- declaration graph/package roles rather than only file-topology comparisons;
- durable tree deployment protocols as a separate product domain.

## Future implementation gates

Implementation is outside this synthesis. When authorized, do not apply the truncated closure patch as trusted source. Recreate the approved design from reviewed specifications on an isolated branch descending from the release-line base.

Before any public compatibility claim:

1. choose the exact canonical contracts and delete competing graphs;
2. compile unchanged consumers against the canonical declarations;
3. exercise native operations through real exported entrypoints and official platform Layers;
4. build the adversarial Node and browser matrices described in the decision documents;
5. execute lifecycle/Cause/mutation/cleanup/publication laws on supported hosts;
6. test packed runtime and declaration imports for every public subpath;
7. test protocol and compatible/incompatible core/provider skew;
8. establish provider compatibility policies through exact matrices;
9. create fail-closed receipts tied to one implementation SHA;
10. certify production scope, branch/base ancestry, fresh remote head, and non-skipped required jobs.

## Release separation

Implementation success does not authorize merge or release. Merge, npm publication, tags, GitHub Releases, trusted-publisher changes, settings, versions, and changelog remain separately authorized mutations.

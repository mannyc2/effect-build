# Naming and public surface

## Broadest coherent native surface

[PROP-001 · PROPOSAL] Organize by provider-native operation and state owner, not by a mandatory mirrored taxonomy.

| Operation kind | Preferred shape | Why |
|---|---|---|
| One-shot host operation | Operation-specific thin Effect function | Preserves native request/result while adding typed interruption/failure/tracing |
| Selected executable operation | Operation-specific selected-command constructor/function | Makes binary, cwd/env, project and process authority explicit |
| Reusable selected host engine | Context service + Layer | Construction has reusable state or callbacks |
| Watch/rebuild/serve/process | Scoped provider-native handle | Scope closes the actual owned lifetime |
| Staging/publication/tool discovery | Package-private adapters | Shared plumbing without public generic algebra |
| Finite proven substitution | Role-specific core type + provider adapters | Only after complete domain/falsifier matrix |

## Candidate native modules (illustrative, not an export map)

- Bun: one-shot host bundle, direct-write bundle, HTML bundle, selected-command bundle/watch, executable compile, plugins/loaders through native options.
- Deno: experimental host bundle, selected-command bundle/watch, compile executable; project/config authority remains visible.
- esbuild: build, transform, context acquisition; context exposes rebuild/watch/serve/cancel/dispose.
- Node SEA: generate/assemble, asset configuration/runtime lookup, cache/snapshot options, injection/post-processing, signing/verification as a separate mutation domain.

## Service test

A service must own a canonical selected object or state machine: e.g. esbuild context, selected tool with verified version/capabilities, or an owned watcher. A stateless wrapper whose method simply forwards a request should be a function. Existing `Compiler` services may be retained for compatibility, but their existence is not architectural evidence for expanding the pattern.

## Compatibility promise

For native operations, promise Effect integration and preservation of upstream semantics at explicitly supported coordinates—not a normalized result schema. Expose finite effect-build errors only for wrapper-owned invariants (selection, preflight, staging, relation, publication); preserve native diagnostics and metadata. Do not promise that all upstream options are stable forever merely because they are forwarded.

## Possible 0.4 subset

[PROP-004 · PROPOSAL] Add only source-supported one-shots and an esbuild scoped context; expose selected commands where authority is a product distinction; keep generic adapters private; defer portable roles and provider-wide namespaces. The maintainer alone decides names, compatibility/deprecation policy, exact support matrix, release priority and timing.

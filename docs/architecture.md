# Architecture

The core package defines portable artifacts, system targets, matrix reports,
and Author contracts. Each provider owns its discovery, target mapping,
arguments, probing, and diagnostics. Shared lifecycle code owns sibling
staging, scoped children, artifact validation, optional hashing, and atomic
replacement.

Applications compose one selected compiler or assembler layer with one
official Effect platform layer. No integration selects an application runtime,
and providers do not depend on provider siblings. Only Esbuild has its direct
`esbuild` dependency; all providers depend one-way on `effect-build`.

Interruption closes the scope and terminates compiler children. It is not
rewritten into a build error. Staged bytes and artifact observations are not
provenance, a hermeticity claim, or a general package manifest.

The 0.4 cut intentionally has no compatibility facade: removed roots,
subpaths, and names do not resolve at runtime or in declarations.

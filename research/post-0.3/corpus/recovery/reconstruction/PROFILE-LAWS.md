# Portable profile laws

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Define each valid or deferred profile by request domain, output domain, ownership, substitution law, preserved observations, exclusions, falsifiers, and confidence.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Admission rule

A portable profile is architecturally valid when its domain is coherent and finite, its failures are honest, its ownership is explicit, provider substitution preserves the listed observations, and the profile removes invalid states. An existing adopter affects priority, not validity.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · user-provided governing principle


## `NodeMainProgram`

| Dimension | Recovered specification |
|---|---|
| Request domain | One source entrypoint and optional cwd; requested `esm`/`cjs`; bytes/file transport; exact Node target supplied by downstream assembler |
| Output domain | Borrowed canonical `NodeMain` authenticated for main-entry execution |
| Ownership/lifetime | One producer continuation owns temporary root; acquisition is scoped and rechecks liveness/mutation; authority expires after callback |
| Provider implementations | Bun and Esbuild |
| Substitutability law | For requests inside the role, direct execution as the Node main must preserve application-visible result, format, Node target, import constraints, identity/lifetime laws, and failure shape |
| Preserved observations | Content identity, format, Node target/checker, imports, producer/profile/adapter protocol, ordered steps, tool compatibility, transport |
| Excluded semantics | Arbitrary importability; provider plugins/config not in request; browser output; provider-native multi-output; executable assembly |
| Known falsifier | Bun output still reported main behavior when imported while Esbuild output reported imported-module behavior |
| Confidence | **High** for the exercised main-entry law; medium for unexercised formats/import classes |

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · existing-provider-research receipts at 9b0d; direct-main-substitution and importable-module-falsifier assertions passed


## `NodeMainExecutable`

| Dimension | Recovered specification |
|---|---|
| Request domain | Destination file, optional digest; one already-bundled/authenticated Node main; exact assembler-selected Node target |
| Output domain | Durable single-file executable whose runtime is Node and whose system target/runtime/version are observed |
| Ownership/lifetime | Input remains borrowed; assembler acquires/authenticates it inside producer continuation; output commits by atomic rename and is durable afterward |
| Provider implementations | Node SEA product surface; `@yao-pkg/pkg` comparison adapter was research-only |
| Substitutability law | Given a canonical main in supported format/import domain and equivalent target, implementations produce a runnable Node executable with the same application result and durable artifact laws |
| Preserved observations | Runtime `node`, runtime version, system target, bytes/digest, producer+assembler profiles, ordered steps, committed state |
| Excluded semantics | Source/project traversal, hidden runtime acquisition, arbitrary assets/snapshots/code cache/signing, runtime-neutrality |
| Known falsifiers | Mismatched Node builder/base; unsupported external imports; mutation/expiry/authentication failure |
| Confidence | **High** for exercised CJS/single-main topology; medium for current Node ESM/asset breadth until implemented and certified |

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · external-provider-research and node-sea-relations receipts at 9b0d


## `BrowserModuleApplication`

| Dimension | Recovered specification |
|---|---|
| Request domain | HTML module application rooted in a contained source tree; scripts/styles/assets reachable through the discovered module/resource graph; minify and source-map modes explicitly requested |
| Output domain | Borrowed HTML/JS/CSS/asset tree with a validated local-reference manifest |
| Ownership/lifetime | One continuation owns temporary output tree; files are observed through closure-owned Effects; no durable directory transaction claim |
| Provider implementations | Bun and Deno |
| Substitutability law | In a real browser, the rewritten entry HTML loads all contained local references, executes static and dynamic modules, applies nested CSS, resolves assets, and preserves observable application result in minified/unminified modes |
| Preserved observations | Entry HTML, complete manifest, URL graph, source maps where supported, tool/adapter/steps, containment/lifetime/digests |
| Excluded semantics | Arbitrary server behavior; undiscovered filesystem copying; external URL mirroring; provider project/framework semantics outside request; atomic directory publication |
| Known falsifier | Broad static-web role failed because Deno dropped a top-level linked stylesheet in the adversarial fixture |
| Confidence | **High** for the narrow module-reachable fixture claim; **medium-low** for the general algorithm until implemented and run in browsers |

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · existing-provider-research and profile-refinement receipts at 9b0d


## `NodeSourceExecutable` recipe

```text
NodeMainProgram
  -> canonical NodeMain
  -> NodeMainExecutable
  -> durable Node executable
```

The recipe selects neither producer nor assembler. It asks the assembler for its exact target, gives that target to the producer, keeps the canonical main inside the producer continuation, and assembles it through ordinary Effect service composition.

> **Provenance:** `REMOTE-COMPILED` · observation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/research/post-0.3/final/recipe.ts#L15-L45


## Architecturally valid but deferred: incremental Node main

Esbuild context and Rolldown build/generate handles both demonstrated repeated production after source mutation and explicit release. That is sufficient to establish a coherent scoped incremental role in the exercised topology. It was deferred because no Rolldown product integration package was in the proposed 0.4 set—not because an adopter was absent.

| Dimension | Deferred law |
|---|---|
| Request | One Node-main entry and provider-neutral subset of rebuild options |
| Output | Sequence of authenticated borrowed Node-main snapshots, not a mutable permanent path |
| Ownership | Scoped handle; rebuild/generate invalid after release |
| Substitution | Each rebuild after an observed source change produces a new identity and preserves Node-main laws |
| Exclusions | Cross-provider file-watch event normalization; provider plugin/context options outside subset |

> **Provenance:** `REMOTE-EXECUTED` · observation · confidence **high** · external-provider-research receipt: Esbuild context rebuilt, Rolldown regenerated, release enforced


## Falsified profile candidates

| Candidate | Falsifier | Consequence |
|---|---|---|
| Runtime-neutral executable | Bun and Deno outputs ran embedded `bun` and `deno` runtimes | Runtime identity belongs in the product; use provider-named executable roles or Node-specific assembly |
| Generic importable Node program | Bun/Esbuild differed when imported | Name/law is Node **main**, not arbitrary module |
| Broad static web | Deno omitted a top-level linked stylesheet | Narrow to a discovered/rewriteable HTML module application and test the general algorithm |
| Generic declaration output set | Deno and `tsc` topology differed | Keep declaration production provider-native unless a narrower role survives |
| Rolled-up declaration file | Deno output retained unresolved local type import while Rolldown was self-contained | No current Deno/Rolldown portable single-file declaration role |
| Durable directory artifact | No common commit/rollback law | Return borrowed trees or provider-native direct-write results |
| Typed command-watch events | Human terminal output, no stable machine protocol | Preserve raw process watch; no portable readiness/rebuild protocol |
| Universal signing | Incompatible trust/credential/platform mutation laws and no tests | Defer to explicit platform/provider mutation operations |

> **Provenance:** `FALSIFIED` · observation · confidence **high** · preserved architecture receipts and expected-conclusion declarations


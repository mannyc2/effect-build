# Post-0.3 provider capability matrix — reconstructed draft

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Provide the compact review matrix that should accompany the architecture decision.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Direct surfaces

| Package/subpath | Host/selection authority | Native operations retained | Profile adapters | Major exclusions from profiles |
|---|---|---|---|---|
| `effect-build-bun/Api` | Current Bun host + `Bun.version`/declarations | Native build, plugins, virtual files, outputs, HTML/CSS/assets, compile mode | Node main; browser module app | Bun executable/runtime targets, arbitrary plugins/options remain native |
| `effect-build-bun/Command` | One selected Bun executable | CLI build/compile/matrix/watch and target semantics | May support profiles through separate adapter modules | Human watch text is not typed events |
| `effect-build-deno/Api` | Current Deno host + unstable capability/declarations | Experimental bundle API breadth supported by package policy | Browser module app | Permissions/project/runtime acquisition not normalized |
| `effect-build-deno/Command` | One selected Deno executable | Bundle/compile/matrix/watch, project/config/includes/workers/runtime acquisition | Browser module app | Deno executable is not runtime-neutral |
| `effect-build-esbuild/Api` | Imported package/version | Build/transform/plugins/loaders/metafile/context/rebuild/watch/serve/cancel/dispose | Node main | No executable assembly; direct output semantics retained |
| `effect-build-node-sea/Command` | Builder and base Node executables observed independently | SEA blob/build/injection/assets/module format/platform steps | Node main executable | Requires Node-specific target/relation; no source bundling |

## Profile conformance

| Profile | Implementations with evidence | Required preserved observations | Falsifiers/exclusions |
|---|---|---|---|
| Node main program | Bun, Esbuild | main result, format, Node target, imports, identity, producer/steps, borrowed lifetime | arbitrary importability; browser/provider-specific requests |
| Node main executable | Node SEA; research `pkg` comparison | Node runtime/version, target, committed artifact, authenticated input, steps | runtime-neutrality; hidden acquisition; unsupported external imports |
| Browser module application | Bun, Deno | real-browser result, complete local references, manifest/maps, borrowed lifetime | broad directory copying; dropped linked resources; directory atomicity |
| Incremental Node main (deferred) | Esbuild, research Rolldown | repeated identities after source mutation; scoped release | portable file-watch events; provider context options outside subset |

## Compatibility ownership

Every row above owns independent policies per operation. Provider package releases may widen support independently after exact matrix evidence. Core profile protocols remain explicit and independent of npm version equality.

## Evidence qualification

The detailed class/confidence qualification is in `reconstruction/PROVIDER-CAPABILITY-MATRIX.md`; this draft intentionally does not relabel repository declarations at `49cd5e1…` as successful exact-head receipts.

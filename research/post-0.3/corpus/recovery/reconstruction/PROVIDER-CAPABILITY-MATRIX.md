# Provider capability matrix

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Separate permanent provider-native breadth from the narrower profiles each provider can truthfully implement.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Matrix legend

- **Native:** permanent direct provider surface; do not narrow to a profile.
- **Profile:** provider can implement the named portable role under its laws.
- **Research-only:** exercised as comparison evidence but not proposed as a product package.
- **Unverified:** official capability exists, but no current repository implementation/certification is established.

| Provider/lane | Permanent native breadth | Portable role support | Lifecycle/cancellation | Durable-output truth | Evidence class and confidence |
|---|---|---|---|---|---|
| **Bun `Api`** | `Bun.build()` request/result, plugins, virtual files, loaders, HTML/CSS/assets, output objects, compile mode, native diagnostics; current upstream also documents bundling and compile APIs | `NodeMainProgram`; `BrowserModuleApplication` | One-shot API does not expose a general cancel handle in the exercised boundaries; fiber interruption may stop waiting without proving provider cancellation | Memory/output values are provider results; direct writes are not wrapped as a transaction | `REMOTE-EXECUTED` at 1.3.9/1.3.14 for exercised shapes; `OFFICIAL-UPSTREAM-CONTRACT` for current breadth; high |
| **Bun `Command`** | Selected `bun build`, compile, targets/CPU/libc/runtime semantics, project/CLI flags, command watch | Native Bun executable; may also produce Node/browser outputs where request semantics match | Scoped child process, raw stdio, exit, interruption, termination/reaping; no typed portable rebuild events | Single executable can use durable-file publication; multi-output direct writes can be partial | `REMOTE-EXECUTED` for command boundaries/watch; high for exercised behavior |
| **Deno `Api`** | Current experimental `Deno.bundle()` request/output graph, HTML, code splitting, maps, minify; host unstable capability and declarations are provider-owned | Potential `BrowserModuleApplication`; exact adapter must be refreshed against current API | Host API cancellation/rollback only if official API provides it; do not invent command semantics | Memory/write modes must state when output becomes durable | Branch boundary probes are `REMOTE-EXECUTED`; current API breadth is `OFFICIAL-UPSTREAM-CONTRACT`; medium until refreshed |
| **Deno `Command`** | Experimental bundle, compile, permissions, includes, workers, project/framework authority, target runtime acquisition, engine/diagnostics, command watch | `BrowserModuleApplication` | Scoped selected process with raw stdio/exit/kill/reap; human terminal messages are not a portable event protocol | Direct tree writes may be partial; compiled executable is Deno-runtime-specific | `REMOTE-EXECUTED` at 2.9.3/2.9.5 for branch probes; current official docs broaden/refresh contract; high/medium |
| **Esbuild `Api`** | Build, transform, plugins/loaders/metafile; context with rebuild, watch, serve, cancel, dispose | `NodeMainProgram`; architecturally valid incremental Node-main role | Context is scoped; explicit cancel/dispose; one-shot build/transform differ from context | Native build can return memory output or write directly; direct multi-output write is not transactional | `REMOTE-EXECUTED` for Node-main/incremental probes; `OFFICIAL-UPSTREAM-CONTRACT` for current API; high |
| **Node SEA `Command`** | Node SEA assembly over an already-prepared main, base executable/runtime, assets, current CJS/ESM `mainFormat`, platform-specific post-processing | `NodeMainExecutable` | Selected Node command and file operations; assembly is one-shot; interruption before atomic publication leaves destination unchanged only if wrapper stages correctly | Durable single executable after validation/atomic rename | `REMOTE-EXECUTED` for matching/mismatched Node 25.5/26.7 probes; current Node 26 contract is `OFFICIAL-UPSTREAM-CONTRACT`; high for probe, medium for refreshed ESM scope |
| **Rolldown (research)** | Incremental build/generate/close and declaration comparison | Incremental Node-main candidate | Scoped handle close | Research output only | `REMOTE-EXECUTED`; not a proposed 0.4 package |
| **`@yao-pkg/pkg` (research)** | SEA-mode comparison topology | `NodeMainExecutable` comparison implementation | Acquisition/provisioning was research-specific | Produced a Node executable in probe | `REMOTE-EXECUTED`; research-only and not product-authorized |

## Permanent module recommendation

```text
effect-build-bun/Api
effect-build-bun/Command

effect-build-deno/Api
effect-build-deno/Command

effect-build-esbuild/Api

effect-build-node-sea/Command
```

These are permanent supported surfaces. A profile does not demote a direct module, and a missing profile does not make a provider incomplete.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · https://github.com/mannyc2/effect-build/blob/49cd5e1be7917bf14e89068afb4fa47cf78488fb/plans/POST-0.3-NATIVE-CAPABILITY-ARCHITECTURE.md#L420-L479


## Capability breadth that must not be normalized away

### Bun

Preserve Bun's native plugins, virtual modules/files, compile targets, Bun-runtime executable identity, HTML/CSS/assets, diagnostics, and API output objects. A Node recipe cannot replace Bun compile because the embedded runtime differs.

### Deno

Preserve project/config authority, permissions/inclusion policy, workers, runtime acquisition, compile engine, declaration options, experimental stability status, and Deno-runtime executable identity. The 2.9-era branch observation that compiled Deno lacked `Deno.bundle` is a versioned observation, not a timeless prohibition.

### Esbuild

Preserve build versus transform, plugin callbacks, loaders, metafiles, context, rebuild, watch, serve, cancel, and dispose. A Node-main profile projects only one finite request/result role.

### Node SEA

Preserve builder/base executable identity, Node version relation, module format, assets, blob/assembly process, platform signing/post-processing boundaries, and final Node runtime observation.

## Naming audit

- `compileExecutable` is defensible only inside a provider `Command` module where the embedded runtime and provider are explicit. At a package root or portable layer it is too vague.
- `withJavaScriptBundle` is too broad for a value that is specifically a borrowed Node main. It should not survive as the canonical 0.4 name; an unreleased migration delegate is acceptable only if exact 0.3 behavior must temporarily be characterized before a hard cut.
- `Compiler` as a Bun/Deno root service is ambiguous because API, command, bundle, compile, and project semantics differ.

> **Provenance:** `PRESCRIPTIVE-RECOMMENDATION` · recommendation · confidence **high** · capability matrix plus 0.3 naming audit in the pushed architecture


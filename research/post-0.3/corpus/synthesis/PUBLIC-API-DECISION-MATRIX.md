# Public API decision matrix

This matrix distinguishes architectural direction from an approved export map. No production export is authorized by this document.

## Provider surfaces

| Surface | Disposition | Reason / remaining gate |
|---|---|---|
| Bun native `Api` operations | Retained architectural direction; exact public breadth unresolved | Preserve official request/result/plugins/output behavior; exact breadth needs the missing provider study |
| Bun selected `Command` operations | Retained architectural direction; exact public breadth unresolved | Preserve CLI/project/runtime/target/watch behavior; exact operations and names unresolved |
| Deno native `Api` operations | Retained architectural direction; exact public breadth unresolved | Preserve experimental versioned contract; exact current surface and capability policy unresolved |
| Deno selected `Command` operations | Retained architectural direction; exact public breadth unresolved | Preserve project/permission/compile/bundle/runtime semantics; no hidden API fallback |
| Esbuild native `Api` operations | Retained architectural direction; exact public breadth unresolved | Preserve build/transform/context/rebuild/watch/serve/cancel/dispose rather than a narrowed bundle wrapper |
| Node SEA native operation | Provider-native architectural direction; public commitment unresolved | Keep full SEA semantics outside portable profiles; exact public surface, naming, and release timing require provider-breadth and maintainer decisions |

“Retained architectural direction” means profiles do not erase these capabilities. It does not authorize broader public namespaces under the governing workspace's one-operation rule, require every upstream option in 0.4, or approve an exact export map. The live PR head contains a different historical `AGENTS.md`; implementation must first reconcile those authorities.

## Core/integration-author surfaces

| Proposed surface | Disposition now | Public decision |
|---|---|---|
| `Author/Tool` | Retain semantic concept | Public export unresolved; initially prove across selected provider tools and third-party adapter walkthrough |
| `Author/BorrowedOutput` | Retain strongest shared law | Public export unresolved until two real integrations obey the same law, provider quiescence is proven, and races, Cause policy, containment, mutation, and duplicate-core behavior pass |
| `Author/DurableFile` | Introduce as conceptual split | Decide whether public or private after cross-platform pre/post-rename interruption, locked destination, replacement, and committed-but-post-observation-failed outcomes are proven |
| `Author/Executable` | Narrow to inspection/publication of candidate | No universal executable producer; public export unresolved |
| `HostPath.Observed` | Redefine or make domain-local | Never a branded continuing-existence claim |
| `SourceLocator` | Omit | No shared invariant; reconsider a tagged `SourceRef` only with real consumers |
| `Author/Command` | Reject | Duplicates official Effect process model |
| `Author/CommandCompiler` | Reject | Provider-specific policy disguised as generic factory |
| Generic build/transformation algebra | Reject | Adds invalid combinations and duplicates Effect composition |
| Universal signer/mutator | Defer | Trust, credentials, mutation, verification, timestamp, and platform laws differ |

These dispositions are based on semantic rent, not adopter count. The unresolved public decisions require constructed integration evidence and an explicit compatibility commitment.

## Portable roles and composition

| Surface/name | Disposition now | Notes |
|---|---|---|
| `NodeMainProgram` | Retain role concept; redesign output | Must mint a profile-specific opaque sealed main, not a path/format/observation bag |
| `NodeMainExecutable` | Retain assembler role concept | Strict initial SEA main subset; full SEA stays native; conformance unproved |
| `NodeMain/sea-default-loader` | New semantic candidate | Direct main, CJS/ESM sum, finite built-ins, no assets/chunks/package/local/JSON/addon state; bind a deterministic semantic fingerprint rather than an assembler-instance token; trusted-adapter conformance remains unproved |
| `NodeSourceExecutable` | Ordinary composition only | Prefer `NodeMainExecutable.fromProgram` or `assembleNodeMainProgram`; no `Recipe` protocol |
| `BrowserModuleApplication` | Withdraw | Current broad law is falsified/underspecified |
| `BrowserModulePayload` | New semantic candidate | Full closure is unproved; Deno associations, metadata completeness, MIME, externals, protocol negotiation, and exact provider/browser matrices remain gates |
| `HtmlModuleGraphBuild` | Separate future role | Requires finite HTML language and complete proof |
| Incremental Node main | Re-research against corrected canon | Historical lifecycle evidence does not automatically conform to new sealed main |
| Typed cross-provider command watch | Reject | Human terminal output is not a machine event protocol |
| Provider-native raw command watch | Retain direction | Official process handle/streams only; exact provider operation unresolved |
| Durable browser/output tree | Reject as build result | Deployment publication is a separate platform protocol |

## Existing names

| Name | Recommendation |
|---|---|
| required public `compileExecutable` | Retain under the governing workspace instruction as the provider-selected public operation; reconcile it with PR #4's different historical instruction before implementation; any removal or incompatible reframing requires explicit maintainer authority |
| `withJavaScriptBundle` | Remove as canonical name; it does not state Node main, browser payload, format, or lifetime |
| `Compiler` | Avoid as provider root service where API, command, build, bundle, compile, and context semantics differ |
| `Integration` / `Provider` generic paths | Do not preserve automatically; map each surviving invariant to a precise native or author surface |
| package roots | Discovery facade only if approved; no second implementation or ambiguous default operation |

Assume a hard cut with no compatibility delegate or fallback unless the maintainer explicitly chooses a deprecation window.

## Status before implementation

No exact 0.4 public subpath list should be declared final yet. The missing provider-breadth study affects native surfaces, the missing compatibility/DX study affects Layer options and error contracts, and the corrected Node/browser studies change the proposed profile graph.

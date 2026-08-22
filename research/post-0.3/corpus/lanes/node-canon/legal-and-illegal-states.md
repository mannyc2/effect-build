# Legal and illegal states

## Reading this matrix

- **Legal** means representable by the proposed strict profile, not guaranteed to complete successfully at runtime.
- **Illegal** means supported constructors/adapters must reject it before returning `NodeMain` or before invoking SEA.
- “Impossible” means impossible through the supported API and protocol checks. TypeScript casts, forged objects, malicious providers, and memory corruption are outside the type-level claim.

## Legal `NodeMain` states

| State | Classification | Why legal |
|---|---|---|
| ESM main with `import { readFile } from "node:fs"` and no other import | PROPOSAL | Explicit ESM, one literal built-in edge, no side output. Runtime file paths may still be user inputs. |
| CJS main with `const os = require("os")` | PROPOSAL | Literal built-in normalizes to `node:os`. |
| JSON source transformed into a JavaScript object literal | PROPOSAL | No runtime JSON module remains. |
| A program reading `process.argv[2]` with `node:fs` | PROPOSAL | Operational runtime input, not a packaging-coupled auxiliary file. |
| A program using environment variables or network APIs | PROPOSAL | The profile is load-closed, not hermetic. |
| Bun-produced one-file ESM that satisfies the exact offered Node parser and closure profile | PROPOSAL | Producer identity is irrelevant to the unchanged consumer once the same sealed profile is validly minted. |
| esbuild-produced one-file CJS with exact Node target, no non-builtin external, and no side output | PROPOSAL | Same canonical consumer; adapter proves its own postconditions. |
| Native-free JavaScript produced for `linux-x64-gnu` agreement | PROPOSAL | Exact final target is carried by agreement even when source is platform-neutral. |
| An expired producer value whose acquisition correctly returns `Expired` | PROPOSAL | Expiry is a legal failure state; treating it as current content is not. |

## Illegal producer-result states

| State | Required rejection | Evidence/reason |
|---|---|---|
| `externalImportObservations: ["zod"]` but profile says SEA-default-loader | Before returning `NodeMain` | Default injected loader cannot load ordinary package modules. Observation is not admissibility. [NODE-SEA-26] |
| Remaining `import "./chunk.js"` | Before returning `NodeMain` | Local module is not available through default injected loader. |
| Remaining `require("./config.json")` | Before returning `NodeMain` | Runtime JSON/file load is outside strict closure. |
| `import data from "./config.json" with { type: "json" }` survives output | Before returning `NodeMain` | Ordinary Node JSON semantics do not make the SEA file present. |
| Multiple JavaScript chunks | Before returning `NodeMain` | SEA strict profile embeds one script and does not map a chunk graph. |
| Copied image, WASM, CSS, sourcemap required at runtime, or other asset output | Before returning `NodeMain` | Requires an asset graph/mapping profile. |
| `.node` output or `process.dlopen()` packaging dependency | Before returning `NodeMain` | Requires ABI, asset/extraction, and target semantics. |
| Computed `require(name)` with unconstrained `name` | Before returning `NodeMain` | Closure cannot be finite or default-loader-safe. |
| `module.createRequire()` | Before returning `NodeMain` | Explicitly reintroduces filesystem/package loading. |
| `eval("require('x')")` or `new Function(...)` capable of loading code | Before returning `NodeMain` | Lexical import graph is not complete. |
| Opaque plugin injects an unclassified runtime loader | Before returning `NodeMain` | Provider observation is insufficient; adapter cannot seal closure. |
| `role: "importable"` | Construction | This protocol is explicitly main-only. |
| Unknown protocol/profile major | Negotiation | Semantics cannot be assumed. |
| Producer emits format that differs from request | Construction | Format is a true sum invariant. |
| Producer target is generic `node` but exact offered Node rejects syntax | Before returning `NodeMain` | Bun does not down-convert syntax; exact parser is authoritative for syntax acceptance. [BUN-BUNDLER] |
| Esbuild target passes but output uses an unavailable runtime API | Before returning `NodeMain` when known; otherwise future execution may fail | Esbuild target transforms syntax, not APIs/polyfills. [ESBUILD-API] |

## Illegal producer-to-assembler states

| State | Required rejection | Phase |
|---|---|---|
| Agreement identity differs | `NodeTargetAgreementMismatch` | Before acquisition/SEA work |
| Exact Node version differs | `NodeRuntimeTargetMismatch` | Before acquisition/SEA work |
| System target differs | `SystemTargetMismatch` | Before acquisition/SEA work |
| Protocol/profile unsupported | `ProtocolUnsupported` | Before provider work |
| Borrow already expired | `Expired` | Acquisition |
| Same path, same byte count, changed bytes | `Changed` | Hashing acquisition |
| Declared digest differs from staged copy | `Changed` or `ContentIdentityMismatch` | Before SEA work |
| Raw path aliases destination | `InputDestinationAlias` | Before staging/destination mutation |
| Input lies inside a destination that will be replaced | `DestinationOverlap` | Before staging/destination mutation |
| ESM bytes paired with CommonJS SEA config | `MainFormatMismatch` | Before SEA work |
| Closure evidence is only “observed externals” and not sealed guarantee | `InsufficientClosureEvidence` | Before SEA work |
| Unknown built-in for offered Node | `NodeFeatureUnsupported` | Before SEA work |

## Illegal SEA configuration states in the strict profile

| State | Why illegal | Source |
|---|---|---|
| `assets` non-empty | Strict profile is asset-free; use direct/richer composition. | PROPOSAL |
| `useSnapshot: true` | Different lifecycle; ESM is officially incompatible. | [NODE-SEA-26] |
| `useCodeCache: true` | Strict profile fixes false; official dynamic-import restriction and platform coupling. | [NODE-SEA-26] |
| Dynamic `import()` in main | Strict v1 excludes it, removing a code-cache/format branch. | PROPOSAL |
| Builder/base Node versions differ | Node requires same version for preparation/injection. | [NODE-SEA-26] |
| Cross-target snapshot/code cache enabled | Node warns these representations are platform-bound and may crash. | [NODE-SEA-26] |
| Native addon without explicit asset/extraction plan | Addon cannot be treated as ordinary bundled JavaScript. | [NODE-SEA-26] |
| Output goes directly to durable destination before validation | A failed/interrupted producer may leave a misleading result. | PROPOSAL |
| Required target signing omitted but result labeled distributable/validated | Publication readiness is false. | [NODE-SEA-26], PROPOSAL |

## Format-specific state laws

### CommonJS

Legal:

- literal `require("node:path")` or equivalent bare built-in normalized to `node:path`;
- direct-main semantics under injected CommonJS;
- `require.main` observations consistent with the injected main.

Illegal in the strict profile:

- local/package/JSON `require`;
- `createRequire`;
- reliance on ordinary `require.resolve`, `require.cache`, or other properties absent from the injected `require`;
- claiming importable-module behavior.

### ESM

Legal:

- static literal imports of Node built-ins;
- `import.meta.main === true` main behavior;
- explicit ESM format.

Illegal in the strict profile:

- relative, absolute file, package, data/JSON packaging edges;
- `import.meta.resolve` reliance;
- any `import()` in profile version 1;
- snapshot mode;
- treating `import.meta.url` as the original bundle path when resolving sibling assets. In SEA it corresponds to the executable path. [NODE-SEA-26]

## Output readiness states

A single durable file can be modeled truthfully only when the state transition is explicit:

```text
no candidate
  -> private staged candidate
  -> native/target/runtime validated candidate
  -> signed and verified candidate when target policy requires
  -> atomic rename
  -> durable executable observation
```

The API must not expose intermediate candidates as durable artifacts. A failed matrix cell may leave other independently committed cells, but no multi-file transaction is implied.

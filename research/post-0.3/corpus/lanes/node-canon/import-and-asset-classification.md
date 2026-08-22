# Import and asset classification

## Purpose

The key question is not “does the output contain the word `import`?” It is:

> What code or resource does the injected main expect to resolve at runtime, through which mechanism, and is that mechanism part of the strict SEA default-loader profile?

## Classification table

| Class | Examples | Strict profile | Required representation/action |
|---|---|---:|---|
| Static ESM built-in | `import fs from "node:fs"` | Allow | Normalize exact built-in; validate offered Node inventory. |
| Literal CJS built-in | `require("fs")` | Allow | Normalize to `node:fs`; classify CJS loader semantics. |
| Built-in subpath | `node:fs/promises` | Allow if offered | Preserve exact subpath; validate exact release. |
| Static local JS import | `import "./chunk.js"` | Reject if it survives | Producer must bundle it into main bytes. |
| Static package import | `import "zod"` | Reject if it survives | Producer must bundle it; package externalization is incompatible. |
| Package `#imports` alias | `import "#internal"` | Reject if it survives | Resolve during production under exact package conditions; no runtime package map. |
| Conditional package export | package chooses `node`/`import`/`require` branch | Resolve during production | Producer evidence must reflect selected conditions; no surviving bare import. |
| Absolute/file URL module | `import "file:///x.mjs"` | Reject | Default SEA loader cannot load filesystem module. |
| ESM literal dynamic built-in | `import("node:fs")` | Reject in profile v1 | Candidate for future explicit dynamic-builtin profile with code cache false. |
| ESM literal dynamic local/package | `import("./x.js")`, `import("pkg")` | Reject | Default injected ESM dynamic import supports built-ins, not files/packages. |
| Computed dynamic import | `import(name)` | Reject/UNKNOWN | No finite closure unless a richer producer proves and rewrites every case. |
| Computed `require` | `require(name)` | Reject/UNKNOWN | Could request file/package; special injected `require` differs. |
| Aliased loader | `const r = require; r(x)` | Reject unless fully normalized by trusted analysis | Regex/metafile may miss it. |
| `module.createRequire()` | `createRequire(import.meta.url)` | Reject | Explicitly opts into filesystem/package loading; requires runtime tree authority. |
| `eval`/`new Function` loader | generated `require`/`import` | Reject | Static graph not authoritative. |
| `process.getBuiltinModule("fs")` | literal built-in API | Exclude in v1 | Could be future exact-feature profile; not an import edge and easy to miss. |
| Runtime JSON import | ESM JSON with `with { type: "json" }` | Reject if it survives | Inline/transform JSON into JavaScript. Ordinary Node's attribute rule does not provide a SEA file. |
| CJS JSON require | `require("./x.json")` | Reject | Default injected loader does not read that file. |
| Data URL JS/JSON | `import "data:..."` | Exclude in v1 | Ordinary ESM may support it, but strict SEA docs promise built-ins; avoid relying on broader ordinary-loader behavior. |
| WASM module/file | imported or emitted `.wasm` | Reject | Requires asset/module handling and target/runtime policy. |
| Native addon | `.node`, `process.dlopen()` | Reject | Requires ABI, asset embedding/extraction, cleanup, verification. |
| Worker script URL | `new Worker(new URL("./w.js", import.meta.url))` | Reject | Secondary code entry/resource graph. |
| Source-relative asset read | `readFileSync(new URL("./schema", import.meta.url))` | Reject | In SEA, `import.meta.url`/`__dirname` relate to executable; sibling was not embedded. |
| User-selected runtime file | `readFileSync(process.argv[2])` | Allow as application I/O | Not a packaging output; no portability/hermeticity promise. |
| Environment/network input | `process.env`, `fetch()` | Allow as application I/O | Outside code-load closure. |
| Spawned external executable | `spawn("git")` | Allow but not self-contained | Runtime dependency; profile does not promise host availability. |
| Sourcemap used only for diagnostics | external `.map` | Reject as profile side output or omit | Strict output is one main; direct provider may preserve maps. |
| Inlined sourcemap/data | sourceMappingURL data URI | Potentially allow | Part of bytes; must not add runtime file. |
| Producer asset output | Bun/esbuild/Rollup/Rolldown asset | Reject | Requires resource-graph profile. |
| Unresolved provider import | warning/metafile external/unresolved edge | Reject | Never convert uncertainty into admissibility. |
| Plugin virtual module fully bundled | no surviving edge/output | Potentially allow | Adapter must trust/restrict plugin and still seal final closure; opaque plugins may be disallowed. |

## Built-in normalization

**PROPOSAL.** Normalize built-in names to `node:` form:

```text
fs               -> node:fs
fs/promises      -> node:fs/promises
node:path        -> node:path
```

Keep exact subpaths. Do not collapse `node:test/reporters` into `node:test`, because availability and exports can differ by release.

The normalized set is:

- finite;
- unique;
- sorted for deterministic agreement/evidence;
- validated against the exact offered Node release;
- semantic evidence, not a source-order reproduction.

## Package resolution

**UPSTREAM-DIRECT.** Ordinary Node ESM and CJS have different resolution algorithms. ESM requires explicit extensions for relative/absolute specifiers; CJS searches extensions and directories. Packages can use `type`, `exports`, `imports`, and conditions such as `node`, `import`, and `require`. [NODE-ESM-26] [NODE-CJS-26] [NODE-PACKAGES-26]

**INFERENCE.** A producer's `platform: node` or equivalent may choose a particular package branch. That choice must be completed during production. The canonical main must not ask SEA to repeat package resolution because the default injected loader does not.

## External dependencies

An external dependency is not made portable by listing it. There are only three honest treatments:

1. **Bundle it** into the main bytes.
2. **Reject it** under the strict profile.
3. **Use a richer filesystem/package-backed profile** that explicitly owns package acquisition, layout, resolution conditions, target authority, and publication.

The current Candidate C2 `externalImportObservations` field is useful diagnostics, but allowing a non-empty non-builtin set in a supposedly SEA-ready value is an illegal state.

## Dynamic imports

The strict profile excludes all `import()` calls even though current injected ESM can dynamically load built-ins. This is intentional minimality:

- avoids a CommonJS/ESM capability branch;
- avoids code-cache incompatibility;
- avoids computed-specifier closure questions;
- avoids over-reading ordinary ESM semantics into SEA.

A future profile could add:

```text
profile: sea-default-loader-dynamic-builtins@1
format: module
literal dynamic builtins: finite set
codeCache: false
```

That profile should not silently widen version 1.

## JSON

Ordinary Node ESM requires `with { type: "json" }` for JSON modules. [NODE-ESM-26] This is a syntax/loader rule, not asset embedding. The strict profile allows JSON-origin data only after the producer has transformed it into the JavaScript snapshot. The evidence envelope may record the source input; the runtime closure contains no JSON file.

## Native addons

Native addons are executable code, not ordinary assets. A future profile needs at least:

- stable logical asset key;
- content digest and size;
- exact OS/architecture/ABI/N-API or Node ABI constraints;
- extraction destination and cleanup policy;
- collision/tamper defenses;
- `process.dlopen()` behavior;
- signing/trust implications;
- platform-specific known caveats.

This is too much semantics to hide behind `assets?: string[]` on `NodeMain`.

## Assets and auxiliary files

A richer `NodeSeaApplication` could truthfully be a sum:

```text
main: sealed NodeMain
assets: authenticated keyed blobs
addons: target-constrained executable blobs
runtimeAccess: node:sea key contract
```

That is not the smallest canonical producer/assembler bridge requested here. Bun, esbuild, Rolldown, Rollup, ncc, Deno, and pkg differ materially in how they discover, transform, name, copy, inline, or extract resources. Preserve those differences until a specific normalized key contract has independent evidence.

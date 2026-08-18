# Adversarial examples

These are semantic counterexamples, not implementation fixtures. Each example states what a strict adapter must conclude. A regex scan, producer metafile, or `node --check` may miss or misclassify several of them.

## A1 — package external survives

```js
import { z } from "zod";
console.log(z.string().parse("ok"));
```

**Expected:** reject. A producer may mark `zod` external and Node may run the bundle beside `node_modules`, but the SEA default injected loader will not perform ordinary package resolution. [NODE-SEA-26]

## A2 — local static chunk survives

```js
import { run } from "./chunk.js";
run();
```

**Expected:** reject unless the producer bundles the chunk into the main bytes. Disabling splitting is a configuration requirement, not proof by itself.

## A3 — literal local dynamic import

```js
await import("./feature.js");
```

**Expected:** reject. Current injected ESM dynamic import loads built-ins, not filesystem modules. [NODE-SEA-26]

## A4 — computed dynamic import

```js
const name = process.env.FEATURE;
await import(name);
```

**Expected:** reject/UNKNOWN. No finite code-load closure exists. A metafile can only report edges the producer recognized.

## A5 — computed CommonJS require

```js
const name = process.argv[2];
const plugin = require(name);
plugin.run();
```

**Expected:** reject. It may request a built-in, local file, package, JSON, or addon; the injected `require` is special.

## A6 — aliased require defeats simple scan

```js
const load = require;
const mod = load("./plugin.cjs");
```

**Expected:** reject. Searching for `require(` or relying only on static import records is not complete.

## A7 — filesystem-backed `createRequire`

```js
const { createRequire } = require("node:module");
const load = createRequire(process.execPath);
console.log(load("some-installed-package"));
```

**Expected:** reject in strict profile. Node documents `createRequire()` as the opt-in path to filesystem module loading. A richer profile would need to own package layout and installation. [NODE-SEA-26]

## A8 — eval-generated load

```js
const source = `require(${JSON.stringify(process.env.PACKAGE)})`;
const result = eval(source);
```

**Expected:** reject. Parser and metafile visibility do not establish closure.

## A9 — source-relative ESM asset

```js
import { readFileSync } from "node:fs";
const schema = readFileSync(new URL("./schema.json", import.meta.url));
```

**Expected:** reject as an asset-free main. In injected ESM, `import.meta.url` corresponds to the executable path, not the original producer output directory. [NODE-SEA-26]

## A10 — source-relative CommonJS asset

```js
const fs = require("node:fs");
const path = require("node:path");
const schema = fs.readFileSync(path.join(__dirname, "schema.json"));
```

**Expected:** reject as packaging-coupled auxiliary data. Injected `__dirname` is the executable directory, and no ordinary sibling is embedded by the strict profile. [NODE-SEA-26]

## A11 — user-supplied runtime file

```js
const fs = require("node:fs");
console.log(fs.readFileSync(process.argv[2], "utf8"));
```

**Expected:** legal under the load-closure profile. This is an operational input, not a claimed bundled asset. The executable is not hermetic and may fail if the user supplies no file.

## A12 — JSON module survives

```js
import config from "./config.json" with { type: "json" };
console.log(config.mode);
```

**Expected:** reject unless transformed into JavaScript. The import attribute satisfies ordinary Node JSON syntax but does not embed `config.json` into SEA. [NODE-ESM-26] [NODE-SEA-26]

## A13 — native addon

```js
const addon = require("./build/Release/addon.node");
console.log(addon.answer());
```

**Expected:** reject. Node's documented SEA addon path is explicit asset embedding, temp extraction, and `process.dlopen()`, with target caveats. [NODE-SEA-26]

## A14 — worker secondary entry

```js
new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
```

**Expected:** reject. This is a code/resource graph with a secondary entry, not one closed main.

## A15 — package conditional divergence

Package `exports`:

```json
{
  "exports": {
    ".": {
      "import": "./esm.js",
      "require": "./cjs.cjs",
      "node": "./node.js"
    }
  }
}
```

Main:

```js
import value from "conditional-package";
```

**Expected:** producer must resolve and bundle the exact selected branch during production. A surviving bare import is rejected. Different producer condition ordering/configuration is provider evidence that must be fixed by the adapter. [NODE-PACKAGES-26]

## A16 — Bun future syntax

```js
// Assume provider output uses syntax accepted by the Bun version but rejected
// by the exact Node binary in the assembler offer.
console.log(providerGeneratedSyntax);
```

**Expected:** reject at exact offered-Node parser gate. Bun's Node target does not promise down-conversion. [BUN-BUNDLER]

## A17 — esbuild target but missing API

```js
// Syntax can be transformed successfully while the exact runtime lacks the API.
console.log(globalThis.someFutureNodeApi());
```

**Expected:** syntax checking may pass; feature negotiation or future execution may fail. Esbuild target does not polyfill APIs. The adapter must not claim more than its feature policy can establish. [ESBUILD-API]

## A18 — dynamic import with code cache

```js
await import("node:fs");
```

SEA configuration:

```json
{ "mainFormat": "module", "useCodeCache": true }
```

**Expected:** reject. Node documents that `import()` does not work with code cache. The strict profile eliminates both features. [NODE-SEA-26]

## A19 — ESM snapshot

```json
{ "mainFormat": "module", "useSnapshot": true }
```

**Expected:** reject before SEA work. This combination is officially unsupported. [NODE-SEA-26]

## A20 — same-length mutation

Producer observes:

```text
bytes = 1000
sha256 = A
```

Another process rewrites the file to 1000 different bytes before assembly.

**Expected:** acquisition returns `Changed`; byte-count checks alone are insufficient. The assembler never passes the unverified path directly to SEA.

## A21 — path replaced after validation

1. Consumer stats and hashes `/tmp/main.js`.
2. Attacker replaces it.
3. Consumer invokes SEA with `/tmp/main.js`.

**Expected:** design failure. Correct flow copies/materializes into a private destination while hashing and invokes SEA only on that private staged snapshot.

## A22 — main/importable divergence

```js
if (import.meta.main) {
  console.log("main");
} else {
  console.log("imported");
}
```

**Expected:** legal only as a main. A successful direct run does not establish importable-module equivalence. Ordinary ESM and injected SEA both expose main concepts, but producer wrappers can still alter imported behavior.

## A23 — provider metadata omission

A plugin emits this after the producer has already generated its metafile:

```js
const load = globalThis.__customLoader;
load(process.env.MODULE);
```

**Expected:** adapter must reject opaque plugin behavior or classify it through a trusted fixed plugin profile. “No external in metafile” is not enough.

## A24 — direct Node syntax success, SEA loader failure

```js
require("./local.cjs");
```

`node --check main.cjs` succeeds.

**Expected:** reject. Syntax success says nothing about the SEA default loader's ability to find `local.cjs`.

## A25 — signed-output policy

A macOS candidate is generated and native-format inspection passes, but required signing/verification is omitted.

**Expected:** it may be a staged candidate, not the requested validated distributable executable. Signing is assembler/publication policy, not a `NodeMain` field.

## Falsification use

Every conforming producer adapter should be tested against equivalent fixtures. The important proof is not that one legal fixture succeeds; it is that illegal fixtures cannot produce the sealed profile and that the same legal profile is consumed without provider branches.

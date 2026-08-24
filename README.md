# effect-build

effect-build expresses native build tools as composable Effect programs. This
integration branch provides Bun, Deno, esbuild, raw Node SEA, Rolldown, and the
new direct-Developer-ID Apple distribution family with typed errors and scoped
resource ownership.

The approved v0.5 target remains a coordinated hard cut. Its durable contract is
[`effect-build/v0.5-contract@1`](docs/v0.5-contract.md): keep the native lanes,
add one sealed Node-main profile and one static-browser-application profile,
publish immutable directory generations, and require exact evidence. The Apple
source/API track is implemented locally; its credential-backed and clean-host
certification is not earned. The core hard cut, portable author boundary, and
Bun/esbuild/Rolldown profile adapters and the Node SEA public hard cut are
implemented and frozen. Target-finalizer evidence, compatibility certification,
and the recoverable release coordinator remain.

| Package                 | Current candidate                                                                    | v0.5 target                                                               |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `effect-build`          | canonical artifacts and role-specific Author/Profile subpaths; no public `Toolchain` | same frozen API with exact compatibility evidence                         |
| `effect-build-apple`    | selected direct Developer ID operation family                                        | same API plus complete credential-backed and clean-host evidence          |
| `effect-build-bun`      | native operations plus exact-1.3.14 Node-main and browser profile adapters           | same API with exact compatibility evidence                                |
| `effect-build-deno`     | executable compile and native directory bundle                                       | exact 2.9.5 native evidence; no portable Profile until metadata proves it |
| `effect-build-esbuild`  | bounded native build/context/watch plus Node-main and browser profiles               | same API with exact compatibility evidence                                |
| `effect-build-node-sea` | honest `Raw` lane plus evidence-only `NodeMainExecutable` types                      | same API plus complete authenticated target-finalizer evidence            |
| `effect-build-rolldown` | bounded native build/watch plus Node-main and browser profiles                       | same API with exact compatibility evidence                                |

The current executable API remains usable while the cut is implemented:

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

const artifact = await Effect.runPromise(
  CompileExecutable.compileExecutable({
    entrypoint: "src/main.ts",
    outfile: "dist/app",
    minify: true,
  }).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

Current Bun and Deno bundle publication is incremental: a failure can leave a
mixed destination. The v0.5 durable path instead observes a complete
`TreeSnapshot`, seals an immutable content-addressed `DirectoryGeneration`, and
atomically changes only `CurrentGeneration`. A native `target: "browser"` or
`platform: "browser"` selector remains provider-specific and does not produce a
portable `StaticBrowserApplication`.

Hard interruption is a portable-profile guarantee only for schema-serializable
work inside an owned OS process tree. Native callbacks, plugins, contexts, and
watchers retain their provider-specific lifecycle semantics.

Apple distribution is a separate closed provider family, not a portable build
profile or generic deployer. Node SEA owns only the ad-hoc signature needed to
make its mutated Mach-O runnable. `effect-build-apple` owns Developer ID
Application/Installer distinctions, explicit hardened-runtime and entitlement
policy, `.app`/ZIP/DMG/flat-PKG forms, notarization, stapling, and digest-bound
assessment over its own digest-authenticated `Artifact` type. The initial flat
PKG is deliberately one authenticated `.app` component with explicit
identifier, version, and install location, built by `pkgbuild` with a mandatory
timestamp under an exact Developer ID Installer identity and verified by
`pkgutil`. `productbuild`, `productsign`, multi-component packages, and installer
scripts require a later API. Mac App Store and universal-binary construction
are outside v0.5. Its selected operation/service inventory and non-Notary
input/result structures are implemented and asserted by the public-surface
snapshot. Exact Notary JSON/status decoding and detailed receipt and evidence
shapes remain provisional through the credential-backed A7 fixtures. Local
implementation evidence does not earn A0, A1, or A9 without retained exact-head
receipts; A2–A8 and all eight clean-host G coordinates remain unearned. The
release is blocked until its credential-backed macOS x64 and arm64 matrix and
clean-host Gatekeeper exercises pass. See
[Apple distribution](docs/apple-distribution.md).

The exact current exports are generated in
[`tooling/public-api.json`](tooling/public-api.json). Frozen target subpaths,
profile IDs, canonical generation bytes, lifecycle bounds, exact evidence
points, and the fixed-seven manual release protocol live in
[`tooling/v05-contract.json`](tooling/v05-contract.json).

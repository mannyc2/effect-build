# effect-build

effect-build expresses native build tools as composable Effect programs while
keeping provider semantics, lifecycle, and publication ownership explicit.
This candidate is a hard cut to the complete accepted research surface: there
are no compatibility aliases for the superseded v0.5 API.

The canonical scope is
[`effect-build/research-complete-contract@1`](docs/research-complete-contract.md).
Every mandatory or positive-proof-gated operation with a selected export is
implemented in its provider-native `Api` or `Command` lane. Conditional
operations are also implemented and tested, but remain package-private until
their entire named gate is closed. Rejected and superseded operations are
absent. Implementation does not itself close a compatibility, credential, or
clean-host evidence gate.

## Public hard cut

The core package has exactly six public subpaths:

- `effect-build/Artifact`
- `effect-build/SystemTarget`
- `effect-build/Matrix`
- `effect-build/Author/Tool`
- `effect-build/Author/BorrowedOutput`
- `effect-build/Author/Executable`

Generic `BuildError`, `Target`, `Generation`, and `DurableFile` surfaces do not
exist. Neither do the former `BorrowedContent`, `TreeSnapshot`,
`StaticBrowserApplication`, provider `Profile`, Node SEA `Raw`, or inherited
provider `Build`, `Bundle`, `CompileExecutable`, `Context`, and `Watch`
subpaths. Providers expose only root `Api` and/or `Command` lanes as selected by
the research contract; operation modules are namespaces inside those lanes.

| Package                 | Public provider-native modules                                                                                                                                                                           | Implemented package-private conditional candidates                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `effect-build-bun`      | `Api.Transpiler`, `Api.Build`, `Api.CompileExecutable`; `Command.Build`, `Command.Watch`, `Command.CompileExecutable`                                                                                    | none                                                                                                       |
| `effect-build-deno`     | `Command.Transpile`, `Command.CompileExecutable`                                                                                                                                                         | API bundle, command bundle, compile watch                                                                  |
| `effect-build-esbuild`  | `Api.Build`, `Api.BuildToDirectory`, `Api.Transform`, `Api.AnalyzeMetafile`, `Api.FormatMessages`, `Api.Context`, `Api.ContextToDirectory`; `Command.Build`, `Command.BuildToDirectory`, `Command.Watch` | command serve                                                                                              |
| `effect-build-node-sea` | `Command.AssembleExecutable`                                                                                                                                                                             | none                                                                                                       |
| `effect-build-rolldown` | no public package; R6 did not admit it                                                                                                                                                                   | API build/watch/transform/parse/minify/resolve/scan/dev-engine/declaration/config and command bundle/watch |
| `effect-build-apple`    | `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`, `InstallerPackage`, `Notary`, `Staple`, `Assess`                                                                                                | none in the selected family                                                                                |

For example, Bun compilation now enters through the command lane:

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as BunCommand from "effect-build-bun/Command";

const program = BunCommand.CompileExecutable.compileExecutable({
  entrypoints: ["src/main.ts"],
  outfile: "dist/app",
  observation: "hashed",
});

const artifact = await Effect.runPromise(
  program.pipe(
    Effect.provide(BunCommand.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`Api` means an in-process provider host API. `Command` means an authenticated,
exact-version executable selected through `Author/Tool`; command output is
bounded and the tool is reauthenticated immediately before invocation.
Provider-direct durable operations truthfully permit partial output on failure.
Only `Author/Executable.publish` owns private staging, inspection, and atomic
single-file replacement.

Four fully implemented profile candidates remain package-private because their
admission gates are still open: offer-first `Author/NodeMain`, explicit hashed
`Profile/BrowserModulePayload`, `IncrementalNodeMain`, and the typed-watch
protocol. Their source and tests are accounting evidence, not public exports.

## Evidence status

The implementation is not the certification result. The provider-native,
browser, packed-consumer, Node target-finalizer, and Apple clean-host matrices
must produce exact-head receipts before their gates close. In particular:

- the exact five-host non-Apple compatibility and Node-finalizer coordinates
  are implemented as manual workflows but have not been earned by an exact-head
  run;
- provider lifecycle, host, offline, cross-target, and reproducibility gates
  remain open where the contract names them;
- BrowserModulePayload still requires real provider/browser/five-host evidence;
- Rolldown remains a private conditional package candidate until R6 and all
  operation-specific gates close;
- Apple source and local tool checks do not earn Developer ID, notarization,
  Gatekeeper, or clean-host certification.

The exact generated candidate exports are in
[`tooling/public-api.json`](tooling/public-api.json). Operation dispositions,
implementation/test accounting, named gates, target lanes, and authority
boundaries are in
[`tooling/research-complete-contract.json`](tooling/research-complete-contract.json).
The older [`tooling/v05-contract.json`](tooling/v05-contract.json) is historical
control-plane input, not a product-scope ceiling.

# API

The approved target is `effect-build/v0.5-contract@1` in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). The exact current
candidate exports remain asserted against
[`tooling/public-api.json`](../tooling/public-api.json). Current and target
surfaces now match the frozen v0.5 roots and subpaths. The Apple, core Stage 2,
provider-profile Stage 3, and Node SEA Stage 4 symbols are frozen; compatibility
and external certification remain separate promotion gates.

## Current implemented surface

Operations live at package subpaths:

```ts
import * as AppleAppBundle from "effect-build-apple/AppBundle";
import * as AppleArtifact from "effect-build-apple/Artifact";
import * as AppleAssess from "effect-build-apple/Assess";
import * as AppleCodeSign from "effect-build-apple/CodeSign";
import * as AppleDiskImage from "effect-build-apple/DiskImage";
import * as AppleInstallerPackage from "effect-build-apple/InstallerPackage";
import * as AppleNotary from "effect-build-apple/Notary";
import * as AppleStaple from "effect-build-apple/Staple";
import * as AppleZip from "effect-build-apple/Zip";
import * as BunBundle from "effect-build-bun/Bundle";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as BunProfile from "effect-build-bun/Profile";
import * as DenoBundle from "effect-build-deno/Bundle";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as EsbuildProfile from "effect-build-esbuild/Profile";
import * as Watch from "effect-build-esbuild/Watch";
import type * as NodeMainExecutable from "effect-build-node-sea/NodeMainExecutable";
import * as Raw from "effect-build-node-sea/Raw";
import * as Rolldown from "effect-build-rolldown/Build";
import * as RolldownProfile from "effect-build-rolldown/Profile";
import * as RolldownWatch from "effect-build-rolldown/Watch";
import * as Target from "effect-build/Target";
```

`BunCompile.compileExecutable` and `DenoCompile.compileExecutable` take an
entrypoint, output file, explicit provider-supported target, optional working
directory, and native options. Hashing is mandatory. They return the current
`Artifact.Executable` observation.

`BunBundle.directWrite` and `DenoBundle.directWrite` take non-empty entrypoints
plus an output directory and return provider-local `DirectWriteOutcome` values
with mandatory file digests. The provider writes the caller destination
directly, so a failed operation can leave a mixed directory. Native Bun `target: "browser"` and Deno
`platform: "browser"` are provider selectors, not portable application
closure.

esbuild `Build`, `Context`, and `Watch` expose its native in-memory and scoped
context semantics. Rolldown `Build` and `Watch` expose native handles and
completed-result events. Both watch streams retain one pending completion,
coalesce to the latest with an explicit superseded count, and keep cleanup
failure in Effect Cause. Rolldown closes each native result before delivery and
awaits one watcher close during stream shutdown. These are provider-native
operations; they do not inherit the portable OS process-tree guarantee.

`Author/NodeMain.seal` and `Profile/StaticBrowserApplication.build` are the two
closed portable products. Bun, esbuild, and Rolldown each expose one explicit
`Profile.layer` that provides both authoring services. The core validates the
request before provider work, owns private staging and immutable publication,
requires complete provider metadata, and rejects local runtime dependencies or
external browser graph edges. The packed consumer gate installs a real
out-of-tree adapter with a duplicate core graph and contains no provider branch.
Rolldown 1.2.5 has no CSS bundling; CSS is therefore admitted only as an
explicit authenticated browser resource for that provider.

Node `Raw.assembleExecutable` accepts file or byte mains and assets plus a
caller-asserted target through `node --build-sea`. This is a provider-native
lane. Caller assets, bytes, separate builder/base selection, and asserted target
cannot mint portable SEA evidence. `NodeMainExecutable` exposes only the frozen
evidence-bearing types and constants; the finalizer callback and constructors
remain package-private to the schema-bound repository matrix.

That private matrix is manually admitted and spans all 108 producer, format,
construction-host, and target coordinates. Its controls use canonical JSON,
strict two-file input/one-file output/one-file receipt artifact layouts,
authoritative Actions REST bindings, exact-host admission, native-format and
architecture inspection, and target execution. The repository aggregates only
after all coordinate jobs succeed. Until a workflow run returns those receipts,
the target support cells remain unadvertised.

Non-Apple compatibility certification is also an explicit manual matrix. It
executes every frozen browser, provider-native, and packed-consumer coordinate
and aggregates 84 job-bound receipt artifacts without pruning. The browser lane
uses exact Playwright 1.62.1 revisions and exercises a dynamic chunk, generated
module host, authenticated stylesheet and resource, and immutable generation.
The packed lane tests both the oldest admitted Effect peer and the repository
development point with strict npm peer resolution on all three certification
hosts. Implemented workflow topology is not substituted for executed receipts.

`effect-build-apple` exposes authenticated artifacts, Developer ID Application
signing, app/ZIP/DMG construction, the deliberately narrow one-app Developer ID
Installer package, Notary submission/reconciliation, stapling, and digest-bound
assessment. Its selected operation/service names are:

- `Artifact`: `observeFile`, `observeTree`, `observeExecutable`,
  `isFileArtifact`, `isTreeArtifact`, `isKind`, `reference`, `revalidate`, and
  `sameIdentity`;
- `CodeSign`: `developerIdApplication`, `sign`, `Signer`, and `layer`;
- `AppBundle`, `Zip`, and `DiskImage`: `create`, `Creator`, and `layer`;
- `InstallerPackage`: `developerIdInstaller`, `create`, `Creator`, and `layer`;
- `Notary`: `submit`, `operatorReconciliationEvidence`, `reconcile`, `info`,
  `wait`, `log`, `history`, `readReceipt`, `submittedReceiptPath`, `Notarizer`,
  and `layer`;
- `Staple`: `staple`, `Stapler`, and `layer`; and
- `Assess`: `assess`, `Assessor`, and `layer`.

The non-Notary input/result structures are selected. A stored submitted Notary
receipt is data, not query authority; it must pass explicit operator
reconciliation before `info`, `wait`, or `log`. Exact Notary JSON/status decoding
and detailed receipt/reconciliation-evidence shapes remain provisional through
credential-backed A7.

The Stage 2 hard cut removed `effect-build/Toolchain` without a compatibility
alias. `Author/Tool` now binds a canonical executable path, version, and byte
digest and detects replacement around invocation.

## Frozen target subpaths

Stage 0 froze root namespace and subpath names. Each owning implementation stage
must freeze its runtime/declaration symbols before first export. All four owning
stages are frozen in `tooling/public-api.json`; missing compatibility and
credential-backed evidence still block release.

Core keeps `Artifact`, `BuildError`, and `Target`, and adds the role-specific
`Author/Tool`, `Author/BorrowedContent`, `Author/TreeSnapshot`,
`Author/Generation`, `Author/NodeMain`, and
`Profile/StaticBrowserApplication` subpaths. Bun, esbuild, and Rolldown add one
`Profile` subpath. Node SEA replaces `AssembleExecutable` with `Raw` and
`NodeMainExecutable`. Deno has no portable Profile subpath unless a later
explicit contract revision admits one.

The seventh package `effect-build-apple` implements root namespaces and matching
subpaths for `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`,
`InstallerPackage`, `Notary`, `Staple`, and `Assess`. This family is direct
Developer ID distribution only, not Mac App Store support or a generic
deployment API; universal-binary construction is also outside v0.5. The exact
selected operations and non-Notary types are frozen by the current generated
surface. Only the A7-dependent Notary decoder/status and detailed receipt/
evidence structures remain provisional and release-blocking.

The same cut removes current `Artifact.Bundle`, `Artifact.BundleFile`,
caller-authored `Artifact.Tool`, and `Target.host`. Durable directory results use
`TreeSnapshot`, `DirectoryGeneration`, and `CurrentGeneration`; portable Node
results progress through sealed, assembled, target-supported, and exact-artifact
executed evidence states. Native Bun and Deno bundle result ownership moves to
their respective `Bundle` subpaths as provider-local `Bundle` and `BundleFile`
declarations before the core declarations disappear.

Portable fan-out remains plain Effect composition. One unchanged consumer uses
an explicit provider Layer and contains zero provider-name branches.

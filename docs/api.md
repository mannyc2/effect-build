# API

The approved target is `effect-build/v0.5-contract@1` in
[`tooling/v05-contract.json`](../tooling/v05-contract.json). The exact current
candidate exports remain asserted against
[`tooling/public-api.json`](../tooling/public-api.json). Current and target
surfaces are intentionally separate until the source hard cut.

## Current candidate surface

Operations live at package subpaths:

```ts
import * as BunBundle from "effect-build-bun/Bundle";
import * as BunCompile from "effect-build-bun/CompileExecutable";
import * as DenoBundle from "effect-build-deno/Bundle";
import * as DenoCompile from "effect-build-deno/CompileExecutable";
import * as Build from "effect-build-esbuild/Build";
import * as Context from "effect-build-esbuild/Context";
import * as Watch from "effect-build-esbuild/Watch";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";
import * as Rolldown from "effect-build-rolldown/Build";
import * as RolldownWatch from "effect-build-rolldown/Watch";
import * as Target from "effect-build/Target";
```

`BunCompile.compileExecutable` and `DenoCompile.compileExecutable` take an
entrypoint, output file, optional working directory, provider-supported target,
hash option, and native options. They return the current
`Artifact.Executable` observation.

`BunBundle.bundle` and `DenoBundle.bundle` take non-empty entrypoints plus an
output directory and return the current `Artifact.Bundle`. Publication is
incremental: files are renamed into the destination one at a time, so a failed
operation can leave a mixed directory. Native Bun `target: "browser"` and Deno
`platform: "browser"` are provider selectors, not portable application
closure.

esbuild `Build`, `Context`, and `Watch` expose its native in-memory and scoped
context semantics. Rolldown `Build` and `Watch` expose native handles and events.
These are provider-native operations; they do not inherit the portable OS
process-tree guarantee. Rolldown Watch promotion additionally requires bounded
delivery and awaited exactly-once result ownership.

The current Node `AssembleExecutable` accepts file or byte mains and assets and
targets an inferred host through `node --build-sea`. This is a raw host-native
lane. Caller assets, bytes, separate builder/base selection, and target
inference cannot mint portable SEA evidence.

The candidate still exports `effect-build/Toolchain`. It is legacy transition
surface, not an earned third-party SPI. The Stage 2 hard cut deletes its root
namespace and subpath without a compatibility alias.

## Frozen target subpaths

Stage 0 freezes root namespace and subpath names only. It intentionally does not
freeze every runtime/declaration symbol; each owning implementation stage must
do that before its first source export, and unresolved symbol lists block
release.

Core keeps `Artifact`, `BuildError`, and `Target`, and adds the role-specific
`Author/Tool`, `Author/BorrowedContent`, `Author/TreeSnapshot`,
`Author/Generation`, `Author/NodeMain`, and
`Profile/StaticBrowserApplication` subpaths. Bun, esbuild, and Rolldown add one
`Profile` subpath. Node SEA replaces `AssembleExecutable` with `Raw` and
`NodeMainExecutable`. Deno has no portable Profile subpath unless a later
explicit contract revision admits one.

The target-only seventh package `effect-build-apple` freezes root namespaces
and matching subpaths for `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`,
`InstallerPackage`, `Notary`, `Staple`, and `Assess`. It is absent from the
current generated public-surface snapshot; its owning parallel implementation
must freeze exact runtime/declaration symbols before first export. This family
is direct Developer ID distribution only, not Mac App Store support or a
generic deployment API; universal-binary construction is also outside v0.5.
Exact operation function names, full option types, Notary JSON/status decoding,
and detailed receipt/evidence shapes remain release-blocking rather than being
guessed ahead of the parallel red/green implementation and credential-backed A7
fixtures.

The same cut removes current `Artifact.Bundle`, `Artifact.BundleFile`,
caller-authored `Artifact.Tool`, and `Target.host`. Durable directory results use
`TreeSnapshot`, `DirectoryGeneration`, and `CurrentGeneration`; portable Node
results progress through sealed, assembled, target-supported, and exact-artifact
executed evidence states. Native Bun and Deno bundle result ownership moves to
their respective `Bundle` subpaths as provider-local `Bundle` and `BundleFile`
declarations before the core declarations disappear.

Portable fan-out remains plain Effect composition. One unchanged consumer uses
an explicit provider Layer and contains zero provider-name branches.

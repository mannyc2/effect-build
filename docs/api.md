# API

## Core

The `effect-build` root exports namespaces for these exact subpaths:

- `effect-build/Artifact` — hashed file/tree/executable identities, intrinsic provenance, and path-free adoption projections.
- `effect-build/Author/Tool` — deterministic executable selection, content identity, provider observation, admission, and launch-time reauthentication.
- `effect-build/Author/BorrowedOutput` — scoped observations of provider-owned output.
- `effect-build/Author/File`, `/Tree`, and `/Executable` — explicit durable finalizers and verified continuations.
- `effect-build/Matrix` — bounded, identity-preserving coordinate execution.
- `effect-build/SystemTarget` — artifact target vocabulary established by inspectors.

There is no generic process runner, tool registry, host detector, build error union, retry policy, or compatibility facade.

## Providers

Provider operation modules are namespaces inside permanent `Api` and `Command` lanes:

```ts
import { Api, Command } from "effect-build-bun";
import * as DenoCommand from "effect-build-deno/Command";
import * as EsbuildApi from "effect-build-esbuild/Api";
import * as NodeSeaCommand from "effect-build-node-sea/Command";
```

Bun exposes `Api` and `Command`; Deno exposes only admitted command operations; esbuild exposes `Api` and `Command`; Node SEA exposes `Command`. Rolldown remains a private package with an inert root until its package and operation gates are independently closed.

Only executable assembly operations return canonical durable executable values. Native memory results remain native, and provider-direct directory operations return explicit provider-direct results that may be partial after failure or interruption.

## Producers

The public producer packages are:

- `effect-build-archives`: deterministic ZIP/tar.gz and exact-Git-tree source archives.
- `effect-build-python`: uv wheel and sdist production.
- `effect-build-nfpm`: deb, rpm, apk, Arch Linux, and unsigned MSIX packages.
- `effect-build-apple`: app bundles, DMG, pkg, signing, notarization, staple, and assessment.
- `effect-build-windows`: Authenticode MSIX signing and verification.
- `effect-build-sbom`: SPDX JSON 2.3 and CycloneDX JSON 1.6.

Finalizing functions return core `Artifact.HashedFile` or `Artifact.HashedTree` refinements. Notary submission/query/log and Gatekeeper assessment are provider-native evidence results, not durable artifact types.

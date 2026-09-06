# effect-build-nfpm

Produce Debian, RPM, Alpine, Arch Linux, and unsigned MSIX packages from finalized payload files with a selected nFPM
executable. Each operation returns one atomically finalized `Artifact.HashedFile`.

## Install

```sh
npm install --save-exact effect-build-nfpm@0.6.3 effect-build@0.6.3 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108
```

These examples use Effect v4 and its matching Node platform package.

Install **nFPM 2.47.x** separately and make it available on PATH, or pass its path to `Package.layer({ executable })`.
Supply metadata and payloads explicitly; effect-build renders the native configuration for you.

## Build a Debian package

This helper accepts a previously finalized data file. Choose metadata appropriate to your application and
a fresh output path, then run the returned Effect at your application's entry point.

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Package from "effect-build-nfpm/Package";
import * as Artifact from "effect-build/Artifact";

const packager = Package.layer();

export const buildDebianPackage = (file: Artifact.HashedFile) =>
  Package.buildDeb(
    new Package.PackageInput({
      metadata: new Package.PackageMetadata({
        name: "hello-data",
        version: "1.0.0",
        architecture: "all",
        maintainer: "Example Maintainer <maintainer@example.com>",
        description: "An example data package",
        contents: [
          new Package.PackageContent({
            artifact: file,
            dst: "/usr/share/hello-data/greeting.txt",
            mode: Artifact.fileMode(0o644),
          }),
        ],
      }),
      release: "1",
      mtime: "2026-01-01T00:00:00Z",
      outfile: "dist/hello-data.deb",
    }),
  ).pipe(
    Effect.provide(packager),
    Effect.provide(NodeServices.layer),
  );
```

## Formats and boundaries

The `Package` module exposes `buildDeb`, `buildRpm`, `buildApk`, `buildArchLinux`, and `buildMsix`, plus
`buildPackage(format, input)`. `formatProjection` supplies each format's extension and media type. MSIX additionally
requires the closed `MsixOptions` configuration; it produces unsigned output for a separate signing step.

Payloads must be `HashedFile` values from `File.publish` or a finalized tree's file projection. A compiler's
`HashedExecutable` is a distinct identity; use `File.withVerifiedBytes` with `File.publish` to finalize those bytes
as a file payload first. Payload artifacts are verified before private materialization. The selected nFPM bytes are checked before launch.
Schemas constrain metadata, absolute destinations, modes, timestamps, format fields, and output extensions. Raw native
configuration, scripts, globs, environment expansion, and signing options are not accepted.

An existing destination is rejected. Package architecture metadata is supplied by the caller; choose it to match the
payload you compiled.

## More

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) · [API guide](https://github.com/mannyc2/effect-build/blob/main/docs/api.md) · [Error handling](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)

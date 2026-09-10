# effect-build-node-sea

Package a bundled CommonJS script and its assets as a Node
[single executable application](https://nodejs.org/api/single-executable-applications.html), as an
Effect program. The result is an `Artifact.Executable` whose target is read from the base Node
binary's header, ready for an archive, an installer, or a signer.

```sh
npm install --save-dev --save-exact effect-build-node-sea@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

## Usage

```ts
import { Effect, Path } from "effect";
import { Artifact } from "effect-build";
import * as Esbuild from "effect-build-esbuild";
import * as NodeSea from "effect-build-node-sea";

const sea = Effect.gen(function*() {
  const path = yield* Path.Path;
  const bundle = yield* Esbuild.buildToDirectory({
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outdir: "dist/sea",
  });
  const main = yield* Artifact.file(path.join(bundle.path, "main.js"), bundle.producedBy);
  const license = yield* Artifact.file("LICENSE", bundle.producedBy);
  return yield* NodeSea.assemble({ main, assets: { "LICENSE": license }, outfile: "dist/cli" });
}).pipe(Effect.provide(NodeSea.layer()));
```

`assemble({ main, assets?, outfile, cwd?, disableExperimentalSEAWarning?, atomic?, onExists?, prefix? })`
returns the executable. `main` must be bundled CommonJS: a SEA's `require()` loads only Node's
built-ins, so bundle every dependency into the script. `assets` are regular artifacts keyed by
the name the program reads them with (`require("node:sea").getAsset(name)`).

Assembly writes the SEA preparation blob, copies the base executable, injects the blob with
postject, ad hoc signs it on macOS with `xcrun codesign` (injection invalidates the base
signature, and an unsigned arm64 binary will not launch), and checks the header. Inputs and
intermediates use private temporary files, even with `atomic: false`. Windows outputs must end in
`.exe`. Replace the ad hoc signature with `Apple.sign` before shipping.

## Layer and versions

`NodeSea.layer({ executable?, baseExecutable?, version? })` resolves two Node binaries: the
builder that runs the SEA tooling (default: the current process) and the base that is copied and
injected (default: the builder). Both must report the same version. `NodeSea.supported` is
`>=22.0.0 <27.0.0`, the versions sharing the preparation blob and injection workflow, and
`NodeSea.tested` records the CI fixtures, 22.0.0 and 26.7.0. The target comes from the base
executable's header, so a base running under emulation is recorded as itself.

## Errors

`NodeSea.AssembleError` is `InputInvalid` (tag `NodeSeaInputInvalid`), `Failed` (tag `NodeSeaFailed`,
with the failing `operation` and its `cause`), the `Tool` errors, `Artifact.ArtifactError`,
`Executable.InspectError`, `Executable.TargetMismatch`, or `Commit.CommitError`.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)

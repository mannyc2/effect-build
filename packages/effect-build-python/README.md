# effect-build-python

Write Python wheels directly from artifacts, or build a Python project's sdist and wheel with
[uv](https://docs.astral.sh/uv/), as Effect programs. The wheel writer needs no Python; it is how
a native CLI reaches `pip install`.

```sh
npm install --save-dev --save-exact effect-build-python@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

## Wheels from artifacts

```ts
import * as Python from "effect-build-python";

const wheel = (executable: Artifact.Executable) =>
  Python.wheel({
    metadata: { name: "hello-cli", version: "1.0.0", summary: "Hello CLI", requiresPython: ">=3.9" },
    tags: { python: "py3", abi: "none", platform: "manylinux_2_17_x86_64" },
    entries: [{ artifact: executable, path: "hello_cli-1.0.0.data/scripts/hello" }],
    outdir: "dist/wheels",
  });
```

`wheel({ metadata, tags, entries, outdir, cwd?, rootIsPurelib?, entryPoints?, atomic?, onExists?, prefix? })`
writes `<name>-<version>-<python>-<abi>-<platform>.whl` into `outdir` and returns it as an
`Artifact.File`. It generates `METADATA`, `WHEEL`, and a `RECORD` whose digests come from each
artifact's record, plus `entry_points.txt` when `entryPoints` is given.

- **Native commands.** An entry at `<name>-<version>.data/scripts/<command>` (name and version
  normalized: `hello_cli-1.0.0`) is installed onto the environment's command path, so the user gets
  `hello` with no Python wrapper. Use `hello.exe` for Windows wheels.
- **Metadata.** `name` is normalized per PEP 503 and `version` per PEP 440; `summary`, `license`,
  `requiresPython`, and `projectUrls` are optional.
- **Tags.** `python`, `abi`, and `platform` may each be a dot-separated set. Every platform tag
  must be able to run every executable entry: `win_amd64` and `win_arm64`; `macosx_<major>_<minor>_arm64`
  and `_x86_64`; `linux_x86_64` and `linux_aarch64`; `manylinux*` for glibc binaries; `musllinux*`
  for musl binaries. `any` cannot describe a native executable. The minimum macOS version and the
  manylinux or musllinux floor are promises only you can make.
- **Entries** are regular artifacts. Executables get mode `0755`, or set `executable: true`.
  `.dist-info` entries belong to the writer, and paths that collide after case folding or NFC
  normalization are rejected.
- `rootIsPurelib` defaults to true only for `abi: "none"` with `platform: "any"`. `entryPoints`
  takes groups such as `{ console_scripts: { hello: "hello_cli.cli:main" } }`.

Wheel bytes depend only on the inputs: DEFLATE level 6, fixed timestamps, sorted entries.
Payloads stream from their artifacts in 64 KiB chunks and are verified as they pass. The only
size limits are ZIP32's (65,535 entries including generated metadata, 4 GiB per entry and per
wheel, names up to 65,535 bytes), reported as `ArchiveFormatLimit` before writing; a payload
that streams a different byte count than its record fails with `ArchiveEntrySizeMismatch`. Both
come from `effect-build-archives`, whose `Zip.encode` writes the wheel.

## Projects with uv

```ts
const built = Python.build({ project: "python/hello", outdir: "dist/python" }).pipe(
  Effect.provide(Python.layer({ executable: process.env.EFFECT_BUILD_UV_BIN })),
);
```

`build({ project, outdir, atomic?, onExists?, prefix? })` runs `uv build`, which builds the sdist
and then the wheel from it with the project's own build backend, and returns
`{ wheel: Artifact.File, sdist: Artifact.File }`. Exactly one wheel and one `.tar.gz` sdist must
result. `Python.layer({ executable?, version? })` resolves uv: `Python.supported` is
`>=0.12.0 <1.0.0` and `Python.tested` is 0.12.0. `outdir` is replaced as a whole, and with
`atomic: false` it is emptied before uv writes, so an earlier build's distributions never enter
the result.

## Errors

`Python.WheelError` is `InputInvalid` (tag `PythonInputInvalid`), `ArchiveFormatLimit`,
`ArchiveEntrySizeMismatch`, `Artifact.ArtifactError`, or `Commit.CommitError`. `Python.BuildError`
is `InputInvalid`, the `Tool` errors, `Artifact.ArtifactError`, or `Commit.CommitError`.

[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Tools and providers](https://github.com/mannyc2/effect-build/blob/main/docs/providers.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md)

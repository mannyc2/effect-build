# effect-build-python

Build Python projects into a wheel and source distribution, or write a wheel
directly from existing artifacts.

```ts
import * as Python from "effect-build-python";

const distributions = Python.build({ project: "python", outdir: "dist/python" });
```

`build` returns `{ wheel: Artifact.File, sdist: Artifact.File }`. Provide
`Python.layer()` and platform services to run it. The layer resolves `uv` from
PATH; `executable` selects a different binary and `version` overrides the tested
`>=0.12.0 <1.0.0` range. uv builds the sdist first, then builds the wheel from that
archive using the project's build backend. A `uv.lock` file is not required.

Both outputs are checked before the output directory is committed. Existing
output is replaced by default; `atomic: false` writes directly. Output must contain
exactly one wheel and one `.tar.gz` sdist, so stale distributions in a direct
output directory must be removed before rebuilding another version.

`Python.wheel({ metadata, tags, entries, outdir })` writes a wheel without uv or
Python. Entries contain a core regular artifact and its path inside the wheel.
The writer verifies entry bytes and adds METADATA, WHEEL, and SHA-256 RECORD files;
the wheel filename comes from its package name, version, and compatibility tags.

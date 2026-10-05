# effect-build-python

`Python` runs uv's native build command as an Effect service. Import it from `effect-build-python`; its input schema
and options are available at `effect-build-python/Python`.

`Python.layer` resolves uv once. `build` takes a project path and output directory, returns the absolute directory,
and uses uv's default wheel-from-sdist behavior. Distribution filenames and build backend decisions stay native to uv.
Further options go through `extraArgs`; cwd/env retain their platform meaning.

`atomic: true` stages the output directory and commits each produced file separately. Existing unrelated files remain.
The application reads distribution paths with FileSystem and chooses hashing or verification independently.

Methods capture their platform dependencies. Applications provide the platform layer; `Python.layerConfig` reads
layer options through Config. Native backend failures remain `ToolError` values with uv's own diagnostics.

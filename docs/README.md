# Documentation

These guides describe the 0.9.0 service API.

- [Getting started](getting-started.md): run a native command and a Bun build from the source checkout.
- [Tools and bindings](providers.md): service construction, native options, resolution, and output policy.
- [Errors and publication](errors.md): the five tool reasons and the file-operation failure boundaries.
- [Recipes](recipes.md): compose operations, replace services in tests, and own live process sessions.
- [Digests and memoization](digests.md): hash current bytes, choose a cached lifetime, and verify afresh.
- [Compatibility](compatibility.md): Effect and runtime requirements and native tool boundaries.

The executable examples under [examples/](../examples) are typechecked with the source API.
[Tool runs](../examples/tool-runs/src/main.ts), [utility opt-ins](../examples/tool-runs/src/Optins.ts),
[Bun builds](../examples/bun-build/src/main.ts), [Node SEA](../examples/tool-runs/src/NodeSea.ts), and the
[ffmpeg session](../examples/ffmpeg-session) supply the examples used in these guides.

The [signing applications](../examples/signing) are typechecked alongside the examples.
Their manual workflow runs Developer ID notarization and Windows Trusted Signing with
the caller's identities; normal verification does not run credentialed operations.

After building the packages, run:

```sh
bun run docs
```

This generates the API reference in `dist/api` from the actual exports and JSDoc using TypeDoc.
Open `dist/api/index.html` to browse it. Generated pages are build output; the service classes
and their documented method signatures remain the reference source.

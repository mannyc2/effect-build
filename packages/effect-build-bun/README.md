# effect-build-bun

`compile` produces an `Artifact.Executable`; `bundle` produces an
`Artifact.Directory`; `build` returns stdout bytes. `watch` owns its process in an
Effect scope. Provide `Bun.layer({ executable?, version? })` and platform services.

Targets accept core names such as `linux-arm64` and Bun names such as
`bun-linux-x64-baseline`. Windows outputs require an `.exe` suffix.

The tested range is `>=1.3.14 <1.4.0 || >=1.4.2 <1.5.0`: 1.4.0 is unreviewed and
1.4.1 has a reproduced variable-collision bug. An explicit `version` range or
predicate overrides this default.

`effect-build-bun/api` exports `Build` and `Transpiler` wrappers for native results.
**The API subpath requires the Bun runtime.** The root CLI provider also runs from
Node. See the [four-target example](../../examples/cli).

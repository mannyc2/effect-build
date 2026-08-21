# 0.3 to 0.4 migration ledger

`MIGRATION.json` is exhaustive for the released `v0.3.0` public surface and
maps every observation to the frozen 0.4 surface or an explicit removal.

The validator reconstructs the baseline from tag
`f06f96ca88b6278e5f23a898d758b99fa9322108`, including package export maps,
top-level runtime and declaration exports, all five core namespace objects,
and explicitly named README/docs operations. It also binds the R1/product
decision inputs to integration commit
`9f29d02f50211f85852d593579a2c96a6dc5167c`.

Run:

```sh
node research/post-0.3/freeze/validate-migration.mjs
```

The baseline has 155 category-specific observations:

| Category | Count |
| --- | ---: |
| Package roots | 5 |
| Non-root subpaths | 2 |
| Top-level runtime exports | 49 |
| Top-level declaration-only exports | 51 |
| Core namespace runtime members | 33 |
| Core namespace declaration-only members | 3 |
| Explicitly documented work/setup operations | 12 |

A runtime symbol that is also explicitly documented appears once in each of
those requested inventory categories and is assigned the same migration rule.
Runtime-backed declarations are not duplicated as declaration-only exports.

## Frozen result

- Keep the existing five package names.
- Remove `effect-build/Integration` and `effect-build/Provider`, including every
  export, with no compatibility delegate.
- Remove Bun and Esbuild `withJavaScriptBundle` and their narrow bundle
  contracts. Native build operations are distinct operations, not aliases.
- Remove the ambiguous Bun/Deno root `Compiler` surfaces.
- Keep the Bun/Deno scalar name `compileExecutable`, but move to the eventual
  operation-specific coordinate with no root alias.
- Keep `compileExecutableMatrix`, but replace the 0.3 artifact-array and
  aggregate-failure contract with the M2/R7 ordered cell report.
- Rename `createExecutable` to
  `effect-build-node-sea/AssembleExecutable#assembleExecutable`, with no
  old-name alias.
- Admit only `CAN-BUN-012`, `CAN-DENO-010`, `CAN-ESB-001`, `CAN-ESB-011`, and
  `CAN-NODE-001`; all other R1 operation identities are defer or reject.
- Expose exact core modules `Artifact`, `SystemTarget`, `Matrix`,
  `Author/Tool`, `Author/BorrowedOutput`, and `Author/Executable`.
- Expose Esbuild only through exact `Build` and `Context` modules.

## Hard-cut implications

There are no conditional or unknown targets and no blocking reconciliations.
Every `replace` or `rename` rule contains an identity-specific exact target
coordinate (or explicit target set for a deliberate contract split). Every
`remove` rule contains a no-replacement reason.

The validated disposition totals are 5 retain, 2 rename, 74 replace, and 74
remove observations; all 155 are resolved.

Package roots are namespace-only. No 0.3 root callable, `Integration` or
`Provider` subpath, `Compiler` root alias, bundle continuation, compatibility
delegate, fallback, or legacy Node SEA path survives. The matrix keeps its
operation name but hard-cuts to the exact `Matrix` report/error vocabulary.

# Portable role opportunities

## Role 1 — `NodeMainProgram` (plausible, not certified)

**Domain distinction:** produce a direct Node-style main program, not an importable library and not a runtime executable.

**Canonical representation:** one main entry, explicit module format/runtime expectations, scoped or durable output refinement, plus provider-native metadata and diagnostics.

**Construction authority:** provider adapter retains resolver, externals, platform and plugin authority; the role does not invent a common plugin model.

**Invariants:** exactly one direct main; output identity is explicit; imported-module semantics are outside the role; native metadata remains accessible; failure is finite role validation plus native provider failure.

**Evidence:** [REC-003 · RECORDED-EXECUTION] one exact direct-main fixture matched between Bun and esbuild, while imported semantics diverged. This supports a narrow hypothesis and falsifies the broader importable-module form.

**Falsifier/probes:** CJS and ESM; direct execution and import; dynamic import; builtins; externals; packages; top-level await; source maps; assets; chunks; multiple entries; Node release syntax and runtime execution. Any required consumer provider branch inside the promised domain falsifies the role.

## Role 2 — `BrowserModuleGraphApplication` (lower confidence)

**Domain distinction:** close over module-owned HTML/JS/CSS/assets, not arbitrary static-site files.

**Canonical representation:** HTML/module entry graph and a closed native output set with entry/chunk/asset relationships; durability is a separate refinement.

**Evidence:** [REC-009 · RECORDED-EXECUTION] exact Bun/Deno fixtures matched narrow browser module output and HTML module-owned graph. [REC-005 · FALSIFIED] broad static web failed because Deno dropped a top-level linked stylesheet.

**Gates:** Deno remains experimental; permission authority is unresolved; public path, nested CSS/assets, dynamic imports, multiple entries, source maps, output closure and direct-write behavior need an adversarial matrix.

## Withdrawn roles

- **Runtime-neutral executable:** [REC-004 · FALSIFIED] embedded Bun and Deno runtimes differ materially. Runtime-named products remain possible.
- **Typed cross-provider CLI watch events:** [REC-006 · FALSIFIED] exact Bun/Deno fixtures produced human streams, not a common machine protocol. Expose opaque provider-native watch handles/processes instead.
- **Broad static web:** falsified by linked-asset behavior.
- **Rolled-up declarations:** falsified by unresolved local type import in the exact Deno fixture.

## Provider-only operations with no honest peer

Bun full-stack HTML executable; Deno compile with embedded permission/runtime acquisition; esbuild transform and integrated context/serve; Node SEA assets, code cache, startup snapshot, builder/base injection and signing. These remain valuable even without substitution.

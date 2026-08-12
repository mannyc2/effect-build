# Compiler modules

Importing a compiler subpath selects one CLI's semantics for both
`compileExecutable` and `compileExecutableMatrix`. It does not select the
runtime that hosts the Effect program. A matrix never mixes compilers.

## Discovery and override

Both `Bun.layer()` and `Deno.layer()` use `PATH` when no option is supplied,
then probe the resolved executable for its absolute path and version. An
explicit Layer option bypasses `PATH`:

```ts
Bun.layer({ executable: "/opt/bun/bin/bun" });
Deno.layer({ executable: "/opt/deno/bin/deno" });
```

The explicit path must be absolute. A missing tool raises `ToolNotFound`; a bad
probe raises `ToolProbeFailed`. One provided Layer discovers and probes once,
then serves both scalar and matrix calls. The package never downloads or
installs a compiler.

## Target authority

Each provider's package-private target table is the single authority for its
public `Target` schema, static target type, CLI mapping, native validation, and
support-manifest equality test. Root Artifact and matrix-failure schemas use
pure projections of those same tables to reject provider-invalid pairs. Target
literals are not copied into a registry or broad string overload.

Matrix output paths are canonical:
`<resolved outdir>/<name>-<canonical target>[.exe]`. The Windows suffix is
derived from the target; callers cannot override it per cell.

## Bun

| Option      | Type                   | CLI meaning           |
| ----------- | ---------------------- | --------------------- |
| `minify`    | `boolean`              | `--minify`            |
| `sourcemap` | `"linked" \| "inline"` | `--sourcemap=<value>` |
| `bytecode`  | `boolean`              | `--bytecode`          |

`Bun.Target` has exactly six targets:

- `macos-x64`
- `macos-aarch64`
- `linux-x64-gnu`
- `linux-x64-musl`
- `linux-aarch64-gnu`
- `windows-x64`

Bun 1.3.9 is the pinned support fixture used to compile and externally validate
all six under the Node orchestrator.

## Deno

| Option             | Type                                | CLI meaning                                          |
| ------------------ | ----------------------------------- | ---------------------------------------------------- |
| `bundle`           | `boolean`                           | `--bundle`                                           |
| `minify`           | `boolean`, only with `bundle: true` | `--minify`                                           |
| `permissions.all`  | `true`                              | `--allow-all`                                        |
| scoped permissions | `true \| readonly string[]`         | `--allow-read`, `--allow-net=...`, and related flags |

Scoped permission names are `read`, `write`, `net`, `env`, `run`, `ffi`, `sys`,
and `import`. `Deno.Target` has exactly six targets:

- `macos-x64`
- `macos-aarch64`
- `linux-x64-gnu`
- `linux-aarch64-gnu`
- `windows-x64`
- `windows-aarch64`

Deno musl targets are absent from `Deno.Target` and reject at both the static
and runtime schema boundaries. Deno 2.9.3 is the pinned support fixture used to
compile and externally validate all six supported targets under the Node
orchestrator.

## Support evidence boundary

The required Linux x64 support lane compiles every Bun 6/6 and Deno 6/6 cell.
`/usr/bin/file` checks each native format and architecture; `/usr/bin/readelf`
also checks ELF architecture and distinguishes GNU from musl through the
interpreter. Current Linux x64 GNU Artifacts are separately executed. Foreign
Artifacts are not executed on the Linux runner.

These pinned, regularly revalidated fixtures define the advertised support
boundary. The library does not reject a different installed compiler version
at runtime, so an accepted target is not a promise that every historical or
future compiler version supports it.

Project configuration and environment are left to the compiler CLI. If a
future control is needed, it must become a typed option rather than a raw
argument list.

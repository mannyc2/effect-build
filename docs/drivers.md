# Compiler modules

Importing a compiler subpath selects CLI semantics. It does not select the
runtime that hosts the Effect program.

## Discovery and override

Both `Bun.layer()` and `Deno.layer()` use `PATH` when no option is supplied,
then probe the resolved executable for its absolute path and version. An
explicit Layer option bypasses `PATH`:

```ts
Bun.layer({ executable: "/opt/bun/bin/bun" });
Deno.layer({ executable: "/opt/deno/bin/deno" });
```

The explicit path must be absolute. A missing tool raises `ToolNotFound`; a bad
probe raises `ToolProbeFailed`.

## Bun

| Option      | Type                   | CLI meaning           |
| ----------- | ---------------------- | --------------------- |
| `minify`    | `boolean`              | `--minify`            |
| `sourcemap` | `"linked" \| "inline"` | `--sourcemap=<value>` |
| `bytecode`  | `boolean`              | `--bytecode`          |

Bun maps the following canonical targets. The v0.1.0 supported cell is the
Linux x64 GNU target under the Node orchestrator; all other target mappings
remain experimental:
`macos-x64`, `macos-aarch64`, `linux-x64-gnu`, `linux-x64-musl`,
`linux-aarch64-gnu`, `linux-aarch64-musl`, `windows-x64`, and
`windows-aarch64`.

## Deno

| Option             | Type                                | CLI meaning                                          |
| ------------------ | ----------------------------------- | ---------------------------------------------------- |
| `bundle`           | `boolean`                           | `--bundle`                                           |
| `minify`           | `boolean`, only with `bundle: true` | `--minify`                                           |
| `permissions.all`  | `true`                              | `--allow-all`                                        |
| scoped permissions | `true \| readonly string[]`         | `--allow-read`, `--allow-net=...`, and related flags |

Scoped permission names are `read`, `write`, `net`, `env`, `run`, `ffi`, `sys`,
and `import`. Deno maps macOS x64/aarch64, Linux GNU x64/aarch64, and Windows
x64/aarch64. The v0.1.0 supported cell is the Linux x64 GNU target under the
Node orchestrator; all other target mappings remain experimental. Musl
requests fail with `TargetUnsupported` before spawn.

Project configuration and environment are left to the compiler CLI. If a
future control is needed, it must become a typed option rather than a raw
argument list.

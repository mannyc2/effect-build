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

Bun 1.3.9 is required in CI to compile and externally validate all of these
canonical targets under the Node orchestrator:
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
and `import`. Deno 2.9.3 is required in CI to compile and externally validate
`macos-x64`, `macos-aarch64`, `linux-x64-gnu`, `linux-aarch64-gnu`,
`windows-x64`, and `windows-aarch64` under the Node orchestrator. Musl requests
fail with `TargetUnsupported` before spawn.

For both compilers, the required target lane checks native format and
architecture and distinguishes GNU from musl through the ELF interpreter.
Current Linux x64 GNU artifacts are additionally executed; foreign artifacts
are not executed on the Linux runner. Support tracks these pinned, regularly
revalidated compiler fixtures, but the library does not reject other compiler
versions at runtime.

Project configuration and environment are left to the compiler CLI. If a
future control is needed, it must become a typed option rather than a raw
argument list.

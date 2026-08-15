# Integrations

## Bun command compiler

`Bun.layer()` discovers one Bun command on `PATH`, or accepts an absolute
`executable` override. The Layer probes once and the same selected command
serves scalar and matrix calls.

```ts
Bun.layer({ executable: "/opt/bun/bin/bun" });
```

The typed options are `minify`, `sourcemap: "linked" | "inline"`, and
`bytecode`. `Bun.Target` is exactly `macos-x64`, `macos-aarch64`,
`linux-x64-gnu`, `linux-x64-musl`, `linux-aarch64-gnu`, and `windows-x64`.
Pinned support evidence uses Bun 1.3.9.

## Deno command compiler

`Deno.layer()` has the same discovery/absolute-override rule. Options cover
`bundle`, `minify` when bundling, and typed permissions. `Deno.Target` is
exactly `macos-x64`, `macos-aarch64`, `linux-x64-gnu`, `linux-aarch64-gnu`,
`windows-x64`, and `windows-aarch64`. Pinned support evidence uses Deno 2.9.3.

Bun and Deno each retain `compileExecutable` and
`compileExecutableMatrix`. Their target authority lives in their package, not
in core. Project configuration and environment retain the compiler CLI's
normal behavior.

## Esbuild bundle producer

`Esbuild.layer` captures the platform FileSystem, Path, and Crypto services and
checks exact raw Esbuild 0.28.2. `Esbuild.withJavaScriptBundle(input, use)`
creates one ESM or CJS Node-resolving bundle and keeps it live only for `use`.
It exposes no raw BuildOptions, plugin, watch, rebuild, or durable outfile.

The fixed producer policy is one regular supported entrypoint, one JavaScript
output, `bundle: true`, no splitting, packages bundled, and `node26.7`
lowering. Structured unresolved runtime imports and unsupported output imports
are rejected.

## Node SEA consumer

`NodeSea.layer({ executable? })` selects and probes one exact Node 26.7.0 Linux
x64 GNU producer. `NodeSea.createExecutable` accepts a live core JavaScript
bundle, a destination, optional digest, and optional `{ key, path }` assets.
It has no bundler options, target switch, matrix, raw argv, or download path.

```ts
const executable = Esbuild.withJavaScriptBundle(
  { entrypoint: "src/main.ts", format: "esm" },
  (main) => NodeSea.createExecutable({ main, outfile: "dist/app" }),
);
```

The consumer authenticates and privately copies the main before both Node
reads. It runs `--check` before candidate acquisition, then direct SEA
assembly. It never uses postject and never downloads or installs Node.

## Evidence boundary

The required Linux lane validates all six Bun and six Deno target cells with
pinned tools and external native-format inspection. A separate exact Node
26.7.0 lane runs public Esbuild-to-Node-SEA ESM and CJS executables while Node
24.14.1 remains the orchestrator. Foreign native outputs are inspected but not
executed on the Linux runner.

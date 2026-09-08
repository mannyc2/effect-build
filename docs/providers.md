# Providers

CLI providers expose verbs and `layer({ executable?, version? })`. The layer chooses
an explicit executable or the first PATH match, resolves symlinks, hashes it, and
probes its version once. Later launches use that path without checking it again.
Provide platform services, such as `NodeServices.layer`, to resolve and run tools.

| Tool | Default range or dependency | CI fixture / reason |
| --- | --- | --- |
| Bun | `>=1.3.14 <1.4.0 \|\| >=1.4.2 <1.5.0` | 1.3.14 and 1.4.2; 1.4.0 unreviewed, 1.4.1 variable-collision regression |
| Deno | `=2.9.5` | 2.9.6 removed `transpile --conditions` and `compile --allow-scripts` |
| esbuild | npm dependency `0.28.2` | In-process API; no tool layer |
| Rolldown | npm dependency `1.2.5` | In-process API; no tool layer |
| Node SEA | `>=22.0.0 <27.0.0` | 22.0.0 and 26.7.0; matching builder/base versions |
| Git archives | `>=2.40.0 <3.0.0` | 2.40.0 and 2.55.0; ZIP/tar entries need no tool |
| uv | `>=0.12.0 <1.0.0` | 0.12.0; direct wheel writer needs no tool |
| nFPM | `>=2.47.0 <3.0.0` | 2.47.0 |
| Syft | `>=1.50.0 <2.0.0` | 1.50.0 |
| Windows SignTool | `>=10.0.26100 <11.0.0` | Experimental; native executable CI uses a temporary certificate, MSIX uses scripted tests |
| Apple xcrun | `>=70.0.0 <71.0.0` | Local unsigned app checked; credentialed operations experimental |

Override a default with `Bun.layer({ executable: "/opt/bun/bin/bun", version: "=1.4.2" })`.
`version` also accepts a predicate. String ranges support canonical `x.y.z` comparisons
and `||`; prerelease versions do not match. SignTool ranges use the first three SDK
components; predicates receive its complete four-component version.

Bun and Deno accept core targets and native target names. Windows outputs require
lowercase `.exe`; Deno has no musl target and preserves the final output basename.
`Deno.layer({ runtime })` hashes an explicit denort without execute-probing it.
Node SEA defaults to the host Node executable and packages bundled CommonJS.
`effect-build-bun/api` requires Bun; `effect-build-deno/api` requires Deno.

Use [package READMEs](../README.md) for operation details and [contributing](../CONTRIBUTING.md)
for real-tool commands. A compiler's availability and the host running Effect are
separate choices; cross-target binaries still require a matching host to execute.

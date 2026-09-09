# Providers

CLI providers expose verbs and `layer({ executable?, version? })`. The layer chooses
an explicit executable or the first runnable PATH match, resolves symlinks, hashes
it, and probes its version once. Later launches use that path without checking it
again. An `undefined` executable means PATH, so `layer({ executable: process.env.MY_TOOL })`
needs no branch. Provide platform services, such as `NodeServices.layer`, to resolve and run tools.
Each tool provider exports `supported`, the npm semver range its layer accepts by
default, and `tested`, the exact versions real-tool CI runs.

| Tool             | Accepted range or dependency | Tested evidence / capability restrictions                                                                                                                                   |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun              | `>=1.3.14 <2.0.0`            | CI: 1.3.14 and 1.4.2. Emitted builds reject 1.4.1's reproduced variable-collision defect; native API operations are independent.                                            |
| Deno             | `>=2.9.5 <3.0.0`             | CI: 2.9.5. On 2.9.6+, `transpile` rejects `conditions` and compile/watch reject `allowScripts`, because the native flags were removed. Other capabilities remain available. |
| esbuild          | npm dependency `0.28.2`      | In-process API; no tool layer.                                                                                                                                              |
| Rolldown         | npm dependency `1.2.5`       | In-process API; no tool layer.                                                                                                                                              |
| Node SEA         | `>=22.0.0 <27.0.0`           | CI: 22.0.0 and 26.7.0; builder/base versions must match.                                                                                                                    |
| Git archives     | `>=2.40.0 <3.0.0`            | CI: 2.40.0 and 2.55.0; ZIP/tar entries need no tool.                                                                                                                        |
| uv               | `>=0.12.0 <1.0.0`            | CI: 0.12.0; direct wheel writer needs no tool.                                                                                                                              |
| nFPM             | `>=2.47.0 <3.0.0`            | CI: 2.47.0; accepts native configuration, including lifecycle scripts.                                                                                                      |
| Syft             | `>=1.50.0 <2.0.0`            | CI: 1.50.0; scanning a binary does not establish complete source dependencies.                                                                                              |
| Windows SignTool | `>=10.0.26100 <11.0.0`       | Experimental; native executable CI uses a temporary certificate, MSIX uses scripted tests.                                                                                  |
| Apple xcrun      | `>=70.0.0 <71.0.0`           | Native unsigned app checked locally; credentialed operations experimental.                                                                                                  |

Tested versions record concrete CI fixtures; an accepted range does not mean every
version has been exercised. Override a range with
`Bun.layer({ executable: "/opt/bun/bin/bun", version: "^1.4.2" })` or a predicate.
String ranges use npm semver, including caret, tilde, comparisons and `||`.
Invalid ranges fail through `Tool.VersionUnsupported`, without synchronous throws.
Prereleases require an explicitly matching prerelease range. SignTool string ranges
use the first three SDK components; predicates receive the complete four-part version.

Bun and Deno accept core targets and native target names. Windows outputs require
lowercase `.exe`; Deno has no musl target and preserves the final output basename.
Bun's omitted compile target leaves native host selection to Bun, then inspects the
binary. `Target.host()` reports Linux ABI only with positive host evidence and can
return `undefined`. `Deno.layer({ runtime })` hashes an explicit denort without
execute-probing it. Node SEA defaults to the host Node executable and packages
bundled CommonJS.

`effect-build-bun/api` requires Bun to execute, and `effect-build-deno/api` requires
Deno. Bun's public declarations retain native `bun-types@1.3.14` contracts with a
small scoped declaration repair for that package's missing Node type names.
Bun/Deno watch inherit stdout/stderr by default; select `stdio: "pipe"` to consume
the child streams yourself. `Tool.run` and Bun/Deno operations expose `onOutput`
for live stdout/stderr feedback; command failures retain both captured streams.

Use [package READMEs](../README.md) for operations, [compatibility](compatibility.md)
for the host/target evidence matrix, and [contributing](../CONTRIBUTING.md) for real-tool
commands. Compiler availability and the host running Effect are separate choices;
cross-target binaries still require a matching host to execute.

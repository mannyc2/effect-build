# Compatibility

This checkout contains the unreleased 0.9.0 API. All nine packages release together and are
ESM-only. The source checkout pins Effect and platform packages to **4.0.0**; package peer
ranges accept `>=4.0.0 <4.1.0`. Keep the chosen Effect and platform packages at one version.

Node 22.19 or newer can run the library with `NodeServices.layer`. The source examples and
native kernel tests use Node 24.14.1. Bun 1.3.14 runs repository tooling. Bun and Deno
applications supply their corresponding Effect platform services; library source imports
no `node:*` modules and does not start an Effect runtime.

## Runtime and native tool

The runtime running Effect and the tool launched by a binding are separate choices.
A Node application can launch Bun, Deno, uv, or another installed tool on a host that tool
supports. Cross-compilation does not establish that the result was run on its target.

| Binding  | Native requirement                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------- |
| Bun      | Bun CLI; compile targets use native `bun-...` names                                                 |
| Deno     | Deno CLI with native compile/bundle commands; six supported target triples                          |
| Node SEA | Node with native `--build-sea`; caller supplies already-bundled source and optional base executable |
| Python   | uv and the project's native Python build requirements                                               |
| nFPM     | nFPM and its native package configuration                                                           |
| Syft     | Syft and source context appropriate to the requested inventory                                      |
| Apple    | codesign, Xcode's notarytool/stapler through xcrun, and caller-selected signing credentials         |
| Windows  | Windows SDK SignTool and caller-selected certificate or signing library                             |

Bun's construction probe warns outside 1.3.x/1.4.x. Node SEA's probe warns outside 26.7.x.
These ranges describe probe policy; they do not gate construction or guarantee all native
capabilities. Other bindings currently rely directly on native command failures.
No binding installs, substitutes, or retries a selected tool.

Signing mutates existing files in place. Production signing and notarization require the
caller's credentials and native host tools. Unit tests and non-credentialed integration runs
do not establish production credential compatibility.

The manual [signing workflow](../.github/workflows/signing.yml) runs the typed
[signing applications](../examples/signing) with existing Developer ID/API-key or Trusted Signing
credentials. It composes native signature verification and, on Apple, accepted-status policy
and stapled-ticket validation. Normal verification typechecks these applications only.

## Process backend boundaries

`Tool` uses Effect's native `ChildProcessSpawner` and handle model. Backend signal
observation, pipes, Windows system environment supplementation, and cleanup follow that
platform. The kernel sanitizes process errors and bounds diagnostics; it preserves native
session handle types and does not introduce a parallel process runtime.

With the Node backend, a pipeline exposes the last child's exit code, stdout, stderr, and
extra descriptors, plus the first child's stdin. Only the last child's status is checked.
Earlier stderr must be inherited, ignored, or explicitly wired; the returned handle cannot
drain it. An accepted final exit code does not establish that every stage succeeded.

Scope close follows the backend's termination policy and does not recover unread output.
Node's process finalizer and pipeline kill operation suppress native kill failures; `Tool`
cannot surface failures already discarded by the backend. Configure the command's
`killSignal` and `forceKillAfter` for the process's shutdown needs.

Native multi-input applications must observe process exit alongside persistent writes.
The ffmpeg example documents that pattern. Additional-descriptor reset handling and stale
writes to an exited child depend on the backend's behavior; downstream applications carrying
a platform fix must keep that fix until their chosen platform version contains it.

File publication uses same-parent staging and native rename semantics. Directory output is
a sequence of per-file renames, so partial commit is possible. Portable layout validation
is an explicit application operation; an executable magic check establishes neither target
architecture nor complete executable validity.

## Verification and release

`bun run verify` builds packages, checks the public API and examples, generates documentation,
runs unit and release tests, and checks formatting and lint. Real-tool integration runs against
installed native tools separately. The Linux, macOS, Windows, and real-tool CI matrix must be
green before a new version is released.

The guides describe the 0.9.0 source API, and the [changelog](../CHANGELOG.md) records the
breaking cutover. The older published API remains a different version.

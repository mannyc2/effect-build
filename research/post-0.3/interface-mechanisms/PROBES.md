# Interface-mechanism probe record

All probes are disposable, local, and fail closed. They create only temporary files and the checked-in JSON receipts. They do not edit packages, manifests, plans, freeze artifacts, releases, registries, or remote state.

## Reproduction

Acquire or select exact binaries/packages independently, verify their published hashes, then set explicit paths:

```sh
BUN_EXE=/absolute/path/to/bun-1.3.9 \
BUN_EXPECTED_VERSION=1.3.9 \
BUN_EXPECTED_SHA256=<sha256-of-selected-bun> \
NODE_267_EXE=/absolute/path/to/node-v26.7.0/bin/node \
NODE_267_EXPECTED_SHA256=<sha256-of-selected-node> \
POSTJECT_ROOT=/absolute/path/to/postject-1.0.0-alpha.6 \
POSTJECT_EXPECTED_API_SHA256=<sha256-of-postject-dist-api.js> \
node research/post-0.3/interface-mechanisms/run-probes.mjs
```

The recorded run used:

```sh
BUN_EXE=/Users/cjpher/.bun/bin/bun \
BUN_EXPECTED_VERSION=1.3.9 \
BUN_EXPECTED_SHA256=cec3f87f0e17c12a294c75216bc7a08088e13b0be46623f65d5802ac56276bb1 \
NODE_267_EXE=/private/tmp/node-sea-mechanism-probe.PECHvs/node-v26.7.0-darwin-arm64/bin/node \
NODE_267_EXPECTED_SHA256=a9bd0630891c2dcdee70de88270fee2cc0c4a9e76495039dd3b4f91c5e6b71df \
POSTJECT_ROOT=/private/tmp/node-sea-mechanism-probe.PECHvs/postject-alpha6 \
POSTJECT_EXPECTED_API_SHA256=88931f26b4d3e99e08dc8219a45f576986952fad4d0c78444d27048232b2881b \
node research/post-0.3/interface-mechanisms/run-probes.mjs
```

`run-probes.mjs` refuses implicit Bun, Node, or postject identities and requires content digests, not version strings alone. Acquisition pins independently recorded in [GROUND-TRUTH.json](./GROUND-TRUTH.json) include Node's official Darwin arm64 archive SHA-256 `595d2f934e081b82961d1a5fd41c6dbd0c5a952d9e8be5b4566ab754426968d2`; postject's npm shasum `9d022332272e2cfce8dea4cfce1ee6dd1b2ee135`, tarball SHA-256 `d1447b53e87d49ddaf7fb3350c870afafa72760eca47f6d5cce4cefd537e7d92`, and API-entry digest shown above; and the selected executable digests shown above. The browser probe explicitly runs `npm pack esbuild-wasm@0.28.2 --json` in a temporary directory and requires integrity `sha512-GccVwhv3mmOUVQHCQm2Ox/rby8n/EqUwvZxE6Pjfikrq/lWw9g9WX/u9EykWnpot3Ko6j426DgQdea2xWKIAQA==`, npm shasum `b1f69ae107aa8471b57756af4f8bc131407f4481`, and tarball SHA-256 `61594de12ce998652be2aa0ab72dda54bfa49407fb37ee3464468a2aac306baa`. It deletes the acquisition root. This is a research acquisition, not production automatic installation or fallback.

The runner writes:

- [bun-sidecar.json](./receipts/bun-sidecar.json)
- [esbuild-js-service.json](./receipts/esbuild-js-service.json)
- [esbuild-wasm-browser.json](./receipts/esbuild-wasm-browser.json)
- [node-postject.json](./receipts/node-postject.json)
- [summary.json](./receipts/summary.json)

All five files are one cohort. The runner records a shared UUID and cohort digest, hashes the runner and every probe/support source before and after execution, records per-probe watchdogs and the names/digest of the exact environment selection, and hashes each serialized receipt in the summary. It executes all four probes before reporting an aggregate failure, but publishes nothing unless all pass and the source set is unchanged. Successful publication stages the complete directory, swaps it into place, and rolls back the prior cohort if the swap fails. The validator recomputes source, cohort, and receipt hashes, so a failed partial rerun cannot validate against mixed fresh/stale files.

## 1. Bun provider-host sidecar

Sources:

- [bun-sidecar-server.ts](./probes/bun-sidecar-server.ts)
- [bun-sidecar-probe.mjs](./probes/bun-sidecar-probe.mjs)
- [bun-direct-plugin.ts](./probes/bun-direct-plugin.ts)

Mechanism:

```text
Node test orchestrator
  -> explicit Bun 1.3.9 child
  -> 4-byte big-endian length + JSON request/response frames
  -> Bun.Transpiler public API inside Bun
```

This is intentionally not a CLI wrapper: the server never renders `bun build` argv. It constructs a reusable `Bun.Transpiler`, calls transform/scan APIs, and owns a small protocol with explicit operation and handle IDs.

Assertions:

- exact Bun version, executable content, protocol, and capability handshake succeed;
- a fresh session rejects work before negotiation; intentional client version skew returns `VERSION_MISMATCH`, and work remains gated afterward;
- a configured transpiler handle survives multiple requests;
- invalid TypeScript is a structured provider failure and the same process subsequently succeeds;
- a 1 MiB source/result round trip succeeds within the 8 MiB frame bound;
- sixteen pipelined scan requests all correlate successfully, independently of transport backpressure;
- the large framed write makes Node's transport report backpressure and the client waits for `drain`;
- a JavaScript plugin closure serializes as `{}` and the sidecar rejects it as `CALLBACK_TRANSPORT_UNSUPPORTED`;
- the same plugin's resolve/load callbacks execute through direct `Bun.build` in the Bun host;
- close invalidates the handle and a stale request is rejected;
- graceful shutdown and forced interruption leave no child PID;
- cold/warm time and RSS are observations, not performance commitments.

The probe does not assert provider cancellation. Killing the sidecar stops the owned process; it does not prove Bun canceled an individual native task before process termination.

Limitations: macOS arm64 only; Transpiler/scan plus direct plugin comparison; no direct multi-output writes, Bun executable mutation, cross-target runtime acquisition, worker crash inside native code, or multi-host distribution certification.

## 2. Esbuild JavaScript service topology

Source: [esbuild-js-service-probe.mjs](./probes/esbuild-js-service-probe.mjs)

Mechanism under test:

```text
Node JS esbuild@0.28.2 public API
  -> package-module-global native child --service=0.28.2 --ping
  <-> private bidirectional protocol and plugin callbacks
```

Assertions:

- importing the package and creating no operation starts no service;
- the first transform starts exactly one native service child;
- a virtual plugin callback runs in the host and round-trips through the service;
- invalid input returns structured errors and the service remains usable;
- two contexts share the same service PID;
- disposing both contexts does not stop the shared service;
- a context cancel request remains pending while an asynchronous host callback is blocked, then rebuild fails as canceled after release;
- `esbuild.stop()` terminates the child shared by that resolved module instance;
- a later operation starts a new service PID.
- `ESBUILD_BINARY_PATH` is excluded by the runner; the installed esbuild package manifest, resolved JavaScript service entrypoint, and default native binary actually named by the service process have the exact recorded SHA-256 values.

The expected cancellation message is emitted by esbuild on stderr; the receipt preserves the structured outcome. The test deliberately does not install a global finalizer in effect-build because that would kill unrelated consumers' shared service.

Limitations: local Node 24/macOS arm64; no forced service crash in the checked-in probe, watch/serve sockets, large output graph, or Windows/Linux process supervision. Exact-source research separately established that a first operation after a killed service rejects until upstream global state is reset.

## 3. Esbuild browser WebAssembly worker

Source: [esbuild-wasm-browser-probe.mjs](./probes/esbuild-wasm-browser-probe.mjs)

Mechanism:

```text
Chrome 151 browser JS
  -> esbuild-wasm@0.28.2 browser API
  -> Web Worker (worker:true)
  -> Go WebAssembly service
```

The probe serves exact package JS/Wasm from a loopback temporary HTTP server, launches a fresh headless Chrome profile, and receives a same-origin result POST. It does not use a Node emulation of browser code.

Assertions:

- exact npm package version/integrity and exact Chrome host version/executable digest are recorded;
- worker initialization and transform succeed;
- virtual plugin resolve/load callbacks cross the worker boundary;
- structured parse failure returns and the worker recovers;
- implementation context rebuild succeeds in this browser build;
- `watch`, `serve`, and filesystem `write:true` fail closed;
- sixteen concurrent transforms complete;
- the dedicated Chrome process group terminates with no descendant remnant.

Important support limit: upstream's public declaration marks browser context unsupported. The observed context/rebuild implementation behavior is therefore not promoted as a compatibility promise. The decision ledger admits only publicly supported browser build/transform/format/analyze behavior and records context as implementation breadth.

Limitations: Chrome 151/macOS arm64, loopback inputs, no CSS/asset graph, worker crash/restart, large Wasm memory profiling, COOP/COEP isolation, or other browsers. Timings are environment observations only.

## 4. Node direct SEA and programmatic postject

Source: [node-postject-probe.mjs](./probes/node-postject-probe.mjs)

Mechanisms:

```text
official direct:
  exact Node 26.7.0 --build-sea config -> LIEF -> private executable

legacy programmatic:
  exact Node 26.7.0 --experimental-sea-config -> preparation blob
  independently recorded ambient Node host -> postject@1.0.0-alpha.6 inject()
    -> bundled LIEF/Wasm -> private Node 26.7.0 base mutation
```

On Darwin, both artifacts are ad-hoc signed after native mutation and then executed. The main reads a bundled asset through `node:sea`.

Assertions:

- the ambient Node host version/executable digest are recorded separately from the exact selected Node 26.7.0 SEA builder/base version and digest;
- postject version and the exact `dist/api.js` entrypoint digest; that entrypoint embeds the LIEF/Wasm engine used by the probe, while this assertion does not claim a whole-root package manifest;
- direct CJS/assets SEA runs and prints the asset;
- programmatically injected legacy SEA runs and prints the same asset;
- a second injection without overwrite rejects with an existing-resource error;
- direct build to a pre-existing directory fails nonzero;
- the pre-existing directory remains a directory.

This establishes postject as a real programmatic legacy-injection mechanism. It does not establish cancellation, atomicity, parity with Node 26.7's newer LIEF, or superiority over direct `--build-sea`.

Limitations: Darwin arm64; CJS/assets; no ESM/code-cache/snapshot/execArgv/native addon, Linux/Windows, cross-target, mid-write interruption, concurrent injection, peak RSS, or strong production signing. Separate scratch evidence exercised direct ESM/code cache and signature checks but is not used to widen the checked-in assertion set.

## 5. Additional bounded evidence not rerun by the orchestrator

### Deno

No exact local Deno 2.9.3 executable was available; the ambient Deno was 2.9.5. The study therefore did not mislabel a 2.9.5 run as provider-pin evidence. Exact 2.9.3 source traces establish `Deno.bundle`'s per-call thread/Tokio/esbuild-child topology and selected-command compile/acquisition behavior. A future sidecar receipt must use the content-pinned 2.9.3 tool on the certified Linux host.

### Esbuild Go

`go` was absent. The brief permits browser WebAssembly instead of installing a large toolchain, so no Go bridge receipt was fabricated. Official exact-source calls establish that the Go API invokes compiler implementation directly. A future Go sidecar must prove schemas, callbacks, context crash/stale handles, platform packaging, and a concrete state-space reduction.

### Rolldown

Exact 1.2.4 upstream source and the archived narrow R2 generate/close receipt establish the JavaScript-to-N-API entry, the absence of a compiler child, and the limited handle-close observation. External-memory, multi-host, CLI, WASI, and override-path behavior was explored only in disposable scratch runs whose complete sources and receipts were not retained; those observations are therefore not presented here as reproducible executable evidence. The durable source/archived evidence remains subordinate to the current freeze deferral and is summarized in [REPORT.md](./REPORT.md) and [MECHANISM-COVERAGE.csv](./MECHANISM-COVERAGE.csv). It does not satisfy package, lifecycle, five-host, packed-consumer, or publication gates.

## Failure classification

Every checked-in probe throws and exits nonzero when an expected conclusion changes. Missing executables, wrong versions, content skew, npm acquisition failure, missing Chrome, timeout, and assertion falsification are distinct failures. Watchdogs are 45-120 seconds according to probe cost and terminate the probe process group before the runner reports timeout. The producer is single-writer locked, caps captured output, verifies the exact expected assertion set, and publishes only a complete cohort after every probe and source recheck succeeds. An ordinary publication error rolls back to the previous cohort; a process or machine crash during the two directory renames can instead leave the receipts directory absent alongside the run-specific previous directory, which makes validation fail closed and requires explicit recovery. The scripts do not reinterpret missing infrastructure as semantic evidence.

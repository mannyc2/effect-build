# Contributing to effect-build

Use the current exported API and [combined contract](tooling/effect-build-contract.json) as the baseline for a change. [AGENTS.md](AGENTS.md) contains the engineering rules; [the architecture guide](docs/architecture.md) explains why the tool and artifact boundaries exist.

## Set up the workspace

Install **Bun 1.3.14** and **Node.js 24.14.1**, matching the default CI toolchain. Check your active versions before installing:

```sh
bun --version
node --version
bun install --frozen-lockfile
bun run build
```

Bun manages workspace links and the committed `bun.lock`. The root's `packageManager` is `bun@1.3.14`; Corepack's `pnpm` launcher rejects that declaration. Use the pinned Bun commands here rather than changing the manifest to make another package manager run.

The build emits each package's `dist` files. Run it before executing examples, since their package imports resolve to those built exports. See [example commands](examples/README.md).

## Verify a change

For source, executable examples, dependencies, generators, CI, or release-tooling changes, run the complete local gate on the final changes:

```sh
bun run verify
```

This gate builds once, then runs `verify:static` and `verify:platform`. Static checks cover the combined contract and public projection, source and example typechecks, type tests, release behavior, lint, and formatting. Platform checks cover unit tests, example behavior, a packed consumer, and architecture tests. Both component scripts require the current build. CI runs the static gate once and platform behavior on Linux, macOS, and Windows. Separate integration jobs exercise real compilers and producer tools; the local gate does not require all those tools.

Use focused checks while editing when their result can resolve a specific uncertainty or failure. Exercise consequential external assumptions with the pinned real tool or actual packed bytes early. Once the complete gate passes, reuse its results; rerun checks only when relevant changes, failures, or unresolved concerns invalidate that evidence.

For prose-only changes, check formatting and verify affected links, API names, and commands against the current source. Execute an affected example when changing a claim about its behavior. A full source gate is unnecessary when no executable, dependency, generated, or workflow input changed.

Format only the files you edited with `bun x --no-install dprint fmt <paths>`, especially in a checkout containing someone else's work. Update an example's workspace dependency declaration and `bun.lock` together when adding an import from another package.

## Run real tools

| Command                             | Requires                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `bun run test:integration:bun`      | Exact Bun fixture and executable binding from the contract.             |
| `bun run test:integration:deno`     | Exact Deno fixture; 2.9.5 exercises operations, 2.9.6 verifies refusal. |
| `bun run test:integration:esbuild`  | Exact esbuild native executable fixture.                                |
| `bun run test:integration:node-sea` | Node 26.7.0 on Linux x64 GNU.                                           |
| `bun run verify:real`               | The Bun, Deno, and esbuild integration prerequisites above.             |

The [generated compatibility table](docs/compiler-compatibility.md) lists the exact fixture IDs. CI runs `node scripts/install-provider-fixture.mjs <fixture-id>` to install and bind the native tool separately from the pinned Bun orchestration runtime. For an existing local compiler, pass `EFFECT_BUILD_TOOL_FIXTURE` and its absolute `EFFECT_BUILD_BUN`, `EFFECT_BUILD_DENO`, or `EFFECT_BUILD_ESBUILD` path. For example:

```sh
EFFECT_BUILD_TOOL_FIXTURE=EVIDENCE-BUN-1.4.2 EFFECT_BUILD_BUN=/opt/bun-1.4.2/bin/bun bun run test:integration:bun
```

The selected binary must exactly match the fixture version. Set `EFFECT_BUILD_EXACT_EVIDENCE_DIRECTORY` to retain per-scenario identity and execution observations. A rejected fixture proves refusal, not build compatibility. Inspect [CI](.github/workflows/ci.yml) and the relevant integration test for platform-specific setup. Producer acceptance commands are listed in [package.json](package.json); they require their native tools and, for some signing operations, an appropriate host and credentials. A skipped real-tool test is not evidence that its external operation works.

The Deno host job adds `--denort` to the fixture installer to download and checksum the canonical matching and mismatched native runtime archives. For local pair tests, set `EFFECT_BUILD_DENORT_MATCHED` and `EFFECT_BUILD_DENORT_MISMATCHED` to those absolute executable paths. Runtime identity is established by executing the temporary program embedded by the selected compiler; the runtime must execute on the test host.

## Keep examples useful

Include every input file an example reads, an exact command and working directory, and the expected result. Use supported public `Api` and `Command` imports. Keep scoped contexts and watchers inside `Effect.scoped`, and use a runtime entry point that handles signals for long-running scripts.

Document unused destination paths for finalizers and any compiler/version/host requirements beside the command. Execute a new quick start from a fresh directory as well as typechecking it: missing files, current-directory assumptions, and repeat-run behavior can all pass TypeScript checks.

Give each complete scenario a local README with a learning goal, prerequisites, run commands, expected output, a small
change to try, a meaningful failure case, and a check command. Keep build/application entry points separate so the
example can run from source and tests can supply temporary destinations. Prefer a focused recipe over another framework
or a shared example runner that readers must understand first.

Behavior checks should consume the result: execute generated code, extract an archive with an independent reader, or
compare source and compiled CLI behavior. Check native diagnostics and resource cleanup where those are the lesson.
Use explicit rebuilds for deterministic context tests; keep watch interaction available as a manual recipe. Do not
write tests that merely repeat the options passed to a mocked compiler.

Add new workspaces to `package.json`, declare their imports directly, and keep their source/tests under the example
typecheck. Wire tests requiring only installed dependencies into `test:examples`. Put real compiler checks in the
matching tool-backed CI job with exact tool selection; explicitly requested checks should fail when prerequisites are
missing rather than report a skipped success. Refresh the lockfile after dependency changes. Regenerate the contract when
its library inputs change. The [example index](examples/README.md#how-these-examples-are-organized) records the repositories behind this structure.

## API and release changes

Update the combined contract and its evidence before changing public dispositions, then regenerate and verify the projection with the repository scripts. Documentation changes must describe the implemented surface; historical plans and private research candidates do not add exports.

The combined contract records library capabilities, public exports, and supported tool versions. Run `bun run generate:contract` after changing its source inputs; version bumps and lockfile changes do not invalidate it. `check:contract` checks the contract, private compatibility modules, generated support documentation, and library relationships. Edit compatibility windows and exact fixture inputs in `scripts/effect-build-contract/policy.mjs`; regenerate instead of editing projections. Release orchestration lives in `.github/workflows/release.yml` and `scripts/release/`. `bun run test:release` exercises npm authentication, publication recovery, and provenance policy.

A release tag authorizes the [release workflow](docs/release-security.md): require successful CI for that source commit, pack once, test those packages in Node and Bun on three hosts, publish those bytes, and verify the registry bytes and signed provenance before publishing an immutable GitHub Release. Main advancing does not invalidate a tested commit. Re-run failed jobs to preserve the candidate artifact; matching packages are skipped, conflicting bytes stop, and a `latest` mismatch needs an explicit decision. Historical plans preserve earlier decisions and receipts, not standing release instructions or approval checkpoints.

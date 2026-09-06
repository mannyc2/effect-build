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

This gate builds once, then runs `verify:static` and `verify:platform`. Static checks cover the combined contract and public projection, source and example typechecks, type tests, lint, and formatting. Platform checks cover unit tests, example behavior, a packed consumer, and architecture tests. Both component scripts require the current build. CI runs the static gate once and platform behavior on Linux, macOS, and Windows; it retains the required platform Verify checks. These gates do not run all real external compilers or certify a release.

Use focused checks while editing when their result can resolve a specific uncertainty or failure. Exercise consequential external assumptions with the pinned real tool or actual packed bytes early. Once the complete gate passes, reuse its results; rerun checks only when relevant changes, failures, or unresolved concerns invalidate that evidence.

For prose-only changes, check formatting and verify affected links, API names, and commands against the current source. Execute an affected example when changing a claim about its behavior. A full source gate is unnecessary when no executable, dependency, generated, or workflow input changed.

Format only the files you edited with `bun x --no-install dprint fmt <paths>`, especially in a checkout containing someone else's work. Update an example's workspace dependency declaration and `bun.lock` together when adding an import from another package.

## Run real tools

| Command                             | Requires                                                    |
| ----------------------------------- | ----------------------------------------------------------- |
| `bun run test:integration:bun`      | Bun 1.3.14; the launcher selects the real Bun lane.         |
| `bun run test:integration:deno`     | Deno 2.9.5; test configuration controls the real-tool lane. |
| `bun run test:integration:node-sea` | Node 26.7.0 on Linux x64 GNU.                               |
| `bun run verify:real`               | The Bun and Deno integration prerequisites above.           |

Inspect [CI](.github/workflows/ci.yml) and the relevant integration test for environment variables and platform-specific setup. Producer acceptance commands are listed in [package.json](package.json); they require their native tools and, for some signing operations, an appropriate host and credentials. A skipped real-tool test is not evidence that its external operation works.

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
missing rather than report a skipped success. Refresh the lockfile and generated contract input hashes after manifest
changes. The [example index](examples/README.md#how-these-examples-are-organized) records the repositories behind this structure.

## API and release changes

Update the combined contract and its evidence before changing public dispositions, then regenerate and verify the projection with the repository scripts. Documentation changes must describe the implemented surface; historical plans and private research candidates do not add exports.

Local verification, hosted CI, certification, merge, tags, npm publication, and release establish different facts. Report the applicable results and any missing evidence. Carry forward authorization for the requested sequence; green checks do not grant authority for additional mutations. See [the release boundary](docs/release-security.md) for current release guarantees and how consumers adopt finished artifacts. Historical plans preserve earlier decisions and receipts; their old commands and pending checklists do not replace the current contract or require repeated approval for work already authorized.

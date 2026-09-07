# Bundle budget CLI

Build a useful Effect application into a standalone executable. `bundle-report` reads asset measurements from JSON,
checks their shape, summarizes the byte counts, and optionally fails when an asset exceeds its budget. It consumes
measurements; it does not run a bundler to produce them.

This example connects four pieces:

- [Report.ts](src/Report.ts) reads through Effect's `FileSystem` and validates JSON through `Schema` before calculating.
- [Cli.ts](src/Cli.ts) uses Effect v4's `Argument`, `Flag`, and `Command` for typed input, help, and exit behavior.
- [main.ts](src/main.ts) supplies `NodeServices` and runs the application with `NodeRuntime.runMain`.
- [Compile.ts](src/Compile.ts) returns an effect-build compilation program; [build.ts](src/build.ts) selects Bun and runs it.

## Run the source

From the repository root, with Node 24.14.1 and Bun 1.3.14 installed:

```sh
bun install --frozen-lockfile
bun run build
bun run --cwd examples/cli report fixtures/bundles.json
```

Expected output:

```text
Asset       Bytes   Budget  Status
app.js      48000   50000   OK
vendor.js   110000  120000  OK
styles.css  8000    10000   OK

Total: 166000 bytes; over budget: 0
```

Explore the generated help and JSON output:

```sh
bun run --cwd examples/cli report --help
bun run --cwd examples/cli report fixtures/bundles.json --format json --check
```

The JSON report contains `totalBytes`, `exceeded`, and an `assets` array with each asset's `overBudgetBy`. `--format` accepts
`table` or `json`; `--check` is off by default. The source command needs no external compiler to read reports.

## Compile and run

```sh
bun run --cwd examples/cli compile
./examples/cli/dist/bundle-report.exe examples/cli/fixtures/bundles.json --format json --check
```

The compile program prints the finalized executable's path, inspected target, size, and SHA-256. It omits `target` to use
the selected Bun compiler's host target. The `.exe` filename works on macOS and Linux as well as Windows.

The executable includes the application's dependencies and Bun runtime. It reads a JSON file you supply at execution
time; the sample measurements are not embedded. Paths are relative to the current working directory, which is why the
command above passes `examples/cli/fixtures/bundles.json` when run from the repository root.

The compiler must be Bun 1.3.14. If multiple Bun installations appear on `PATH`, choose one explicitly in
`Command.layer({ executable })` in [build.ts](src/build.ts); see [tool selection](../../docs/providers.md#select-a-command).

Finalization requires an unused destination. Before compiling to the same path again:

```sh
bun run --cwd examples/cli clean
bun run --cwd examples/cli compile
```

`clean` removes this example's entire `dist/` directory. The exported `compile(outfile)` Effect also lets a caller choose
a fresh output location, as the compiled behavior check does.

## Try failure cases

Print an over-budget report successfully, then enforce the budgets:

```sh
bun run --cwd examples/cli report fixtures/over-budget.json --format json
bun run --cwd examples/cli report fixtures/over-budget.json --format json --check
```

Both commands print the same JSON: 191000 total bytes and two assets over budget. The second exits with status 1 and
reports `Bundle budget exceeded by 2 asset(s).` on stderr. The JSON on stdout remains usable by another program.

Try malformed measurements and an unsupported option:

```sh
bun run --cwd examples/cli report fixtures/invalid.json
bun run --cwd examples/cli report fixtures/bundles.json --format csv
```

The schema rejects the string `"large"` where a byte count belongs. The CLI parser rejects `csv` before running the report
handler. Neither case produces a report. Read errors and schema errors become `CliError.UserError` at the CLI boundary,
where the command runner renders them and preserves a failing exit status.

## Checks

Run the source behavior checks without invoking a compiler:

```sh
bun run --cwd examples/cli test
```

They cover the JSON values, table output, conditional budget failure, invalid measurements, malformed JSON, help, and
invalid flags. They launch the application through its actual Node entrypoint, so stdout, stderr, and process status are
part of the checks.

For the separate compile check, bind the exact Bun executable explicitly. On macOS or Linux:

```sh
EFFECT_BUILD_BUN="$(command -v bun)" bun run --cwd examples/cli test:compile
```

`EFFECT_BUILD_BUN` must be an absolute path to Bun 1.3.14. An absent binding or another version fails the check. The test
compiles to a temporary destination, verifies its digest, compares source and executable output and exit status, and
removes the generated file afterward. The executable runs with an empty `PATH` during this check.

This is local execution evidence for the machine running the check; it does not certify other targets.

## Source patterns

The structure follows the official Effect v4 [CLI example](https://github.com/Effect-TS/effect/blob/e7eebf4685c294b423da3f7618629c0e0efc34cc/ai-docs/src/70_cli/10_basics.ts)
and [bundle reporting CLI](https://github.com/Effect-TS/effect/blob/e7eebf4685c294b423da3f7618629c0e0efc34cc/packages/tools/bundle/src/Cli.ts).
The [OpenAPI generator](https://github.com/Effect-TS/effect/blob/e7eebf4685c294b423da3f7618629c0e0efc34cc/packages/tools/openapi-generator/src/main.ts)
also demonstrates keeping generated output on stdout and diagnostics on stderr. These links pin the inspected sources;
the example itself is checked against this workspace's Effect `4.0.0-rc.108` dependencies.

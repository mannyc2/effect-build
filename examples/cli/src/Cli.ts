import { Console, Effect } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";
import * as Report from "./Report.ts";

export const command = Command.make(
  "bundle-report",
  {
    report: Argument.file("report", { mustExist: true }).pipe(
      Argument.withDescription("JSON file containing measured asset sizes and byte budgets"),
    ),
    format: Flag.choice("format", ["table", "json"]).pipe(
      Flag.withDescription("Output format"),
      Flag.withDefault("table"),
    ),
    check: Flag.boolean("check").pipe(
      Flag.withDescription("Exit unsuccessfully when an asset exceeds its budget"),
    ),
  },
  Effect.fn("BundleReport.command")(function*({ report, format, check }) {
    const summary = yield* Report.read(report).pipe(
      Effect.mapError((cause) =>
        new CliError.UserError({
          cause,
          userMessage: `Could not read valid bundle measurements from ${report}: ${cause.message}`,
        })
      ),
    );

    // stdout is the report in both modes. Diagnostics go to stderr so JSON output
    // stays parseable, including when --check reports a budget failure.
    yield* Console.log(format === "json" ? JSON.stringify(summary, null, 2) : Report.formatTable(summary));

    if (check && summary.exceeded > 0) {
      return yield* new CliError.UserError({
        cause: summary,
        userMessage: `Bundle budget exceeded by ${summary.exceeded} asset(s).`,
      });
    }
  }),
).pipe(
  Command.withDescription("Summarize bundle sizes and enforce per-asset budgets"),
  Command.withExamples([
    { command: "bundle-report fixtures/bundles.json", description: "Print an asset size table" },
    {
      command: "bundle-report fixtures/over-budget.json --format json --check",
      description: "Print machine-readable results and fail on exceeded budgets",
    },
  ]),
);

export const run = Command.run(command, { version: "1.0.0" });

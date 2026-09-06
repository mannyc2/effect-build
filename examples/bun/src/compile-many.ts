import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-bun";

const inputFor = (
  target: Command.CompileExecutable.Target,
): Command.CompileExecutable.Input<"hashed"> => ({
  entrypoints: ["src/main.ts"],
  outfile: `dist/hello-${target}${target.startsWith("bun-windows-") ? ".exe" : ""}`,
  target,
  observation: "hashed",
  options: { minify: true },
});

// A non-empty tuple is checked directly; no assertion from an arbitrary array.
const inputs = [
  inputFor("bun-linux-x64"),
  inputFor("bun-darwin-arm64"),
  inputFor("bun-windows-x64"),
] as const;

const program = Effect.gen(function*() {
  const report = yield* Command.CompileExecutable.compileExecutableMatrix({
    inputs,
    concurrency: 2,
  });

  for (const cell of report.cells) {
    if (cell._tag === "Success") {
      yield* Console.log(`${cell.artifact.path} sha256=${cell.artifact.digest.value}`);
    } else {
      yield* Console.error(inputs[cell.identity.index]?.target, cell.error);
    }
  }

  // Matrix failures are data. Fail the script after reporting every cell;
  // successful artifacts remain available when another cell fails.
  const firstFailure = report.cells.find((cell) => cell._tag === "Failure");
  if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.error);
}).pipe(
  Effect.provide(Command.layer()),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);

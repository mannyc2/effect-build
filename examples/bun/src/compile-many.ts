import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect-build-bun";

const targets = ["bun-linux-x64", "bun-darwin-arm64", "bun-windows-x64"] as const;

const report = await Effect.runPromise(
  Command.CompileExecutable.compileExecutableMatrix({
    inputs: targets.map((target) => ({
      entrypoints: ["src/main.ts"],
      outfile: `dist/app-${target}${target.startsWith("bun-windows-") ? ".exe" : ""}`,
      target,
      observation: "hashed" as const,
      options: { minify: true },
    })) as unknown as readonly [
      Command.CompileExecutable.Input<"hashed">,
      ...Command.CompileExecutable.Input<"hashed">[],
    ],
    concurrency: 2,
  }).pipe(
    Effect.provide(Command.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

for (const cell of report.cells) {
  console.log(targets[cell.identity.index], cell._tag);
}

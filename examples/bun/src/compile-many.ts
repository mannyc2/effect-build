import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as CompileExecutable from "effect-build-bun/CompileExecutable";

// Fan out over targets with plain Effect combinators; each cell settles
// independently as an Exit, so one failure never rolls back the others.
const targets = ["linux-x64-gnu", "macos-aarch64", "windows-x64"] as const;

const results = await Effect.runPromise(
  Effect.forEach(
    targets,
    (target) =>
      Effect.exit(CompileExecutable.compileExecutable({
        entrypoint: "src/main.ts",
        outfile: `dist/app-${target}`,
        target,
        minify: true,
      })),
    { concurrency: 2 },
  ).pipe(
    Effect.provide(CompileExecutable.layer()),
    Effect.provide(NodeServices.layer),
  ),
);

for (const [index, exit] of results.entries()) {
  console.log(targets[index], exit._tag);
}

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import * as Archive from "effect-build-archives/Archive";
import { buildDistribution } from "./Pipeline.ts";

const program = buildDistribution("dist").pipe(
  Effect.tap(({ bundle, archive, adoption }) =>
    Effect.gen(function*() {
      yield* Console.log(`Bundle: ${bundle.path}`);
      yield* Console.log(`Archive: ${archive.path}`);
      yield* Console.log(JSON.stringify(adoption, null, 2));
    })
  ),
  Effect.provide(Archive.layer),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);

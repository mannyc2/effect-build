import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect-build-bun";
import { compile } from "./Compile.ts";

const compiler = Command.layer();

compile("dist/bundle-report.exe").pipe(
  Effect.tap((artifact) =>
    Console.log(`${artifact.path} ${artifact.target} ${artifact.bytes} bytes sha256=${artifact.digest.value}`)
  ),
  Effect.provide(compiler),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);

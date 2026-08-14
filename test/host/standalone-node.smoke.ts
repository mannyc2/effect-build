import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";
import { it } from "vitest";
import { standaloneHostContract } from "../testkit/standaloneHostContract.js";

it("runs the identical standalone build call under official Node services", () => {
  const executable = process.env.EFFECT_BUILD_BUN_BIN;
  return Effect.runPromise(
    standaloneHostContract.pipe(
      Effect.provide(Bun.layer(executable === undefined ? {} : { executable })),
      Effect.provide(NodeServices.layer),
    ),
  );
}, 60_000);

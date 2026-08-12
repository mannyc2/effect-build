import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import * as BunCompiler from "../../src/Bun.js";
import { standaloneHostContract } from "../testkit/standaloneHostContract.js";

const executable = (globalThis as typeof globalThis & { Bun: { env: Record<string, string | undefined> } }).Bun.env
  .EFFECT_BUILD_BUN_BIN;
await Effect.runPromise(
  standaloneHostContract.pipe(
    Effect.provide(BunCompiler.layer(executable === undefined ? {} : { executable })),
    Effect.provide(BunServices.layer),
  ),
);

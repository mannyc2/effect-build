import { DenoServices } from "@effect/platform-deno";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";
import { standaloneHostContract } from "../testkit/standaloneHostContract.js";

const executable = (globalThis as typeof globalThis & { Deno: { env: { get(name: string): string | undefined } } }).Deno
  .env
  .get("EFFECT_BUILD_BUN_BIN");
await Effect.runPromise(
  standaloneHostContract.pipe(
    Effect.provide(Bun.layer(executable === undefined ? {} : { executable })),
    Effect.provide(DenoServices.layer),
  ),
);

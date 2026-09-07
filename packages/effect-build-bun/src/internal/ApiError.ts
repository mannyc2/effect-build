/// <reference types="bun-types" preserve="true" />

import type * as bun from "bun";
import { Effect, Schema } from "effect";
import { Tool } from "effect-build";
import { tested } from "../Bun.js";

export class BunApiUnavailable extends Schema.TaggedError<BunApiUnavailable>()("BunApiUnavailable", {
  capability: Schema.String,
  reason: Schema.String,
}) {}

/** Preserve the original exception, including Bun's AggregateError diagnostics. */
export class BunApiFailed extends Schema.TaggedError<BunApiFailed>()("BunApiFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {}

export const globalApi = <K extends "build" | "Transpiler">(capability: K) =>
  Effect.gen(function*(): Effect.fn.Return<typeof bun[K], BunApiUnavailable> {
    const host: unknown = Reflect.get(globalThis, "Bun");
    if (typeof host !== "object" || host === null) {
      return yield* new BunApiUnavailable({ capability, reason: "Requires the Bun runtime" });
    }
    const version: unknown = Reflect.get(host, "version");
    const native: unknown = Reflect.get(host, capability);
    if (typeof version !== "string" || !Tool.satisfies(tested)(version)) {
      return yield* new BunApiUnavailable({ capability, reason: `Bun ${String(version)} is outside ${tested}` });
    }
    if (typeof native !== "function") {
      return yield* new BunApiUnavailable({ capability, reason: `Bun.${capability} is absent` });
    }
    return native.bind(host) as typeof bun[K];
  });

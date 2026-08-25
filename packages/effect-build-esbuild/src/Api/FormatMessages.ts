import { Effect } from "effect";
import * as esbuild from "esbuild";
import { EsbuildFailed } from "../internal/error.js";

export { EsbuildFailed } from "../internal/error.js";

export const formatMessages = (
  messages: readonly esbuild.PartialMessage[],
  options: esbuild.FormatMessagesOptions,
): Effect.Effect<readonly string[], EsbuildFailed> =>
  Effect.tryPromise({
    try: () => esbuild.formatMessages([...messages], options),
    catch: (cause) => new EsbuildFailed({ operation: "formatMessages", cause }),
  });

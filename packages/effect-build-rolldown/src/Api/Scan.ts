import { Effect } from "effect";
import type * as rolldown from "rolldown";
import { scan as nativeScan } from "rolldown/experimental";
import { RolldownFailed } from "../internal/error.js";

export { RolldownFailed } from "../internal/error.js";

/**
 * Run a scan through completion. Although the 1.2.5 declaration spells the
 * return as `Promise<Promise<void>>`, JavaScript promise assimilation means the
 * outer promise settles only after the cleanup promise. There is no separate
 * cleanup handle that can truthfully escape this operation.
 */
export const scan = (
  input: rolldown.InputOptions,
  output: {} = {},
): Effect.Effect<void, RolldownFailed> =>
  Effect.tryPromise({
    try: () => nativeScan(input, output) as unknown as Promise<void>,
    catch: (cause) => new RolldownFailed({ operation: "scan", cause }),
  });

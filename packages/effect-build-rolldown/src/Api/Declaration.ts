import { Effect } from "effect";
import {
  isolatedDeclaration,
  type IsolatedDeclarationsOptions,
  type IsolatedDeclarationsResult,
} from "rolldown/experimental";
import { RolldownFailed } from "../internal/error.js";

export type { IsolatedDeclarationsOptions, IsolatedDeclarationsResult } from "rolldown/experimental";
export { RolldownFailed } from "../internal/error.js";

export const emit = (
  filename: string,
  sourceText: string,
  options?: IsolatedDeclarationsOptions | null,
): Effect.Effect<IsolatedDeclarationsResult, RolldownFailed> =>
  Effect.tryPromise({
    try: () => isolatedDeclaration(filename, sourceText, options),
    catch: (cause) => new RolldownFailed({ operation: "declaration", cause }),
  });

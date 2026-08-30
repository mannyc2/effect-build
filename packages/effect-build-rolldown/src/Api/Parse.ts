import { Effect } from "effect";
import { parse as nativeParse, type ParseResult, type ParserOptions } from "rolldown/utils";
import { RolldownFailed } from "../internal/error.js";

export type { ParseResult, ParserOptions } from "rolldown/utils";
export { RolldownFailed } from "../internal/error.js";

export const parse = (
  filename: string,
  sourceText: string,
  options?: ParserOptions | null,
): Effect.Effect<ParseResult, RolldownFailed> =>
  Effect.tryPromise({
    try: () => nativeParse(filename, sourceText, options),
    catch: (cause) => new RolldownFailed({ operation: "parse", cause }),
  });

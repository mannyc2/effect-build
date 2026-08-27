import { Effect } from "effect";
import type * as rolldown from "rolldown";
import { loadConfig as nativeLoadConfig } from "rolldown/config";
import { RolldownFailed } from "../internal/error.js";

export { RolldownFailed } from "../internal/error.js";

export interface LoadOptions {
  readonly configLoader?: "bundle" | "native";
}

/** Executes the caller-selected configuration module; this is an explicit trust boundary. */
export const load = (
  configPath: string,
  options?: LoadOptions,
): Effect.Effect<rolldown.ConfigExport, RolldownFailed> =>
  Effect.tryPromise({
    try: () => nativeLoadConfig(configPath, options),
    catch: (cause) => new RolldownFailed({ operation: "loadConfig", cause }),
  });

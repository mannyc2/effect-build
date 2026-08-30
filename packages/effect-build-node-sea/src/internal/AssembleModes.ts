import { Effect } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { assemble, type Error, type Input as BaseInput, type ModeOptions } from "./Assemble.js";
import { NodeSeaInputInvalid } from "./Error.js";

export type ExecArgvExtension = "none" | "env" | "cli";

export interface Input<Mode extends Artifact.ObservationMode> extends BaseInput<Mode> {
  readonly useSnapshot?: boolean;
  readonly useCodeCache?: boolean;
  readonly execArgv?: readonly string[];
  readonly execArgvExtension?: ExecArgvExtension;
}

const inputKeys = [
  "main",
  "outfile",
  "cwd",
  "observation",
  "assets",
  "disableExperimentalSEAWarning",
  "useSnapshot",
  "useCodeCache",
  "execArgv",
  "execArgvExtension",
] as const;

const invalid = (reason: string): NodeSeaInputInvalid =>
  new NodeSeaInputInvalid({ operation: "assemble-direct", reason });

const parseModes = <Mode extends Artifact.ObservationMode>(
  input: Input<Mode>,
): Effect.Effect<ModeOptions, NodeSeaInputInvalid> =>
  Effect.gen(function*() {
    if (typeof input !== "object" || input === null) return yield* invalid("input must be an object");
    if (input.useSnapshot !== undefined && typeof input.useSnapshot !== "boolean") {
      return yield* invalid("useSnapshot must be boolean");
    }
    if (input.useCodeCache !== undefined && typeof input.useCodeCache !== "boolean") {
      return yield* invalid("useCodeCache must be boolean");
    }
    const useSnapshot = input.useSnapshot ?? false;
    const useCodeCache = input.useCodeCache ?? false;
    if (input.main?.format === "module" && useSnapshot) {
      return yield* invalid("ESM main is incompatible with startup snapshots");
    }
    if (useSnapshot && useCodeCache) {
      return yield* invalid("startup snapshot and code cache cannot be enabled together");
    }
    let execArgv: readonly string[] | undefined;
    if (input.execArgv !== undefined) {
      if (!Array.isArray(input.execArgv)) return yield* invalid("execArgv must be an array");
      const values: string[] = [];
      for (const value of input.execArgv) {
        if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
          return yield* invalid("execArgv entries must be non-empty strings without NUL");
        }
        values.push(value);
      }
      execArgv = Object.freeze(values);
    }
    const execArgvExtension = input.execArgvExtension;
    if (
      execArgvExtension !== undefined
      && execArgvExtension !== "none"
      && execArgvExtension !== "env"
      && execArgvExtension !== "cli"
    ) {
      return yield* invalid("execArgvExtension must be none, env, or cli");
    }
    if (execArgv !== undefined && execArgvExtension === undefined) {
      return yield* invalid("execArgv requires an explicit execArgvExtension policy");
    }
    return {
      useSnapshot,
      useCodeCache,
      ...(execArgv === undefined ? {} : { execArgv }),
      ...(execArgvExtension === undefined ? {} : { execArgvExtension }),
    };
  });

/** Package-private provider-native request modes pending exact-cell admission. */
export const assembleDirect = <Mode extends Artifact.ObservationMode>(
  input: Input<Mode>,
): Effect.Effect<
  import("effect-build/Author/Executable").Artifact<Mode>,
  Error,
  | import("./Runtime.js").Runtime
  | import("effect").Crypto.Crypto
  | import("effect").FileSystem.FileSystem
  | import("effect").Path.Path
> => Effect.flatMap(parseModes(input), (modes) => assemble(input, modes, inputKeys));

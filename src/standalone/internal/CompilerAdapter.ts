import type { ToolFailed } from "../BuildError.js";
import type { CompileExecutableInput } from "../Driver.js";
import type { Target } from "../Target.js";
import type { ProcessCompletion } from "./Process.js";

export interface ObservedTool {
  readonly name: "bun" | "deno";
  readonly version: string;
  readonly path: string;
}

/** The part of an adapter `discoverTool` needs: how to name the tool and how to ask it what it is. */
export interface ToolProbe {
  readonly toolName: "bun" | "deno";
  /** Argv that makes the tool print `{path, version}` as JSON on stdout. */
  readonly probeArgv: readonly string[];
}

export interface CompilerAdapter<Options> extends ToolProbe {
  readonly supportedTargets: readonly Target[];
  readonly defaultTarget?: Target;
  readonly renderArgv: (context: {
    readonly input: CompileExecutableInput<Options>;
    readonly stagedOutfile: string;
  }) => readonly string[];
  readonly interpretFailure: (completion: ProcessCompletion) => ToolFailed;
}

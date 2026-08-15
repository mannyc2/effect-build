import { Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { executeCommand } from "../../Integration.js";
import { ToolNotFound, ToolProbeFailed } from "../BuildError.js";
import { OperatingSystem, type OperatingSystem as OperatingSystemType } from "./TargetCatalog.js";

export interface ToolProbe<Name extends string> {
  readonly toolName: Name;
  readonly probeArgv: readonly string[];
}

export interface DiscoveredCompiler<Name extends string> {
  readonly artifactTool: {
    readonly name: Name;
    readonly version: string;
    readonly path: string;
  };
  readonly hostOs: OperatingSystemType;
}

export const discoverTool = <const Name extends string>(
  { probeArgv, toolName: tool }: ToolProbe<Name>,
  executable: string | undefined,
): Effect.Effect<
  DiscoveredCompiler<Name>,
  ToolNotFound | ToolProbeFailed,
  EffectChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const command = executable ?? tool;
    if (executable !== undefined && !path.isAbsolute(executable)) {
      return yield* new ToolProbeFailed({ tool, reason: "explicit executable must be an absolute path" });
    }
    const completion = yield* executeCommand(command, probeArgv).pipe(
      Effect.mapError((error) =>
        error.reason._tag === "NotFound"
          ? new ToolNotFound({ tool, command })
          : new ToolProbeFailed({ tool, reason: error.message })
      ),
    );
    if (completion.exitCode !== 0) {
      return yield* new ToolProbeFailed({
        tool,
        reason: completion.stderr.text || `probe exited with code ${completion.exitCode}`,
      });
    }
    const observed = yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(completion.stdout.text.trim());
        if (
          typeof value !== "object" || value === null || !("path" in value) || !("version" in value)
          || !("hostOs" in value)
          || typeof value.path !== "string" || typeof value.version !== "string" || value.version.length === 0
          || !Schema.is(OperatingSystem)(value.hostOs)
        ) throw new Error("probe must report non-empty path/version and a supported host OS");
        return { path: value.path, version: value.version, hostOs: value.hostOs };
      },
      catch: (error) => new ToolProbeFailed({ tool, reason: `malformed probe output: ${String(error)}` }),
    });
    if (!path.isAbsolute(observed.path)) {
      return yield* new ToolProbeFailed({ tool, reason: "probe reported a relative executable path" });
    }
    const realPath = yield* fileSystem.realPath(observed.path).pipe(
      Effect.mapError((error) => new ToolProbeFailed({ tool, reason: error.message })),
    );
    const information = yield* fileSystem.stat(realPath).pipe(
      Effect.mapError((error) => new ToolProbeFailed({ tool, reason: error.message })),
    );
    if (information.type !== "File") {
      return yield* new ToolProbeFailed({ tool, reason: "probe path is not a regular file" });
    }
    return {
      artifactTool: { name: tool, version: observed.version, path: path.normalize(realPath) },
      hostOs: observed.hostOs,
    };
  });

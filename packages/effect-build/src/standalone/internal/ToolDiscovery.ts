import { Cause, Config, Effect, FileSystem, Option, Path, type PlatformError } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { executeCommand } from "../../Integration.js";
import { ToolNotFound, ToolProbeFailed } from "../BuildError.js";

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
}

const mapFailureCause = <A, E, R, E2>(
  operation: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(operation, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const inspectPathCandidate = <A, Name extends string>(
  operation: Effect.Effect<A, PlatformError.PlatformError>,
  tool: Name,
): Effect.Effect<Option.Option<A>, ToolProbeFailed> =>
  Effect.matchCauseEffect(operation, {
    onSuccess: (value) => Effect.succeed(Option.some(value)),
    onFailure: (cause) => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1
        && reason !== undefined
        && Cause.isFailReason(reason)
        && reason.error.reason._tag === "NotFound"
      ) return Effect.succeed(Option.none());
      return Effect.failCause(Cause.map(cause, (error) => new ToolProbeFailed({ tool, reason: error.message })));
    },
  });

const resolvePathCommand = <Name extends string>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  tool: Name,
): Effect.Effect<string, ToolNotFound | ToolProbeFailed> =>
  Effect.gen(function*() {
    const value = yield* mapFailureCause(
      Config.string("PATH"),
      () => new ToolNotFound({ tool, command: tool }),
    );
    const names = path.sep === "\\" ? [tool, `${tool}.exe`] : [tool];
    const entries = value.split(path.sep === "\\" ? ";" : ":");
    for (const entry of entries) {
      if (entry.length === 0 || !path.isAbsolute(entry)) continue;
      for (const name of names) {
        const candidate = path.normalize(path.join(entry, name));
        const canonical = yield* inspectPathCandidate(fileSystem.realPath(candidate), tool);
        if (Option.isNone(canonical)) continue;
        const information = yield* inspectPathCandidate(fileSystem.stat(canonical.value), tool);
        if (Option.isNone(information) || information.value.type !== "File") continue;
        if (path.sep !== "\\" && (information.value.mode & 0o111) === 0) continue;
        return candidate;
      }
    }
    return yield* new ToolNotFound({ tool, command: tool });
  });

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
    if (executable !== undefined && !path.isAbsolute(executable)) {
      return yield* new ToolProbeFailed({ tool, reason: "explicit executable must be an absolute path" });
    }
    const command = executable ?? (yield* resolvePathCommand(fileSystem, path, tool));
    const completion = yield* mapFailureCause(
      executeCommand(command, probeArgv),
      (error) =>
        error.reason._tag === "NotFound"
          ? new ToolNotFound({ tool, command })
          : new ToolProbeFailed({ tool, reason: error.message }),
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
          || typeof value.path !== "string" || value.path.length === 0
          || typeof value.version !== "string" || value.version.length === 0
        ) throw new Error("probe must report non-empty path and version");
        return { path: value.path, version: value.version };
      },
      catch: (error) => new ToolProbeFailed({ tool, reason: `malformed probe output: ${String(error)}` }),
    });
    if (!path.isAbsolute(observed.path)) {
      return yield* new ToolProbeFailed({ tool, reason: "probe reported a relative executable path" });
    }
    const realPath = yield* mapFailureCause(
      fileSystem.realPath(observed.path),
      (error) => new ToolProbeFailed({ tool, reason: error.message }),
    );
    const canonicalPath = path.normalize(realPath);
    if (executable !== undefined) {
      const selectedRealPath = yield* mapFailureCause(
        fileSystem.realPath(executable),
        (error) => new ToolProbeFailed({ tool, reason: error.message }),
      );
      if (path.normalize(selectedRealPath) !== canonicalPath) {
        return yield* new ToolProbeFailed({
          tool,
          reason: "probe reported a different canonical executable path",
        });
      }
    }
    const information = yield* mapFailureCause(
      fileSystem.stat(canonicalPath),
      (error) => new ToolProbeFailed({ tool, reason: error.message }),
    );
    if (information.type !== "File") {
      return yield* new ToolProbeFailed({ tool, reason: "probe path is not a regular file" });
    }
    return {
      artifactTool: { name: tool, version: observed.version, path: canonicalPath },
    };
  });

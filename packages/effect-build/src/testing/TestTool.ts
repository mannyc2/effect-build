import { Effect, FileSystem, Path, PlatformError } from "effect";
import type * as Tool from "../Tool.js";
import * as TestSpawner from "./TestSpawner.js";

/** A record for tests that supply a service directly and never locate the binary. */
export const resolved = (name: string, version: string): Tool.Resolved => ({
  name,
  version,
  path: `/effect-build-testing/${name}`,
  bytes: 0,
});

/** Installs a placeholder for discovery. Override the reply for a tool-specific version grammar. */
export const installed = (name: string, version: string, reply: TestSpawner.Reply = { stdout: `${version}\n` }) =>
  Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (name === "" || name === "." || name === ".." || name.includes("\0") || path.basename(name) !== name) {
    return yield* PlatformError.badArgument({ module: "FileSystem", method: "TestTool.installed", description: "tool name must be a nonempty basename" });
  }
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-test-tool-" });
    const executable = path.join(root, name);
    yield* fs.writeFileString(executable, `${name} ${version}\n`);
    yield* fs.chmod(executable, 0o755);
    const spawner = TestSpawner.layer(() => Effect.succeed(reply));
    return { executable, spawner };
  });

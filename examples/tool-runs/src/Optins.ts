import { Effect, FileSystem, Path } from "effect";
import { Atomic, Digest, Environment, Layout, Tool } from "effect-build";
import { ChildProcess } from "effect/process";

/** An application chooses its portable layout and publication boundary. */
export const publishText = Effect.fn("Optins.publishText")(
  function*(directory: string, relative: string, contents: string) {
    yield* Layout.validatePortable([relative]);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* Atomic.file(
      path.resolve(directory, relative),
      (staged) => fs.writeFileString(staged, contents),
    );
    return { path: file, sha256: yield* Digest.sha256(file) };
  },
);

/** Memoization belongs to this returned Effect; verification still reads current bytes. */
export const inspectFile = Effect.fn("Optins.inspectFile")(function*(file: string) {
  const digest = yield* Effect.cached(Digest.sha256(file));
  return { digest, verify: (expected: string) => Digest.verifySha256(file, expected) };
});

/** Obtain the allowlist values through Config at the application's entry point. */
export const nodeVersion = Effect.fn("Optins.nodeVersion")(
  function*(allowed: Readonly<Record<string, string>>) {
    const node = yield* Tool.make("node");
    const command = ChildProcess.make(node.executable, ["--version"], { stdin: "ignore" }).pipe(
      Environment.scrub(allowed),
    );
    return yield* node.run(command, node.text({ maxBytes: 4096 }));
  },
);

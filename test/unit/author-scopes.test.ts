import { NodeServices } from "@effect/platform-node";
import { Cause, type Crypto, Deferred, Effect, Exit, Fiber, type FileSystem, type Path } from "effect";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as Executable from "../../packages/effect-build/src/Author/Executable.js";
import * as File from "../../packages/effect-build/src/Author/File.js";
import * as Tree from "../../packages/effect-build/src/Author/Tree.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const provenance = Artifact.intrinsicProvenance("scope-test");

describe.each(["file", "executable", "tree"] as const)("%s author owns callback scopes", (kind) => {
  it.each(["success", "failure", "interruption"] as const)(
    "releases producer and inspector on %s without an outer scope",
    async (outcome) => {
      const root = await mkdtemp(join(tmpdir(), "effect-build-author-scope-"));
      roots.push(root);
      const released: string[] = [];
      const exit = await Effect.runPromise(
        Effect.gen(function*() {
          const entered = yield* Deferred.make<void>();
          const acquire = (name: string) =>
            Effect.acquireRelease(Effect.void, () =>
              Effect.sync(() => {
                released.push(name);
              }));
          const produce = (candidate: Artifact.AbsolutePath) =>
            Effect.gen(function*() {
              yield* acquire("producer");
              yield* Effect.promise(() =>
                writeFile(kind === "tree" ? join(candidate, "payload") : candidate, "payload")
              );
            });
          const inspect = Effect.gen(function*() {
            yield* acquire("inspector");
            yield* Deferred.succeed(entered, undefined);
            if (outcome === "failure") return yield* Effect.fail("inspection failed" as const);
            if (outcome === "interruption") yield* Effect.never;
          });
          const request = { destination: join(root, "result"), observation: "hashed", provenance } as const;
          const publish: Effect.Effect<unknown, unknown, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =
            kind === "tree"
              ? Tree.publish({ outdir: request.destination, observation: "hashed", provenance }, produce, () => inspect)
              : kind === "file"
              ? File.publish(request, produce, () => inspect)
              : Executable.publish(request, produce, () =>
                inspect.pipe(Effect.as({
                  nativeFormat: "elf" as const,
                  target: "linux-x64-gnu" as const,
                  runtime: { name: "fixture", version: "1" },
                })));
          if (outcome !== "interruption") return yield* Effect.exit(publish);
          const fiber = yield* publish.pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }).pipe(Effect.provide(NodeServices.layer)),
      );
      expect(released).toEqual(["inspector", "producer"]);
      expect(Exit.isSuccess(exit)).toBe(outcome === "success");
      if (outcome === "interruption" && Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      if (outcome === "failure" && Exit.isFailure(exit)) {
        expect(Cause.findErrorOption(exit.cause)).toMatchObject({ _tag: "Some", value: "inspection failed" });
      }
      expect(await readdir(root)).toEqual(outcome === "success" ? ["result"] : []);
    },
  );
});

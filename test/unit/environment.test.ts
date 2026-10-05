import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import * as Environment from "../../packages/effect-build/src/Environment.ts";

it("replaces command env while preserving native options and arguments", () => {
  const command = ChildProcess.make("tool", ["--flag"], { cwd: "/tmp", env: { SECRET: "hidden" }, extendEnv: true });
  const result = command.pipe(Environment.scrub({ ALLOWED: "value" }));
  assert.strictEqual(result._tag, "StandardCommand");
  if (result._tag === "StandardCommand") {
    assert.deepStrictEqual(result.args, ["--flag"]);
    assert.deepStrictEqual(result.options, { cwd: "/tmp", env: { ALLOWED: "value" }, extendEnv: false });
  }
  assert.deepStrictEqual(command.options.env, { SECRET: "hidden" });
});

it("transforms each leaf of a nested pipeline and preserves pipe options", () => {
  const first = ChildProcess.make("first", { env: { SECRET: "first" }, extendEnv: true });
  const second = ChildProcess.make("second", { env: { SECRET: "second" } });
  const third = ChildProcess.make("third");
  const pipeline = ChildProcess.pipeTo(ChildProcess.pipeTo(first, second, { from: "stderr" }), third, { to: "fd3" });
  const result = Environment.scrub(pipeline, { ALLOWED: "only" });
  const visit = (command: ChildProcess.Command): void => {
    switch (command._tag) {
      case "StandardCommand":
        assert.deepStrictEqual(command.options.env, { ALLOWED: "only" });
        assert.isFalse(command.options.extendEnv);
        break;
      case "PipedCommand":
        visit(command.left);
        visit(command.right);
        break;
    }
  };
  visit(result);
  assert.strictEqual(result._tag, "PipedCommand");
  if (result._tag === "PipedCommand") {
    assert.deepStrictEqual(result.options, { to: "fd3" });
    assert.strictEqual(result.left._tag, "PipedCommand");
    if (result.left._tag === "PipedCommand") assert.deepStrictEqual(result.left.options, { from: "stderr" });
  }
});

it.layer(NodeServices.layer)("native environment", (it) => {
  it.effect("does not inherit host values even when the original command extended them", () =>
    Effect.gen(function*() {
      const parentKey = "EFFECT_BUILD_ENVIRONMENT_TEST_PARENT";
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const previous = process.env[parentKey];
          process.env[parentKey] = "parent-only";
          return previous;
        }),
        (previous) =>
          Effect.sync(() => {
            if (previous === undefined) delete process.env[parentKey];
            else process.env[parentKey] = previous;
          }),
      );
      assert.strictEqual(process.env[parentKey], "parent-only");
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      // Runtimes may add platform variables; inspect only the values this fixture controls.
      const selected =
        `JSON.stringify({ALLOWED:process.env.ALLOWED ?? null,SECRET:process.env.SECRET ?? null,PARENT:process.env.${parentKey} ?? null})`;
      const command = ChildProcess.make(process.execPath, ["-p", selected], {
        env: { SECRET: "removed" },
        extendEnv: true,
      });
      const handle = yield* spawner.spawn(Environment.scrub(command, { ALLOWED: "only" }));
      const [output, stderr, exit] = yield* Effect.all([
        Stream.runCollect(handle.stdout.pipe(Stream.decodeText())),
        Stream.runCollect(handle.stderr.pipe(Stream.decodeText())),
        handle.exitCode,
      ], { concurrency: "unbounded" });
      assert.strictEqual(Number(exit), 0, stderr.join(""));
      assert.strictEqual(output.join("").trim(), '{"ALLOWED":"only","SECRET":null,"PARENT":null}', process.execPath);
    }));
});

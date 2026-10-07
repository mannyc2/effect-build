import { assert, it } from "@effect/vitest";
import { Config, Effect, FileSystem, Layer, Option, Path, Redacted, Tracer } from "effect";
import { Bun } from "effect-build-bun";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

it.effect("Bun renders native flags, probes once and captures its platform", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(Path.layer)));
    const commands: Array<ReadonlyArray<string>> = [];
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        assert.strictEqual(command._tag, "StandardCommand");
        if (command._tag !== "StandardCommand") return ToolTest.handle();
        commands.push(command.args);
        assert.strictEqual(command.command, "/native/bun");
        return ToolTest.handle({ stdout: command.args[0] === "--version" ? "1.4.2\n" : "" });
      })
    );
    const bun = yield* Bun.make({ executable: "/native/bun" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const outdir = yield* bun.build({
      entrypoints: ["main.ts"],
      outdir: "dist",
      target: "node",
      minify: true,
      external: ["effect"],
      extraArgs: ["--sourcemap=inline"],
    });
    const outfile = yield* bun.compile({ entrypoints: ["main.ts"], outfile: "app", target: "bun-windows-x64" });
    assert.strictEqual(outdir, path.resolve("dist"));
    assert.strictEqual(outfile, path.resolve("app.exe"));
    assert.deepStrictEqual(commands, [
      ["--version"],
      [
        "build",
        "--sourcemap=inline",
        "--minify",
        "--external=effect",
        "--target=node",
        `--outdir=${outdir}`,
        "--",
        "main.ts",
      ],
      ["build", "--compile", "--target=bun-windows-x64", `--outfile=${outfile}`, "--", "main.ts"],
    ]);
  }));

it.effect("Bun surfaces native diagnostics after valid stdout and a failed exit", () =>
  Effect.gen(function*() {
    const spawner = ToolTest.layer((command) =>
      Effect.succeed(ToolTest.handle({
        stdout: command._tag === "StandardCommand" && command.args[0] === "--version" ? "1.4.2" : "built output",
        stderr: "error: Could not resolve ./missing.ts",
        exitCode: Effect.succeed(
          ChildProcessSpawner.ExitCode(command._tag === "StandardCommand" && command.args[0] === "--version" ? 0 : 1),
        ),
      }))
    );
    const bun = yield* Bun.make({ executable: "bun" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const error = yield* Effect.flip(bun.build({ entrypoints: ["missing.ts"], outdir: "dist", target: "bun" }));
    assert.strictEqual(error._tag, "ToolError");
    if (error._tag === "ToolError") assert.strictEqual(error.reason._tag, "Exit");
    assert.include(error.message, "Could not resolve ./missing.ts");
  }));

it.effect("Bun reveals Redacted environment values only into the command", () =>
  Effect.gen(function*() {
    const spawner = ToolTest.layer((command) =>
      Effect.sync(() => {
        const version = command._tag === "StandardCommand" && command.args[0] === "--version";
        if (!version && command._tag === "StandardCommand") {
          assert.deepStrictEqual(command.options.env, { NPM_TOKEN: "npm-secret", MODE: "ci" });
        }
        return ToolTest.handle({
          stdout: version ? "1.4.2" : "",
          stderr: "registry rejected npm-secret",
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(version ? 0 : 1)),
        });
      })
    );
    const bun = yield* Bun.make({ executable: "bun" }).pipe(
      Effect.provideContext(yield* Layer.build(Layer.mergeAll(spawner, FileSystem.layerNoop({}), Path.layer))),
    );
    const error = yield* Effect.flip(bun.build({
      entrypoints: ["main.ts"],
      outdir: "dist",
      target: "bun",
      env: { NPM_TOKEN: Redacted.make("npm-secret"), MODE: "ci" },
      extendEnv: true,
    }));
    assert.include(error.message, "registry rejected <redacted>");
    assert.notInclude(JSON.stringify(error), "npm-secret");
  }));

it.effect("Bun layerConfig reads its executable through Config", () =>
  Effect.gen(function*() {
    const context = yield* Layer.build(
      Bun.layerConfig({ executable: Config.succeed("bun") }).pipe(
        Layer.provide([
          ToolTest.layer(() => Effect.succeed(ToolTest.handle({ stdout: "1.4.2" }))),
          FileSystem.layerNoop({}),
          Path.layer,
        ]),
      ),
    );
    const bun = yield* Bun.pipe(Effect.provideContext(context));
    const output = yield* bun.build({ entrypoints: ["main.ts"], outdir: "dist", target: "bun" });
    assert.isString(output);
  }));

it.effect("Bun compile traces belong to the caller rather than the construction context", () =>
  Effect.gen(function*() {
    const spans: Array<Tracer.NativeSpan> = [];
    const parentStates = new Map<Tracer.NativeSpan, "Started" | "Ended" | undefined>();
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        const parent = Option.getOrUndefined(span.parent);
        parentStates.set(span, parent?._tag === "Span" ? parent.status._tag : undefined);
        spans.push(span);
        return span;
      },
    });
    const platform = yield* Layer.build(Layer.mergeAll(
      ToolTest.layer(() => Effect.succeed(ToolTest.handle({ stdout: "1.4.2" }))),
      FileSystem.layerNoop({}),
      Path.layer,
    ));
    const bun = yield* Bun.make({ executable: "bun" }).pipe(
      Effect.provideContext(platform),
      Effect.withSpan("construct"),
      Effect.withTracer(tracer),
    );
    assert.strictEqual(spans.find((span) => span.name === "Bun.make")?.status._tag, "Ended");
    yield* bun.compile({ entrypoints: ["main.ts"], outfile: "app", target: "bun-linux-x64" }).pipe(
      Effect.withSpan("invoke"),
      Effect.withTracer(tracer),
    );
    const compile = spans.find((span) => span.name === "Bun.compile");
    const run = spans.filter((span) => span.name === "Tool.run").at(-1);
    const invoke = spans.find((span) => span.name === "invoke");
    if (compile === undefined || run === undefined || invoke === undefined) {
      return assert.fail("expected invocation, compile and process spans");
    }
    assert.strictEqual(Option.getOrUndefined(compile.parent), invoke);
    assert.strictEqual(Option.getOrUndefined(run.parent), compile);
    for (const span of [compile, run]) {
      assert.strictEqual(parentStates.get(span), "Started");
      assert.strictEqual(span.status._tag, "Ended");
      assert.strictEqual(span.attributes.size, 0);
    }
    assert.strictEqual(invoke.status._tag, "Ended");
  }));

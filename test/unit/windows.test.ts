import { NodePath } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Redacted } from "effect";
import { SignTool } from "effect-build-windows";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

it.effect("SignTool uses native PFX flags and leaves verification explicit", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(NodePath.layer)));
    const commands: Array<ReadonlyArray<string>> = [];
    const signtool = yield* SignTool.make({ executable: "signtool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") commands.push(command.args);
              return ToolTest.handle();
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    const file = yield* signtool.sign({
      path: "app.exe",
      credential: { _tag: "Pfx", file: "cert.pfx", password: Redacted.make("password") },
      timestampUrl: "https://timestamp.example.com",
      description: "Application",
    });
    assert.strictEqual(file, path.resolve("app.exe"));
    assert.deepStrictEqual(commands, [[
      "sign",
      "/fd",
      "SHA256",
      "/tr",
      "https://timestamp.example.com",
      "/td",
      "SHA256",
      "/d",
      "Application",
      "/f",
      "cert.pfx",
      "/p",
      "password",
      file,
    ]]);
    yield* signtool.verify({ path: file });
    assert.deepStrictEqual(commands[1], ["verify", "/pa", "/all", file]);
  }));

it.effect("SignTool keeps PFX passwords out of native failure diagnostics", () =>
  Effect.gen(function*() {
    const signtool = yield* SignTool.make({ executable: "signtool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer(() =>
            Effect.succeed(
              ToolTest.handle({
                stderr: "password SECRET rejected",
                exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
              }),
            )
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    const error = yield* Effect.flip(
      signtool.sign({
        path: "app.exe",
        credential: { _tag: "Pfx", file: "cert.pfx", password: Redacted.make("SECRET") },
      }),
    );
    assert.strictEqual(error.reason._tag, "Exit");
    assert.notInclude(error.message, "SECRET");
    assert.include(error.message, "rejected");
  }));

it.effect("SignTool store and Trusted Signing credentials use native options", () =>
  Effect.gen(function*() {
    const commands: Array<ReadonlyArray<string>> = [];
    const environments: Array<Record<string, string | undefined> | undefined> = [];
    const signtool = yield* SignTool.make({ executable: "signtool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") {
                commands.push(command.args);
                environments.push(command.options.env);
              }
              return ToolTest.handle();
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    yield* signtool.sign({
      path: "app.exe",
      credential: { _tag: "Store", thumbprint: "certificate", name: "My", machine: true },
    });
    yield* signtool.sign({
      path: "app.msix",
      credential: {
        _tag: "TrustedSigning",
        library: "Azure.CodeSigning.Dlib.dll",
        metadata: "metadata.json",
        env: { AZURE_CLIENT_SECRET: Redacted.make("azure-secret") },
      },
      env: { AZURE_CLIENT_ID: "client" },
      extendEnv: true,
    });
    assert.deepStrictEqual(commands[0]?.slice(0, -1), [
      "sign",
      "/fd",
      "SHA256",
      "/sm",
      "/s",
      "My",
      "/sha1",
      "certificate",
    ]);
    assert.deepStrictEqual(commands[1]?.slice(0, -1), [
      "sign",
      "/fd",
      "SHA256",
      "/dlib",
      "Azure.CodeSigning.Dlib.dll",
      "/dmdf",
      "metadata.json",
    ]);
    assert.deepStrictEqual(environments[1], { AZURE_CLIENT_ID: "client", AZURE_CLIENT_SECRET: "azure-secret" });
  }));

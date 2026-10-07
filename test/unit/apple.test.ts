import { NodePath } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { ByteSize, ConfigProvider, Effect, FileSystem, Layer, Option, Path, Redacted } from "effect";
import { Codesign, Notarytool, Stapler } from "effect-build-apple";
import { ToolTest } from "effect-build/testing";
import { ChildProcessSpawner } from "effect/process";

it.effect("codesign signs paths in place and leaves verification explicit", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(NodePath.layer)));
    const commands: Array<ReadonlyArray<string>> = [];
    const codesign = yield* Codesign.make({ executable: "codesign" }).pipe(
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
    const result = yield* codesign.sign({
      path: "app",
      identity: "-",
      force: true,
      hardenedRuntime: true,
      timestamp: false,
      entitlements: "entitlements.plist",
    });
    assert.strictEqual(result, path.resolve("app"));
    assert.deepStrictEqual(commands, [[
      "--sign",
      "-",
      "--force",
      "--options",
      "runtime",
      "--timestamp=none",
      "--entitlements",
      "entitlements.plist",
      "--",
      result,
    ]]);
    yield* codesign.verify({ path: result, strict: true });
    assert.deepStrictEqual(commands[1], ["--verify", "--strict", "--", result]);
  }));

it.effect("notarytool decodes submit without assuming a completed native status", () =>
  Effect.gen(function*() {
    const notary = yield* Notarytool.make({ executable: "/native/notarytool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") {
                assert.deepStrictEqual(command.args, [
                  "submit",
                  "release.zip",
                  "--keychain-profile",
                  "release",
                  "--output-format",
                  "json",
                ]);
              }
              return ToolTest.handle({
                stdout: '{"id":"job-id","message":"Successfully uploaded file","path":"release.zip"}',
              });
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    assert.deepStrictEqual(
      yield* notary.submit({ path: "release.zip", credential: { _tag: "Keychain", profile: "release" } }),
      {
        id: "job-id",
        message: "Successfully uploaded file",
        path: "release.zip",
      },
    );
  }));

it.effect("notarytool wait returns a rejected status for application policy", () =>
  Effect.gen(function*() {
    const notary = yield* Notarytool.make({ executable: "notarytool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") {
                assert.deepStrictEqual(command.args, [
                  "wait",
                  "job-id",
                  "--timeout",
                  "30m",
                  "--key",
                  "AuthKey.p8",
                  "--key-id",
                  "KEYID",
                  "--issuer",
                  "issuer-id",
                  "--output-format",
                  "json",
                ]);
              }
              return ToolTest.handle({ stdout: '{"id":"job-id","status":"Invalid","message":"Rejected by Apple"}' });
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    const result = yield* notary.wait({
      id: "job-id",
      timeout: "30m",
      credential: { _tag: "ApiKey", keyFile: "AuthKey.p8", keyId: "KEYID", issuer: "issuer-id" },
    });
    assert.strictEqual(result.status, "Invalid");
  }));

it.effect("notarytool removes a Redacted native password from failed diagnostics", () =>
  Effect.gen(function*() {
    const notary = yield* Notarytool.make({ executable: "notarytool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") {
                assert.deepStrictEqual(command.args, [
                  "info",
                  "job-id",
                  "--apple-id",
                  "user@example.com",
                  "--team-id",
                  "TEAM",
                  "--password",
                  "secret-token",
                  "--output-format",
                  "json",
                ]);
              }
              return ToolTest.handle({
                stderr: "password secret-token rejected",
                exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
              });
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    const error = yield* Effect.flip(
      notary.info({
        id: "job-id",
        credential: {
          _tag: "AppleId",
          appleId: "user@example.com",
          teamId: "TEAM",
          password: Redacted.make("secret-token"),
        },
      }),
    );
    assert.strictEqual(error.reason._tag, "Exit");
    assert.notInclude(error.message, "secret-token");
    assert.include(error.message, "rejected");
    assert.isTrue(error.message.startsWith("notarytool exited with code 1"));
  }));

it.effect("notarytool log preserves JSON issues with the native log arguments", () =>
  Effect.gen(function*() {
    const notary = yield* Notarytool.make({ executable: "notarytool" }).pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              assert.strictEqual(command._tag, "StandardCommand");
              if (command._tag === "StandardCommand") {
                assert.deepStrictEqual(command.args, ["log", "job-id", "--keychain-profile", "release"]);
              }
              return ToolTest.handle({
                stdout: '{"jobId":"job-id","issues":[{"severity":"error","message":"Unsigned nested code"}]}',
              });
            })
          ),
          FileSystem.layerNoop({}),
          NodePath.layer,
        )),
      ),
    );
    assert.deepStrictEqual(yield* notary.log({ id: "job-id", credential: { _tag: "Keychain", profile: "release" } }), {
      jobId: "job-id",
      issues: [{ severity: "error", message: "Unsigned nested code" }],
    });
  }));

it.effect("stapler keeps in-place mutation and ticket validation separate", () =>
  Effect.gen(function*() {
    const path = yield* Path.Path.pipe(Effect.provideContext(yield* Layer.build(NodePath.layer)));
    const commands: Array<ReadonlyArray<string>> = [];
    const stapler = yield* Stapler.make({ executable: "stapler" }).pipe(
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
    const output = yield* stapler.staple({ path: "release.dmg", extraArgs: ["-v"] });
    yield* stapler.validate({ path: output });
    assert.strictEqual(output, path.resolve("release.dmg"));
    assert.deepStrictEqual(commands, [["staple", "-v", output], ["validate", output]]);
  }));

it.effect("xcrun-run tools are still named for the tool in their failures", () =>
  Effect.gen(function*() {
    const commands: Array<ReadonlyArray<string>> = [];
    const stapler = yield* Stapler.make().pipe(
      Effect.provideContext(
        yield* Layer.build(Layer.mergeAll(
          ToolTest.layer((command) =>
            Effect.sync(() => {
              if (command._tag === "StandardCommand") commands.push([command.command, ...command.args]);
              return ToolTest.handle({
                stderr: "release.dmg does not have a ticket stapled to it.",
                exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(65)),
              });
            })
          ),
          FileSystem.layerNoop({
            stat: () =>
              Effect.succeed({
                type: "File",
                mode: 0o755,
                dev: 0,
                size: ByteSize.bytes(0),
                mtime: Option.none(),
                atime: Option.none(),
                birthtime: Option.none(),
                ino: Option.none(),
                nlink: Option.none(),
                uid: Option.none(),
                gid: Option.none(),
                rdev: Option.none(),
                blksize: Option.none(),
                blocks: Option.none(),
              }),
          }),
          NodePath.layer,
        )),
      ),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: "/usr/bin" })),
    );
    const error = yield* Effect.flip(stapler.validate({ path: "/release.dmg" }));
    assert.deepStrictEqual(commands, [["/usr/bin/xcrun", "stapler", "validate", "/release.dmg"]]);
    assert.strictEqual(error.message, "stapler exited with code 65: release.dmg does not have a ticket stapled to it.");
  }));

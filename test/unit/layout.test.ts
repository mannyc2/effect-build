import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Layout from "../../packages/effect-build/src/Layout.ts";

it.effect("accepts distinct leaves sharing implicit directories", () =>
  Effect.gen(function*() {
    assert.isUndefined(yield* Layout.validatePortable(["docs/README.md", "docs/logo.svg", "app"]));
    assert.isUndefined(yield* Layout.validatePortable([]));
  }));

it.effect.each([
  { paths: ["/app", "C:/app", "a:b"], detail: "absolute paths are forbidden" },
  { paths: ["a\\b"], detail: "paths use '/' separators" },
  { paths: ["", "../app", "a/./b", "a//b", "a/"], detail: "empty and traversal segments are forbidden" },
  {
    paths: ["a\0b", "name:part", "a?b", "a?b/CON"],
    detail: "control characters and Windows-reserved characters are forbidden",
  },
  { paths: ["name.", "name ", "CON.", "bad./a?b"], detail: "segments cannot end with a dot or space" },
  {
    paths: ["CON", "con.txt", "assets/COM1.png", "LPT9", "COM¹", "assets/LPT².txt", "com³.log", "CON/../app"],
    detail: "Windows device names are forbidden",
  },
])("reports the portable path rule: $detail", ({ paths, detail }) =>
  Effect.gen(function*() {
    for (const path of paths) {
      const error = yield* Layout.validatePortable([path]).pipe(Effect.flip);
      assert.strictEqual(error._tag, "LayoutError");
      assert.strictEqual(error.path, path);
      assert.strictEqual(error.reason._tag, "InvalidPath");
      if (error.reason._tag === "InvalidPath") assert.strictEqual(error.reason.detail, detail);
      assert.strictEqual(error.message, `Invalid portable path ${path}: ${detail}`);
    }
  }));

it.effect.each([
  ["same", "same"],
  ["file", "file/child"],
  ["Readme", "README"],
  ["Docs/a", "docs/b"],
  ["café/a", "cafe\u0301/b"],
])("rejects duplicate, prefix, case and Unicode collisions %j", (paths) =>
  Effect.gen(function*() {
    for (const ordered of [paths, [...paths].reverse()]) {
      const error = yield* Layout.validatePortable(ordered).pipe(Effect.flip);
      assert.strictEqual(error._tag, "LayoutError");
      assert.strictEqual(error.reason._tag, "Collision");
      if (error.reason._tag === "Collision") {
        assert.strictEqual(error.message, `Portable path ${error.path} collides with ${error.reason.previous}`);
      }
    }
  }));

it.effect.each([
  { paths: ["../app", "/app"], path: "../app", reason: "InvalidPath" },
  { paths: ["app", "app", "../app"], path: "app", reason: "Collision" },
  { paths: ["app", "../app", "app"], path: "../app", reason: "InvalidPath" },
  { paths: ["app", "app/a?b"], path: "app/a?b", reason: "InvalidPath" },
])("reports the first failure in path order %j", ({ paths, path, reason }) =>
  Effect.gen(function*() {
    const error = yield* Layout.validatePortable(paths).pipe(Effect.flip);
    assert.strictEqual(error.path, path);
    assert.strictEqual(error.reason._tag, reason);
  }));

it.effect("recovers from collisions by reason while preserving invalid paths", () =>
  Effect.gen(function*() {
    const recovered = yield* Layout.validatePortable(["Readme", "README"]).pipe(
      Effect.catchReason("LayoutError", "Collision", (reason, error) =>
        Effect.succeed({ path: error.path, previous: reason.previous })),
    );
    assert.deepStrictEqual(recovered, { path: "README", previous: "Readme" });

    const error = yield* Layout.validatePortable(["../app"]).pipe(
      Effect.catchReason("LayoutError", "Collision", () =>
        Effect.succeed("recovered")),
      Effect.flip,
    );
    assert.strictEqual(error._tag, "LayoutError");
    assert.strictEqual(error.path, "../app");
    assert.strictEqual(error.reason._tag, "InvalidPath");
  }));

import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Layout from "../../packages/effect-build/src/Layout.ts";

it.effect("accepts distinct leaves sharing implicit directories", () =>
  Effect.gen(function*() {
    assert.isUndefined(yield* Layout.validatePortable(["docs/README.md", "docs/logo.svg", "app"]));
    assert.isUndefined(yield* Layout.validatePortable([]));
  }));

it.effect.each([
  "",
  "/app",
  "C:/app",
  "../app",
  "a/./b",
  "a//b",
  "a/",
  "a\\b",
  "a\0b",
  "CON",
  "con.txt",
  "assets/COM1.png",
  "LPT9",
  "COM¹",
  "assets/LPT².txt",
  "com³.log",
  "name.",
  "name ",
  "a:b",
  "a?b",
])("rejects the nonportable path %j", (path) =>
  Effect.gen(function*() {
    const error = yield* Layout.validatePortable([path]).pipe(Effect.flip);
    assert.strictEqual(error._tag, "LayoutError");
    assert.strictEqual(error.path, path);
    assert.strictEqual(error.reason._tag, "InvalidPath");
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
    }
  }));

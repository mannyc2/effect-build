import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Profile from "../../packages/effect-build-esbuild/src/Profile.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as StaticBrowserApplication from "../../packages/effect-build/src/Profile/StaticBrowserApplication.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-profile-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const provide = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(Profile.layer), Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>;

describe("esbuild portable profiles", () => {
  it("produces one sealed Node main with exact provider identity", async () => {
    const entry = join(root, "node-main.ts");
    await writeFile(entry, 'import { strictEqual } from "node:assert"; strictEqual(2 + 2, 4);\n');
    const exit = await Effect.runPromiseExit(
      provide(Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: entry, format: "commonjs" }))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.producer).toEqual({
        package: "effect-build-esbuild",
        version: "0.5.0",
        engine: "esbuild",
        engineVersion: "0.28.2",
      });
      expect(exit.value.path).toMatch(/main\.cjs$/);
    }
  });

  it("rejects a Node main that imports a local module", async () => {
    const entry = join(root, "node-local.ts");
    const local = join(root, "node-local-value.ts");
    await writeFile(local, "export const value = 1;\n");
    await writeFile(entry, 'import { value } from "./node-local-value.js"; console.log(value);\n');
    const exit = await Effect.runPromiseExit(
      provide(Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: entry, format: "module" }))),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("produces a complete immutable static-browser generation", async () => {
    const entry = join(root, "browser-main.ts");
    const css = join(root, "browser.css");
    const lazy = join(root, "browser-lazy.ts");
    await writeFile(css, "body { color: rgb(1 2 3); }\n");
    await writeFile(lazy, 'document.body.dataset.lazy = "yes";\n');
    await writeFile(
      entry,
      'import "./browser.css"; document.body.dataset.ready = "yes"; void import("./browser-lazy.js");\n',
    );
    const generation = await Effect.runPromise(
      provide(StaticBrowserApplication.build({
        request: { protocol: StaticBrowserApplication.protocol, entrypoint: entry, resources: [] },
        generationRoot: join(root, "browser-output"),
      })),
    );
    expect(generation.manifest.files.some(({ path }) => path === "index.html")).toBe(true);
    expect(generation.manifest.files.some(({ mediaType }) => mediaType === "text/css; charset=utf-8")).toBe(true);
    expect(generation.manifest.files.filter(({ mediaType }) => mediaType === "text/javascript; charset=utf-8"))
      .toHaveLength(
        2,
      );
    expect(generation.manifest.files.every(({ digest }) => digest.value.length === 64)).toBe(true);
  });
});

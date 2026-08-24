import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Profile from "../../packages/effect-build-rolldown/src/Profile.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as StaticBrowserApplication from "../../packages/effect-build/src/Profile/StaticBrowserApplication.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-rolldown-profile-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const provide = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(Profile.layer), Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>;

describe("rolldown portable profiles", () => {
  it("produces one sealed Node main with exact provider identity", async () => {
    const entry = join(root, "node-main.ts");
    await writeFile(entry, 'import { strictEqual } from "node:assert"; strictEqual(3, 3);\n');
    const exit = await Effect.runPromiseExit(
      provide(Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: entry, format: "module" }))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.producer).toEqual({
        package: "effect-build-rolldown",
        version: "0.5.0",
        engine: "rolldown",
        engineVersion: "1.2.5",
      });
    }
  });

  it("rejects a Node main that bundles more than the entrypoint", async () => {
    const entry = join(root, "node-local.ts");
    await writeFile(join(root, "node-local-value.ts"), "export const value = 1;\n");
    await writeFile(entry, 'import { value } from "./node-local-value.js"; console.log(value);\n');
    const exit = await Effect.runPromiseExit(
      provide(Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: entry, format: "commonjs" }))),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("produces a static-browser generation with explicit CSS resources", async () => {
    const entry = join(root, "browser-main.ts");
    const css = join(root, "browser.css");
    await writeFile(entry, 'document.body.dataset.provider = "rolldown";\n');
    await writeFile(css, "body { color: rgb(4 5 6); }\n");
    const generation = await Effect.runPromise(
      provide(StaticBrowserApplication.build({
        request: {
          protocol: StaticBrowserApplication.protocol,
          entrypoint: entry,
          resources: [{ source: css, destination: "static/app.css", mediaType: "text/css; charset=utf-8" }],
        },
        generationRoot: join(root, "browser-output"),
      })),
    );
    expect(generation.manifest.files.some(({ path }) => path === "static/app.css")).toBe(true);
    expect(generation.manifest.files.some(({ mediaType }) => mediaType === "text/javascript; charset=utf-8")).toBe(
      true,
    );
  });
});

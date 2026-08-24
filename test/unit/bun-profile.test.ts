import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Profile from "../../packages/effect-build-bun/src/Profile.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as StaticBrowserApplication from "../../packages/effect-build/src/Profile/StaticBrowserApplication.js";

let root = "";
let fakeBun = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-profile-"));
  if (process.platform === "win32") {
    const { stdout } = await promisify(execFile)("where.exe", ["bun.exe"], { encoding: "utf8" });
    const [executable] = stdout.split(/\r?\n/u).filter(Boolean);
    if (executable === undefined) throw new Error("the pinned Bun executable is missing from PATH");
    fakeBun = executable;
    return;
  }
  fakeBun = join(root, "bun");
  await writeFile(fakeBun, await readFile(new URL("../fixtures/tools/fake-bun.mjs", import.meta.url)));
  await chmod(fakeBun, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const provide = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provide(Profile.layer({ executable: fakeBun })),
    Effect.provide(NodeServices.layer),
  ) as Effect.Effect<
    A,
    E
  >;

describe("Bun portable profiles", () => {
  it("produces one sealed Node main with exact provider identity", async () => {
    const entry = join(root, "node-main.ts");
    await writeFile(entry, 'import { strictEqual } from "node:assert"; strictEqual(4, 4);\n');
    const exit = await Effect.runPromiseExit(
      provide(Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: entry, format: "commonjs" }))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.producer).toEqual({
        package: "effect-build-bun",
        version: "0.5.0",
        engine: "bun",
        engineVersion: "1.3.14",
      });
    }
  });

  it("produces a static-browser generation with exact metadata", async () => {
    const entry = join(root, "browser-main.ts");
    const css = join(root, "browser.css");
    await writeFile(entry, 'document.body.dataset.provider = "bun";\n');
    await writeFile(css, "body { color: rgb(7 8 9); }\n");
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

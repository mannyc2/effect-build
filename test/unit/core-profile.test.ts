import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer } from "effect";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Generation from "../../packages/effect-build/src/Author/Generation.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as BuildError from "../../packages/effect-build/src/BuildError.js";
import * as StaticBrowserApplication from "../../packages/effect-build/src/Profile/StaticBrowserApplication.js";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-core-profile-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E, R>(effect: Effect.Effect<A, E, R>, layer: Layer.Layer<R>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E>);

const fakeIdentity = {
  package: "@fixture/external-author" as const,
  version: "1.0.0",
  engine: "fixture",
  engineVersion: "1.0.0",
};

describe("NodeMain portable author boundary", () => {
  it("seals one self-contained main from a selected provider without provider branches", async () => {
    let calls = 0;
    const provider = Layer.succeed(NodeMain.Producer, {
      identity: fakeIdentity,
      produce: (request, staging) =>
        Effect.promise(async () => {
          calls += 1;
          const path = join(staging, request.format === "module" ? "main.mjs" : "main.cjs");
          await writeFile(path, 'import { strictEqual } from "node:assert"; strictEqual(1, 1);\n');
          return {
            protocol: NodeMain.producedProtocol,
            format: request.format,
            path,
            inputs: [request.entrypoint],
            runtimeImports: ["node:assert"],
          };
        }),
    });
    const exit = await run(
      Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "module" })),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.protocol).toBe(NodeMain.protocol);
      expect(exit.value.profile).toBe(NodeMain.profile);
      expect(exit.value.producer).toEqual(fakeIdentity);
      expect(exit.value.digest.value).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(calls).toBe(1);
  });

  it("rejects an unknown protocol before provider work", async () => {
    let called = false;
    const provider = Layer.succeed(NodeMain.Producer, {
      identity: fakeIdentity,
      produce: () => {
        called = true;
        return Effect.die("must not run");
      },
    });
    const exit = await run(
      Effect.scoped(NodeMain.seal({
        protocol: "effect-build/profile/node-main@2" as typeof NodeMain.profile,
        entrypoint: "src/main.ts",
        format: "module",
      })),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") {
        expect(error.value).toBeInstanceOf(BuildError.PortableRejected);
        expect((error.value as BuildError.PortableRejected).phase).toBe("request");
      }
    }
    expect(called).toBe(false);
  });

  it("rejects local inputs and dynamic loading after analysis before sealing", async () => {
    const provider = Layer.succeed(NodeMain.Producer, {
      identity: fakeIdentity,
      produce: (request, staging) =>
        Effect.promise(async () => {
          const path = join(staging, "main.cjs");
          await writeFile(path, 'require("./local.js");\n');
          return {
            protocol: NodeMain.producedProtocol,
            format: request.format,
            path,
            inputs: [request.entrypoint, "src/local.ts"],
            runtimeImports: ["./local.js"],
          };
        }),
    });
    const exit = await run(
      Effect.scoped(NodeMain.seal({ protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "commonjs" })),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") {
        expect(error.value).toBeInstanceOf(BuildError.PortableRejected);
        expect((error.value as BuildError.PortableRejected).phase).toBe("analysis");
      }
    }
  });
});

describe("StaticBrowserApplication portable author boundary", () => {
  it("builds, seals, and activates one complete provider-independent generation", async () => {
    const resource = join(root, "logo.txt");
    await writeFile(resource, "logo\n");
    const provider = Layer.succeed(StaticBrowserApplication.Provider, {
      identity: fakeIdentity,
      produce: (_request, staging) =>
        Effect.promise(async () => {
          await mkdir(join(staging, "assets"), { recursive: true });
          await writeFile(join(staging, "assets/main.js"), 'console.log("portable");\n');
          await writeFile(join(staging, "assets/main.css"), "body { color: black; }\n");
          return {
            protocol: StaticBrowserApplication.producedProtocol,
            entryModule: "assets/main.js",
            files: [
              {
                path: "assets/main.css",
                mediaType: "text/css; charset=utf-8",
                imports: [],
              },
              {
                path: "assets/main.js",
                mediaType: "text/javascript; charset=utf-8",
                imports: ["assets/main.css"],
              },
            ],
          };
        }),
    });
    const generationRoot = join(root, "browser-generations");
    const exit = await run(
      StaticBrowserApplication.build({
        request: {
          protocol: StaticBrowserApplication.protocol,
          entrypoint: "src/browser.ts",
          resources: [{ source: resource, destination: "static/logo.txt", mediaType: "text/plain; charset=utf-8" }],
        },
        generationRoot,
      }),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.manifest.subject.profile).toBe(StaticBrowserApplication.protocol);
      expect(exit.value.manifest.files.map(({ path }) => path)).toEqual([
        "assets/main.css",
        "assets/main.js",
        "index.html",
        "static/logo.txt",
      ]);
      const html = await readFile(join(exit.value.tree, "index.html"), "utf8");
      expect(html).toContain('src="./assets/main.js"');
      const activated = await Effect.runPromise(
        Generation.activate({ generation: exit.value, expectedCurrent: null }).pipe(Effect.provide(NodeServices.layer)),
      );
      expect(activated.manifestDigest).toEqual(exit.value.manifestDigest);
    }
  });

  it("rejects invalid resource paths before provider work", async () => {
    let called = false;
    const provider = Layer.succeed(StaticBrowserApplication.Provider, {
      identity: fakeIdentity,
      produce: () => {
        called = true;
        return Effect.die("must not run");
      },
    });
    const exit = await run(
      StaticBrowserApplication.build({
        request: {
          protocol: StaticBrowserApplication.protocol,
          entrypoint: "src/browser.ts",
          resources: [{ source: "logo", destination: "../logo", mediaType: "text/plain" }],
        },
        generationRoot: join(root, "invalid-browser"),
      }),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(called).toBe(false);
  });

  it("rejects incomplete provider metadata before generation publication", async () => {
    const generationRoot = join(root, "incomplete-browser");
    const provider = Layer.succeed(StaticBrowserApplication.Provider, {
      identity: fakeIdentity,
      produce: (_request, staging) =>
        Effect.promise(async () => {
          await writeFile(join(staging, "main.js"), "console.log(1);\n");
          await writeFile(join(staging, "unreported.js"), "console.log(2);\n");
          return {
            protocol: StaticBrowserApplication.producedProtocol,
            entryModule: "main.js",
            files: [{ path: "main.js", mediaType: "text/javascript; charset=utf-8", imports: [] }],
          };
        }),
    });
    const exit = await run(
      StaticBrowserApplication.build({
        request: { protocol: StaticBrowserApplication.protocol, entrypoint: "src/browser.ts", resources: [] },
        generationRoot,
      }),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(await readFile(join(generationRoot, "current.json")).then(() => true, () => false)).toBe(false);
  });

  it("rejects a resource changed by provider work against its pre-provider observation", async () => {
    const resource = join(root, "mutable-resource.txt");
    await writeFile(resource, "before\n");
    const provider = Layer.succeed(StaticBrowserApplication.Provider, {
      identity: fakeIdentity,
      produce: (_request, staging) =>
        Effect.promise(async () => {
          await writeFile(resource, "after\n");
          await writeFile(join(staging, "main.js"), "console.log(1);\n");
          return {
            protocol: StaticBrowserApplication.producedProtocol,
            entryModule: "main.js",
            files: [{ path: "main.js", mediaType: "text/javascript; charset=utf-8", imports: [] }],
          };
        }),
    });
    const exit = await run(
      StaticBrowserApplication.build({
        request: {
          protocol: StaticBrowserApplication.protocol,
          entrypoint: "src/browser.ts",
          resources: [{ source: resource, destination: "resource.txt", mediaType: "text/plain; charset=utf-8" }],
        },
        generationRoot: join(root, "mutable-browser"),
      }),
      Layer.merge(provider, NodeServices.layer),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer } from "effect";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import * as BrowserModulePayload from "../../packages/effect-build/src/Profile/BrowserModulePayload.js";

const identity = Object.freeze({
  package: "@fixture/browser-module-payload",
  version: "1.0.0",
  engine: "fixture",
  engineVersion: "1.0.0",
});

const request: BrowserModulePayload.Request = Object.freeze({
  protocol: BrowserModulePayload.protocol,
  entries: Object.freeze([
    Object.freeze({ id: "application", source: "/fixture/application.ts" }),
    Object.freeze({ id: "administration", source: "/fixture/administration.ts" }),
  ]),
  mode: "production",
  sourceMaps: "linked",
  minify: true,
  external: Object.freeze(["https://cdn.example.invalid/library.js"]),
  conditions: Object.freeze(["browser", "production"]),
});

const produced = (root: string): BrowserModulePayload.ProducedPayload =>
  Object.freeze({
    protocol: BrowserModulePayload.producedProtocol,
    root,
    entries: Object.freeze([
      Object.freeze({
        requestId: "application",
        module: "entry-without-extension",
        associatedStyles: Object.freeze(["styles/application"]),
        associatedChunks: Object.freeze(["chunks/shared", "chunks/lazy"]),
        associatedAssets: Object.freeze(["assets/logo.looks-like-css.css"]),
        preloadCandidates: Object.freeze(["chunks/shared"]),
      }),
      Object.freeze({
        requestId: "administration",
        module: "administration.module",
        associatedStyles: Object.freeze([]),
        associatedChunks: Object.freeze(["chunks/shared"]),
        associatedAssets: Object.freeze([]),
        preloadCandidates: Object.freeze(["chunks/shared"]),
      }),
    ]),
    files: Object.freeze([
      Object.freeze({ path: "entry-without-extension", mediaType: "text/javascript; charset=utf-8", role: "entry" }),
      Object.freeze({ path: "administration.module", mediaType: "text/javascript; charset=utf-8", role: "entry" }),
      Object.freeze({ path: "chunks/shared", mediaType: "text/javascript; charset=utf-8", role: "chunk" }),
      Object.freeze({ path: "chunks/lazy", mediaType: "text/javascript; charset=utf-8", role: "chunk" }),
      Object.freeze({ path: "styles/application", mediaType: "text/css; charset=utf-8", role: "style" }),
      Object.freeze({ path: "assets/logo.looks-like-css.css", mediaType: "image/png", role: "asset" }),
      Object.freeze({ path: "maps/application", mediaType: "application/json; charset=utf-8", role: "source-map" }),
    ]),
    edges: Object.freeze([
      Object.freeze({
        from: "entry-without-extension",
        rawSpecifier: "./chunks/shared?variant=browser#module",
        kind: "import-statement",
        disposition: "internal",
        to: "chunks/shared",
      }),
      Object.freeze({
        from: "entry-without-extension",
        rawSpecifier: "./chunks/lazy",
        kind: "dynamic-import",
        disposition: "internal",
        to: "chunks/lazy",
      }),
      Object.freeze({
        from: "entry-without-extension",
        rawSpecifier: "https://cdn.example.invalid/library.js?channel=stable#api",
        kind: "import-statement",
        disposition: "external",
      }),
      Object.freeze({
        from: "styles/application",
        rawSpecifier: "../assets/logo.looks-like-css.css?density=2#icon",
        kind: "css-url",
        disposition: "internal",
        to: "assets/logo.looks-like-css.css",
      }),
    ]),
    provider: Object.freeze({ metafile: "fixture-native-observation" }),
  });

const writeTree = (root: string): Promise<void> =>
  Promise.all([
    mkdir(join(root, "chunks"), { recursive: true }),
    mkdir(join(root, "styles"), { recursive: true }),
    mkdir(join(root, "assets"), { recursive: true }),
    mkdir(join(root, "maps"), { recursive: true }),
  ]).then(async () => {
    await Promise.all([
      writeFile(join(root, "entry-without-extension"), 'import "./chunks/shared?variant=browser#module";\n'),
      writeFile(join(root, "administration.module"), 'import "./chunks/shared";\n'),
      writeFile(join(root, "chunks/shared"), "export const shared = true;\n"),
      writeFile(join(root, "chunks/lazy"), "export const lazy = true;\n"),
      writeFile(join(root, "styles/application"), "body { color: black; }\n"),
      writeFile(join(root, "assets/logo.looks-like-css.css"), new Uint8Array([137, 80, 78, 71])),
      writeFile(join(root, "maps/application"), "{}\n"),
    ]);
  });

const provider = (
  makeProduced: (root: string) => BrowserModulePayload.ProducedPayload = produced,
): Layer.Layer<BrowserModulePayload.Provider> =>
  Layer.succeed(BrowserModulePayload.Provider, {
    identity,
    produce: (_request, root) =>
      Effect.promise(async () => {
        await writeTree(root);
        return makeProduced(root);
      }),
  });

const services = (layer: Layer.Layer<BrowserModulePayload.Provider>) =>
  Layer.mergeAll(layer, BorrowedOutput.CleanupReporter.layer, NodeServices.layer);

const errorOf = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const option = Cause.findErrorOption(exit.cause);
  if (option._tag === "None") throw new Error("expected typed error");
  return option.value;
};

describe("BrowserModulePayload semantic candidate", () => {
  it("lends one hashed provider-declared closure without filename inference, HTML, or publication", async () => {
    let borrowedRoot = "";
    const result = await Effect.runPromise(
      BrowserModulePayload.withPayload(request, (payload) =>
        Effect.gen(function*() {
          borrowedRoot = payload.root;
          expect(payload.producer).toEqual(identity);
          expect(payload.entries.map(({ requestId, module }) => ({ requestId, module }))).toEqual([
            { requestId: "application", module: "entry-without-extension" },
            { requestId: "administration", module: "administration.module" },
          ]);
          expect(payload.files.find(({ path }) => path === "assets/logo.looks-like-css.css")).toMatchObject({
            mediaType: "image/png",
            role: "asset",
          });
          expect(payload.files.every(({ digest }) => /^[0-9a-f]{64}$/u.test(digest.value))).toBe(true);
          expect(payload.files.some(({ path }) => path === "index.html")).toBe(false);
          expect(payload.edges[0]?.rawSpecifier).toBe("./chunks/shared?variant=browser#module");
          expect((yield* payload.tree.observe).manifestDigest).toEqual(payload.tree.initial.manifestDigest);
          expect(yield* Effect.promise(() => stat(payload.root).then(() => true, () => false))).toBe(true);
          return payload.tree.initial.manifestDigest.value;
        })).pipe(Effect.provide(services(provider()))),
    );
    expect(result).toMatch(/^[0-9a-f]{64}$/u);
    expect(await stat(borrowedRoot).then(() => true, () => false)).toBe(false);
  });

  it("rejects duplicate explicit entry identities before provider work", async () => {
    let called = false;
    const never = Layer.succeed(BrowserModulePayload.Provider, {
      identity,
      produce: () => {
        called = true;
        return Effect.die("must not run");
      },
    });
    const exit = await Effect.runPromiseExit(
      BrowserModulePayload.withPayload(
        { ...request, entries: [{ id: "same", source: "/one.ts" }, { id: "same", source: "/two.ts" }] },
        () => Effect.void,
      ).pipe(Effect.provide(services(never))),
    );
    const error = errorOf(exit);
    expect(error).toBeInstanceOf(BrowserModulePayload.BrowserModulePayloadRejected);
    expect((error as BrowserModulePayload.BrowserModulePayloadRejected).phase).toBe("request");
    expect(called).toBe(false);
  });

  it("rejects metadata that does not exactly cover the borrowed tree", async () => {
    const exit = await Effect.runPromiseExit(
      BrowserModulePayload.withPayload(
        request,
        () => Effect.void,
      ).pipe(Effect.provide(services(provider((root) => ({
        ...produced(root),
        files: produced(root).files.filter(({ path }) => path !== "maps/application"),
      }))))),
    );
    const error = errorOf(exit);
    expect(error).toBeInstanceOf(BrowserModulePayload.BrowserModulePayloadRejected);
    expect((error as BrowserModulePayload.BrowserModulePayloadRejected).reason).toContain("exactly cover");
  });

  it("rejects missing associations and unresolved internal edges", async () => {
    const exit = await Effect.runPromiseExit(
      BrowserModulePayload.withPayload(request, () => Effect.void).pipe(
        Effect.provide(services(provider((root) => {
          const value = produced(root);
          return {
            ...value,
            entries: value.entries.map((entry) =>
              entry.requestId === "application" ? { ...entry, associatedAssets: [] } : entry
            ),
            edges: [{
              from: "entry-without-extension",
              rawSpecifier: "./missing",
              kind: "dynamic-import",
              disposition: "internal",
              to: "chunks/missing",
            }],
          };
        }))),
      ),
    );
    const error = errorOf(exit);
    expect(error).toBeInstanceOf(BrowserModulePayload.BrowserModulePayloadRejected);
    expect((error as BrowserModulePayload.BrowserModulePayloadRejected).reason).toContain("unassociated asset");
  });

  it("detects mutation through the hashed tree lease while preserving callback ownership", async () => {
    const tag = await Effect.runPromise(
      BrowserModulePayload.withPayload(request, (payload) =>
        Effect.gen(function*() {
          yield* Effect.promise(() => writeFile(join(payload.root, "chunks/shared"), "mutated\n"));
          return yield* payload.tree.observe.pipe(
            Effect.as("unexpected"),
            Effect.catchTag("BorrowedOutputChanged", () => Effect.succeed("BorrowedOutputChanged" as const)),
          );
        })).pipe(Effect.provide(services(provider()))),
    );
    expect(tag).toBe("BorrowedOutputChanged");
  });
});

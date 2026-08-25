import { Context, Effect, FileSystem, Layer, Path } from "effect";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as StaticBrowserApplication from "effect-build/Profile/StaticBrowserApplication";

export const identity = Object.freeze({
  package: "@fixture/effect-build-author",
  version: "1.0.0",
  engine: "fixture",
  engineVersion: "1.0.0",
});

export const adapterProducerTag = NodeMain.Producer;

let calls = 0;
export const getCalls = () => calls;

const makeServices = Effect.gen(function*() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const nodeProducer = {
    identity,
    produce: (request, staging) =>
      Effect.gen(function*() {
        calls += 1;
        const output = path.join(staging, request.format === "module" ? "main.mjs" : "main.cjs");
        yield* fileSystem.writeFileString(output, 'import "node:assert";\n', { flag: "wx" });
        return {
          protocol: NodeMain.producedProtocol,
          format: request.format,
          path: output,
          inputs: [request.entrypoint],
          runtimeImports: ["node:assert"],
        };
      }),
  };
  const browserProvider = {
    identity,
    produce: (_request, staging) =>
      Effect.gen(function*() {
        calls += 1;
        const assets = path.join(staging, "assets");
        yield* fileSystem.makeDirectory(assets, { recursive: true });
        yield* fileSystem.writeFileString(path.join(assets, "main.js"), 'console.log("external author");\n', {
          flag: "wx",
        });
        return {
          protocol: StaticBrowserApplication.producedProtocol,
          entryModule: "assets/main.js",
          files: [{ path: "assets/main.js", mediaType: "text/javascript; charset=utf-8", imports: [] }],
        };
      }),
  };
  return Context.make(NodeMain.Producer, nodeProducer).pipe(
    Context.add(StaticBrowserApplication.Provider, browserProvider),
  );
});

export const layer = Layer.effectContext(makeServices);

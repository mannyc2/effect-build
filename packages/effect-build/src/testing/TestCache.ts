import { Effect, FileSystem, Layer, Path } from "effect";
import { KeyValueStore } from "effect/unstable/persistence";
import * as Cache from "../Cache.js";

/** A fresh memory index and scoped real object directory. Keep the returned layer within the scope. */
export const layer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = path.resolve(yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-test-cache-" }));
  return Layer.merge(KeyValueStore.layerMemory, Layer.succeed(Cache.Objects)({ directory }));
});

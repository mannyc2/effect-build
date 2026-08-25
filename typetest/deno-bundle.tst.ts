import type { Effect } from "effect";
import * as ApiBundle from "../packages/effect-build-deno/src/Api/Bundle.js";
import * as Bundle from "../packages/effect-build-deno/src/Command/Bundle.js";
import * as Transpile from "../packages/effect-build-deno/src/Command/Transpile.js";
import * as Runtime from "../packages/effect-build-deno/src/internal/Runtime.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const memory = ApiBundle.memory({ entrypoints: ["main.ts"], write: false });
export type _ApiMemory = Assert<
  Same<
    typeof memory,
    Effect.Effect<
      ApiBundle.Native.Result,
      ApiBundle.DenoBundleFailed | ApiBundle.DenoBundleModeInvalid,
      ApiBundle.Bundle
    >
  >
>;

ApiBundle.direct({ entrypoints: ["main.ts"], outputPath: "bundle.js", write: true });
ApiBundle.direct({ entrypoints: ["main.ts"], outputDir: "dist", write: true });
// @ts-expect-error!
ApiBundle.direct({ entrypoints: ["main.ts"], outputPath: "bundle.js", outputDir: "dist", write: true });
// @ts-expect-error!
ApiBundle.memory({ entrypoints: ["main.ts"], write: true });

const bundled = Bundle.stdout({ entrypoint: "main.ts", platform: "browser" });
export type _CommandBundle = Assert<
  Same<
    typeof bundled,
    Effect.Effect<Bundle.StdoutResult, Runtime.RunError | Runtime.DenoCommandInputInvalid, Runtime.Runtime>
  >
>;
Bundle.direct({
  entrypoints: ["main.ts"],
  destination: { _tag: "Outdir", path: "dist" },
});
Bundle.declarations({
  entrypoints: ["main.ts"],
  destination: { _tag: "Outdir", path: "dist" },
});
Bundle.watch({
  entrypoints: ["main.ts"],
  destination: { _tag: "Outdir", path: "dist" },
});

const transpiled = Transpile.transpile({ file: "main.ts" });
export type _Transpile = Assert<
  Same<
    typeof transpiled,
    Effect.Effect<Transpile.StdoutResult, Runtime.RunError | Runtime.DenoCommandInputInvalid, Runtime.Runtime>
  >
>;
Transpile.transpileToDirectory({ files: ["main.ts"], outdir: "dist" });
Transpile.emitDeclarations({ files: ["main.ts"], outdir: "types" });
// @ts-expect-error!
Transpile.transpileToDirectory({ files: [], outdir: "dist" });

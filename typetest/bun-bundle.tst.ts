import type { Effect, Scope } from "effect";
import * as ApiBuild from "../packages/effect-build-bun/src/Api/Build.js";
import * as ApiCompile from "../packages/effect-build-bun/src/Api/CompileExecutable.js";
import * as Transpiler from "../packages/effect-build-bun/src/Api/Transpiler.js";
import * as CommandBuild from "../packages/effect-build-bun/src/Command/Build.js";
import * as Watch from "../packages/effect-build-bun/src/Command/Watch.js";
import * as Runtime from "../packages/effect-build-bun/src/internal/Runtime.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const memory = ApiBuild.build({ entrypoints: ["main.ts"], target: "bun" });
export type _Memory = Assert<
  Same<
    typeof memory,
    Effect.Effect<ApiBuild.Output, ApiBuild.BunApiFailed | ApiBuild.BunBuildModeInvalid, ApiBuild.Build>
  >
>;

const direct = ApiBuild.buildToDirectory({ entrypoints: ["main.ts"], outdir: "dist" });
export type _Direct = Assert<
  Same<
    typeof direct,
    Effect.Effect<ApiBuild.Output, ApiBuild.BunApiFailed | ApiBuild.BunBuildModeInvalid, ApiBuild.Build>
  >
>;

// @ts-expect-error!
ApiBuild.build({ entrypoints: ["main.ts"], outdir: "dist" });
// @ts-expect-error!
ApiBuild.buildToDirectory({ entrypoints: ["main.ts"] });

ApiCompile.compileExecutableDirect({
  entrypoints: ["main.ts"],
  compile: { outfile: "app" },
});
// @ts-expect-error!
ApiCompile.compileExecutableDirect({ entrypoints: ["main.ts"], compile: false });

const made = Transpiler.make({ loader: "ts" });
export type _Transpiler = Assert<
  Same<typeof made, Effect.Effect<Transpiler.Transpiler, Transpiler.BunApiFailed, Transpiler.Factory>>
>;
declare const transpiler: Transpiler.Transpiler;
export type _Transform = Assert<
  Same<
    ReturnType<typeof Transpiler.transform>,
    Effect.Effect<string, Transpiler.BunApiFailed>
  >
>;
Transpiler.transform(transpiler, "const value: number = 1", "ts");
Transpiler.transformSync(transpiler, "const value: number = 1", "ts");
Transpiler.transformSync(transpiler, "const value = ctx.value", { value: 1 });
Transpiler.transformSync(transpiler, "const value = ctx.value", "js", { value: 1 });
Transpiler.scan(transpiler, "export const value = 1");
Transpiler.scanImports(transpiler, 'import value from "value"');
// @ts-expect-error!
Transpiler.transform(transpiler, "const value = 1", "not-a-loader");

const stdout = CommandBuild.build({ entrypoint: "main.ts", sourcemap: "inline" });
export type _CommandStdout = Assert<
  Same<
    typeof stdout,
    Effect.Effect<
      CommandBuild.BuildResult,
      Runtime.RunError | Runtime.BunCommandInputInvalid,
      Runtime.Runtime
    >
  >
>;

CommandBuild.buildToDirectory({ entrypoints: ["main.ts"], outdir: "dist", splitting: true });
// @ts-expect-error!
CommandBuild.build({ entrypoint: "main.ts", splitting: true });

const watched = Watch.watch({ entrypoints: ["main.ts"], outdir: "dist" });
export type _Watch = Assert<
  Same<
    typeof watched,
    Effect.Effect<
      Watch.Watch,
      Runtime.WatchError | Runtime.BunCommandInputInvalid,
      Runtime.Runtime | Scope.Scope
    >
  >
>;

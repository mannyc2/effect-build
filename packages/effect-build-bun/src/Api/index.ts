import { Layer } from "effect";
import * as Build from "./Build.js";
import * as CompileExecutable from "./CompileExecutable.js";
import * as Transpiler from "./Transpiler.js";

export * as Build from "./Build.js";
export * as CompileExecutable from "./CompileExecutable.js";
export * as Transpiler from "./Transpiler.js";

export const layer = Layer.mergeAll(Build.layer, CompileExecutable.layer, Transpiler.layer);

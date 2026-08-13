import { Effect } from "effect";
import fs from "node:fs";
import path from "path";
import { localValue } from "./local.js";

const dynamic = await import("./dynamic.js");
console.log(Effect.succeed(localValue + dynamic.dynamicValue), path.sep, typeof fs.readFile);

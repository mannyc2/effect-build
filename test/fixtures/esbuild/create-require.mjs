import { createRequire } from "node:module";

const dependency = "./local.cjs";
const load = createRequire(import.meta.url);
load(dependency);

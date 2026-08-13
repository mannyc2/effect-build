import { getAsset } from "node:sea";

process.stdout.write(`esm:${getAsset("message", "utf8")}\n`);

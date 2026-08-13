const { getAsset } = require("node:sea");

process.stdout.write(`cjs:${getAsset("message", "utf8")}\n`);

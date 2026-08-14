const fs = require("node:fs");
const path = require("path");
const { localValue } = require("./local.cjs");

console.log(localValue, path.sep, typeof fs.readFile);

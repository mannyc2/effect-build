import assert from "node:assert/strict";
import test from "node:test";
import { isDeclarationFile, isSelfContainedDeclarationOutput } from "./declaration-classifier.mjs";

test("classifies compound .d.ts suffixes instead of Path.extname output", () => {
  assert.equal(isDeclarationFile("index.d.ts"), true);
  assert.equal(isDeclarationFile("index.ts"), false);
  assert.equal(isDeclarationFile("index.d.ts.map"), false);
});

test("recognizes one self-contained declaration file", () => {
  assert.equal(isSelfContainedDeclarationOutput({
    files: [{ path: "index.d.ts", extension: ".ts" }],
    unresolvedImports: [],
  }), true);
  assert.equal(isSelfContainedDeclarationOutput({
    files: [{ path: "index.d.ts", extension: ".ts" }],
    unresolvedImports: [{ path: "index.d.ts", specifier: "./missing.ts" }],
  }), false);
});

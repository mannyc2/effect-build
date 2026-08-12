import { access } from "node:fs/promises";
import { readTooling } from "./read-tooling.mjs";

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(process.argv[index], process.argv[index + 1]);
}

const { pins } = await readTooling();
for (const [flag, tool] of [["--bun", "bun"], ["--deno", "deno"], ["--denort", "denort"]]) {
  const executable = argumentsByName.get(flag);
  if (executable === undefined) throw new Error(`${flag} is required`);
  if (!pins.tools.some((entry) => entry.tool === tool)) throw new Error(`missing ${tool} pin`);
  await access(executable);
}

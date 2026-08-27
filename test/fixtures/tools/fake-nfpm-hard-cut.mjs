#!/usr/bin/env bun
import { writeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const stdout = (text) => writeSync(1, text);
const stderr = (text) => writeSync(2, text);

if (process.env.FAKE_NFPM_LOG) {
  const configIndex = argv.indexOf("--config");
  const configuration = configIndex === -1
    ? undefined
    : JSON.parse(await readFile(argv[configIndex + 1], "utf8"));
  await mkdir(dirname(process.env.FAKE_NFPM_LOG), { recursive: true });
  await writeFile(
    process.env.FAKE_NFPM_LOG,
    `${JSON.stringify({ argv, cwd: process.cwd(), marker: process.env.FAKE_PROJECT_MARKER ?? "", configuration })}\n`,
    { flag: "a" },
  );
}

if (argv.length === 1 && argv[0] === "--version") {
  stdout(`nfpm version ${process.env.FAKE_NFPM_VERSION ?? "2.47.0"}\n`);
  process.exit(0);
}

if (process.env.FAKE_NFPM_MODE === "fail") {
  stdout("native nfpm stdout");
  stderr("native nfpm stderr");
  process.exit(19);
}

const targetIndex = argv.indexOf("--target");
const packagerIndex = argv.indexOf("--packager");
const configIndex = argv.indexOf("--config");
const target = targetIndex === -1 ? undefined : argv[targetIndex + 1];
if (!target) {
  stderr("missing --target");
  process.exit(20);
}

if (process.env.FAKE_NFPM_MODE !== "missing") {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    `nfpm:${argv[packagerIndex + 1]}:${argv[configIndex + 1]}\n`,
  );
}

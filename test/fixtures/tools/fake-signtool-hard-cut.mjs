#!/usr/bin/env bun
import { writeSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const stdout = (text) => writeSync(1, text);
const stderr = (text) => writeSync(2, text);

if (process.env.FAKE_SIGNTOOL_LOG) {
  await mkdir(dirname(process.env.FAKE_SIGNTOOL_LOG), { recursive: true });
  await writeFile(
    process.env.FAKE_SIGNTOOL_LOG,
    `${JSON.stringify({ argv, cwd: process.cwd(), marker: process.env.FAKE_PROJECT_MARKER ?? "" })}\n`,
    { flag: "a" },
  );
}

if (argv.length === 1 && argv[0] === "/?") {
  const separator = process.env.FAKE_SIGNTOOL_VERSION_COLON === "1" ? ": " : " ";
  stdout(`Microsoft (R) File Signing Tool\nVersion${separator}${process.env.FAKE_SIGNTOOL_VERSION ?? "10.0.26100.0"}\n`);
  process.exit(0);
}

const file = argv.at(-1);
if (!file) {
  stderr("missing file");
  process.exit(29);
}

if (argv[0] === "sign") {
  if (process.env.FAKE_SIGNTOOL_MODE === "fail" || process.env.FAKE_SIGNTOOL_MODE === "fail-secret") {
    stdout("native signtool stdout");
    stderr(
      process.env.FAKE_SIGNTOOL_MODE === "fail-secret"
        ? `native signtool invocation: ${argv.join(" ")}`
        : "native signtool stderr",
    );
    process.exit(31);
  }
  if (process.env.FAKE_SIGNTOOL_MODE === "timestamp-warning") {
    await appendFile(file, "AUTHENTICODE-SHA256\n");
  } else if (process.env.FAKE_SIGNTOOL_MODE !== "unsigned") {
    await appendFile(file, "AUTHENTICODE-SHA256-RFC3161\n");
  }
  process.exit(0);
}

if (argv[0] === "verify") {
  if (process.env.FAKE_SIGNTOOL_MODE === "verify-fail") {
    stderr("native verify stderr");
    process.exit(32);
  }
  const contents = await readFile(file, "utf8");
  if (argv.includes("/tw") && contents.includes("AUTHENTICODE-SHA256") && !contents.includes("RFC3161")) {
    stderr("signature is not timestamped");
    process.exit(2);
  }
  if (!contents.includes("AUTHENTICODE-SHA256-RFC3161")) {
    stderr("signature or timestamp missing");
    process.exit(33);
  }
  stdout("Successfully verified: Authenticode RFC3161 timestamp\n");
  process.exit(0);
}

stderr("unknown command");
process.exit(34);

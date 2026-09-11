#!/usr/bin/env node
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Simulate successful blob preparation followed by loss of the separately resolved base.
if (process.argv[2] === "--experimental-sea-config") {
  const config = JSON.parse(await readFile(process.argv[3], "utf8"));
  await writeFile(config.output, "prepared blob");
  await unlink(join(process.cwd(), "base"));
}

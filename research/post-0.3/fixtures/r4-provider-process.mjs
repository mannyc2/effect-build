import { spawn } from "node:child_process";
import { mkdir, open, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const outputRoot = resolve(process.argv[2] ?? "");
if (outputRoot.length === 0) throw new Error("output root is required");

await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, "complete-output.bin"), Buffer.alloc(256 * 1024, 0x63));
const partial = await open(join(outputRoot, "partial-output.bin"), "w");
await partial.write(Buffer.alloc(32 * 1024, 0x70));
await partial.sync();
await partial.close();

const descendant = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)"],
  { stdio: "ignore" },
);
await writeFile(
  join(outputRoot, "ready.json"),
  `${JSON.stringify({ parentPid: process.pid, descendantPid: descendant.pid })}\n`,
);

process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);

import { execFile, spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForExit = (child) => new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
});
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`timed out waiting for ${label}`);
};

assert(process.platform === "win32", "Windows candidate gate must run on Windows");
const root = await mkdtemp(join(tmpdir(), "effect-build-plan044-windows-"));
try {
  const destination = join(root, "candidate.exe");
  await copyFile(process.execPath, destination);
  const child = spawn(
    destination,
    ["-e", [
      'const { spawn } = require("node:child_process");',
      'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
      "process.stdout.write(JSON.stringify({ parent: process.pid, descendant: descendant.pid }) + \"\\n\");",
      "setInterval(() => {}, 1000);",
    ].join(" ")],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const ready = await new Promise((resolveReady, reject) => {
    let output = "";
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      try {
        resolveReady(JSON.parse(output.slice(0, newline)));
      } catch (error) {
        reject(error);
      }
    });
  });
  assert(Number.isSafeInteger(ready.parent) && Number.isSafeInteger(ready.descendant), "candidate child tree has invalid PIDs");

  let lockFailure;
  try {
    await rm(destination);
  } catch (error) {
    lockFailure = error;
  }
  assert(lockFailure !== undefined, "Windows removed an executing candidate image");
  assert(["EACCES", "EBUSY", "EPERM"].includes(lockFailure.code), "Windows lock used an unexpected error code");

  await execute("taskkill", ["/pid", String(ready.parent), "/t", "/f"]);
  await waitForExit(child);
  await waitFor(async () => {
    try {
      process.kill(ready.descendant, 0);
      return false;
    } catch {
      return true;
    }
  }, "descendant termination");
  await rm(destination);
  process.stdout.write(`${JSON.stringify({
    destinationLock: lockFailure.code,
    descendantTerminated: true,
  })}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}

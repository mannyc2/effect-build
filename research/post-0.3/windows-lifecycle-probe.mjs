import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdtemp,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { conclusion, infrastructure, writeReceipt } from "./receipt.mjs";
import { assertion } from "./probe-runtime.mjs";

infrastructure(process.platform === "win32", "Windows lifecycle probe must run on Windows");
const sourceSha = process.env.SOURCE_SHA;
infrastructure(typeof sourceSha === "string" && /^[0-9a-f]{40}$/.test(sourceSha), "SOURCE_SHA is missing");

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const waitForExit = (child) => new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
});

const root = await mkdtemp(join(tmpdir(), "effect-build-windows-lifecycle-"));
try {
  const lockedExecutable = join(root, "locked-node.exe");
  await copyFile(process.execPath, lockedExecutable);
  const child = spawn(
    lockedExecutable,
    ["-e", "process.stdout.write('ready\\n'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const ready = new Promise((resolveReady, reject) => {
    child.once("error", reject);
    child.stdout.once("data", () => resolveReady());
  });
  await ready;
  let lockedFailure;
  try {
    await rm(lockedExecutable);
  } catch (error) {
    lockedFailure = {
      code: error?.code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  conclusion(lockedFailure !== undefined, "Windows removed a currently executing image unexpectedly");
  conclusion(
    ["EPERM", "EBUSY", "EACCES"].includes(lockedFailure.code),
    `Windows executable lock used unexpected code ${lockedFailure.code}`,
  );
  child.kill("SIGTERM");
  const exit = await waitForExit(child);
  await rm(lockedExecutable);
  let existsAfterExit = true;
  try {
    await access(lockedExecutable);
  } catch {
    existsAfterExit = false;
  }
  conclusion(existsAfterExit === false, "Windows locked executable was not removable after process exit");

  const destination = join(root, "published.txt");
  const staged = join(root, "staged.txt");
  await writeFile(destination, "old");
  await writeFile(staged, "new");
  await rename(staged, destination);
  conclusion((await stat(destination)).isFile(), "Windows same-parent replacement produced no destination");

  const normalize = (value) => value.replaceAll("\\", "/").split("/").filter((part) => part && part !== ".").join("/");
  const portable = normalize("nested\\file.txt");
  conclusion(portable === "nested/file.txt", "Windows portable separator normalization changed");
  const caseFolded = ["A.txt", "a.txt"].map((value) => normalize(value).toLowerCase());
  conclusion(new Set(caseFolded).size === 1, "Windows case-fold collision fixture did not collide");

  await writeReceipt({
    id: "windows-lifecycle",
    sourceSha,
    claims: [{
      id: "windows-lock-and-cleanup",
      classification: "established",
      conclusion: "windows-running-executable-locks-fail-before-cleanup-and-release-after-exit-while-same-parent-replacement-and-portable-normalization-remain-explicit",
      assertions: [
        assertion("running-executable-removal-fails-with-lock-code"),
        assertion("locked-executable-removable-after-exit"),
        assertion("same-parent-file-replacement"),
        assertion("backslash-portable-normalization"),
        assertion("case-fold-collision-detected"),
      ],
    }],
    evidence: {
      executable: basename(lockedExecutable),
      lockedFailure,
      exit,
      removableAfterExit: true,
      sameParentReplacement: true,
      portableNormalization: portable,
      caseFoldedCollision: caseFolded,
    },
  });
} finally {
  await rm(root, { recursive: true, force: true });
}

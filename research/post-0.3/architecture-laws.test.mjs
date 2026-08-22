import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  acquireProgramScoped,
  assessCompatibility,
  makeToolObservation,
  ToolVersionUnsupported,
  validateLifecycleTrace,
  verifyBorrowedFile,
  withProgramDouble,
  withProgramFileEffect,
  withProgramSingle,
} from "./architecture-laws.mjs";

const missing = async (path) => {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
};

test("strict and override compatibility modes are explicit", () => {
  assert.deepEqual(
    assessCompatibility({
      tool: "bun",
      observed: "1.3.9",
      tested: { min: "1.3.9", max: "1.3.14" },
      requiredCapabilities: ["build", "compile"],
      observedCapabilities: ["build", "compile"],
    }),
    { compatibility: "tested", observed: "1.3.9", warning: undefined },
  );
  assert.throws(
    () => assessCompatibility({
      tool: "bun",
      observed: "1.4.0",
      tested: { min: "1.3.9", max: "1.3.14" },
    }),
    ToolVersionUnsupported,
  );
  const override = assessCompatibility({
    tool: "bun",
    observed: "1.4.0",
    tested: { min: "1.3.9", max: "1.3.14" },
    allowUntestedVersion: true,
  });
  assert.equal(override.compatibility, "untested-override");
  assert.equal(override.warning._tag, "ToolVersionUntestedOverride");
  assert.deepEqual(
    makeToolObservation({
      name: "bun",
      version: override.observed,
      path: "/tool/bun",
      compatibility: override.compatibility,
    }),
    { name: "bun", version: "1.4.0", path: "/tool/bun", compatibility: "untested-override" },
  );
});

test("known-incompatible versions and missing capabilities cannot be overridden", () => {
  assert.throws(
    () => assessCompatibility({
      tool: "deno",
      observed: "2.8.0",
      tested: { min: "2.9.0", max: "2.9.3" },
      knownIncompatible: ["2.8.0"],
      allowUntestedVersion: true,
    }),
    (error) => error instanceof ToolVersionUnsupported && error.overrideAvailable === false,
  );
  assert.throws(
    () => assessCompatibility({
      tool: "node",
      observed: "26.7.0",
      tested: { min: "25.5.0", max: "26.7.0" },
      requiredCapabilities: ["build-sea"],
      observedCapabilities: [],
      allowUntestedVersion: true,
    }),
    (error) => error instanceof ToolVersionUnsupported && error.missingCapabilities.includes("build-sea"),
  );
});

test("the single continuation preserves cleanup, mutation detection, and exact failure identity", async () => {
  let escapedPath;
  const failure = new Error("caller-failure");
  await assert.rejects(
    withProgramSingle("console.log('ok')\n", async (program) => {
      escapedPath = program.file.path;
      await verifyBorrowedFile(program.file);
      await writeFile(program.file.path, "console.log('changed')\n");
      await assert.rejects(verifyBorrowedFile(program.file), /changed/);
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal(await missing(escapedPath), true);
});

test("the nested continuation cannot prevent raw path escape beyond what cleanup already enforces", async () => {
  let escapedPath;
  let escapedHandle;
  await withProgramDouble("console.log('ok')\n", async (program) => {
    escapedHandle = program;
    await program.withFile(async (file) => {
      escapedPath = file.path;
      assert.match(await readFile(file.path, "utf8"), /ok/);
    });
  });
  assert.equal(await missing(escapedPath), true);
  await assert.rejects(escapedHandle.withFile(async () => undefined), { name: "BorrowedProgramExpired" });
});

test("one continuation plus an Effect-like file acquisition retains typed expiry without a second callback", async () => {
  let escapedHandle;
  let escapedPath;
  await withProgramFileEffect("console.log('ok')\n", async (program) => {
    escapedHandle = program;
    const file = await program.file();
    escapedPath = file.path;
    assert.match(await readFile(file.path, "utf8"), /ok/);
  });
  assert.equal(await missing(escapedPath), true);
  await assert.rejects(escapedHandle.file(), { name: "BorrowedProgramExpired" });
});

test("an ordinary scoped handle admits raw value escape, so Scope alone is not linear ownership", async () => {
  const acquired = await acquireProgramScoped("console.log('ok')\n");
  const escapedPath = acquired.program.file.path;
  await acquired.release();
  await acquired.release();
  assert.equal(await missing(escapedPath), true);
});

test("lifecycle families reject impossible ownership transitions", () => {
  assert.equal(
    validateLifecycleTrace("oneShotHost", ["requested", "validated", "started", "output-observed"]),
    true,
  );
  assert.equal(
    validateLifecycleTrace("oneShotHost", ["requested", "validated", "started", "publication-committed"]),
    false,
  );
  assert.equal(
    validateLifecycleTrace("durableSingleFile", [
      "requested",
      "validated",
      "tool-selected",
      "started",
      "output-observed",
      "publication-committed",
    ]),
    true,
  );
  assert.equal(
    validateLifecycleTrace("durableSingleFile", [
      "requested",
      "validated",
      "tool-selected",
      "started",
      "publication-committed",
      "failed-before-commit",
    ]),
    false,
  );
  assert.equal(
    validateLifecycleTrace("providerDirectWrite", [
      "requested",
      "validated",
      "started",
      "failed-after-durable-outcome",
    ]),
    true,
  );
  assert.equal(
    validateLifecycleTrace("commandWatch", [
      "requested",
      "validated",
      "tool-selected",
      "started",
      "ready",
      "rebuild",
      "ready",
      "cancellation-requested",
      "released",
    ]),
    true,
  );
});

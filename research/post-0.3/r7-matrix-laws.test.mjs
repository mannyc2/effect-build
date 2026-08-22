import assert from "node:assert/strict";
import test from "node:test";
import { executeMatrixLawSuite, MatrixInterrupted, runCompileExecutableMatrix } from "./r7-matrix-laws.mjs";

test("Bun and Deno matrix reports independently committed scalar outcomes in input order", async () => {
  const result = await executeMatrixLawSuite();
  for (const provider of ["bun", "deno"]) {
    const observation = result[provider];
    assert.deepEqual(observation.deterministicCellIds, [
      `${provider}:compileExecutable:0`,
      `${provider}:compileExecutable:1`,
      `${provider}:compileExecutable:2`,
      `${provider}:compileExecutable:3`,
    ]);
    assert.deepEqual(observation.orderedTags, ["Success", "Failure", "Success", "Failure"]);
    assert.deepEqual(observation.calls, { 0: 1, 1: 1, 2: 1, 3: 1 });
    assert.equal(observation.maximumActive, 2);
    assert.deepEqual(observation.durable.toSorted(), [`${provider}-zero`, `${provider}-two`].toSorted());
    assert.equal(observation.rollback, "none");
  }
});

test("caller interruption remains Cause and leaves committed cells without starting queued cells", async () => {
  const result = await executeMatrixLawSuite();
  for (const provider of ["bun", "deno"]) {
    const observation = result[provider].interruption;
    assert.equal(observation.cause, "MatrixInterrupted");
    assert.deepEqual(observation.starts, [0, 1]);
    assert.deepEqual(observation.durable, [`${provider}-committed`]);
  }
});

test("defects reject the matrix instead of becoming cell failures", async () => {
  const defect = new Error("defect");
  await assert.rejects(
    runCompileExecutableMatrix({
      provider: "bun",
      inputs: ["input"],
      concurrency: 1,
      compile: () => Promise.reject(defect),
    }),
    (error) => error === defect,
  );
});

test("an already interrupted invocation starts no scalar work", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    runCompileExecutableMatrix({
      provider: "deno",
      inputs: ["input"],
      concurrency: 1,
      signal: controller.signal,
      compile: async () => {
        calls += 1;
        return { _tag: "Success", artifact: { path: "unreachable" } };
      },
    }),
    MatrixInterrupted,
  );
  assert.equal(calls, 0);
});

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";

const moduleUrl = pathToFileURL(new URL("./architecture-laws.mjs", import.meta.url).pathname);
const producerCopy = await import(`${moduleUrl.href}?copy=producer`);
const consumerCopy = await import(`${moduleUrl.href}?copy=consumer`);

test("closure-owned borrowed authority crosses compatible duplicate module copies", async () => {
  let escaped;
  await producerCopy.withProgramFileEffect("console.log('duplicate-core')\n", async (program) => {
    escaped = program;
    const file = await program.file();
    const verifiedByOtherCopy = await consumerCopy.verifyBorrowedFile(file);
    assert.equal(verifiedByOtherCopy.digest, file.digest);
  });
  await assert.rejects(escaped.file(), { name: "BorrowedProgramExpired" });
});

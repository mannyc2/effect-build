import assert from "node:assert/strict";
import test from "node:test";
import { classifyCertificationHost } from "./certification-host.mjs";

test("classifies exactly the five D13 construction and certification hosts", () => {
  assert.equal(classifyCertificationHost({ platform: "linux", architecture: "x64", libc: "glibc" }), "linux-x64");
  assert.equal(classifyCertificationHost({ platform: "linux", architecture: "arm64", libc: "glibc" }), "linux-arm64");
  assert.equal(classifyCertificationHost({ platform: "darwin", architecture: "arm64", libc: "not-applicable" }), "macos-arm64");
  assert.equal(classifyCertificationHost({ platform: "darwin", architecture: "x64", libc: "not-applicable" }), "macos-x64");
  assert.equal(classifyCertificationHost({ platform: "win32", architecture: "x64", libc: "not-applicable" }), "windows-x64");
});

test("rejects unsupported hosts instead of counting them as a pass", () => {
  assert.throws(
    () => classifyCertificationHost({ platform: "win32", architecture: "arm64", libc: "not-applicable" }),
    /outside the D13 host set/u,
  );
  assert.throws(
    () => classifyCertificationHost({ platform: "linux", architecture: "x64", libc: "unknown" }),
    /outside the D13 host set/u,
  );
});

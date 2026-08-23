import { Schema } from "effect";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const decodeAbsolutePath = Schema.decodeUnknownSync(AbsolutePath);

describe("v0.4 Artifact.AbsolutePath", () => {
  it.each([
    "/",
    "/work/output",
    "/work/output.exe",
    "/work/output/",
    "C:\\",
    "C:\\work\\output.exe",
    "C:\\work\\output\\",
    "\\\\server\\share\\",
    "\\\\server\\share\\output.exe",
    "\\\\server\\share\\output\\",
    "\\\\?\\C:\\work\\output.exe",
    "\\\\?\\UNC\\server\\share",
    "\\\\?\\UNC\\server\\share\\output.exe",
    "\\\\?\\Volume{01234567-89ab-cdef-0123-456789abcdef}\\",
    "\\\\?\\Volume{01234567-89ab-cdef-0123-456789abcdef}\\tool.exe",
    "\\\\.\\C:\\tool.exe",
    "\\\\.\\Volume{01234567-89ab-cdef-0123-456789abcdef}\\tool.exe",
  ])("accepts a normalized absolute path: %s", (value) => {
    expect(decodeAbsolutePath(value)).toBe(value);
    expect(
      [path.posix, path.win32].some((implementation) =>
        implementation.isAbsolute(value) && implementation.normalize(value) === value
      ),
    ).toBe(true);
  });

  it.each([
    "",
    ".",
    "output",
    "work/output",
    "/work/../output",
    "/work/./output",
    "/work//output",
    "C:output.exe",
    "c:/work/output.exe",
    "C:\\work\\..\\output.exe",
    "C:\\work\\\\output.exe",
    "C:\\work/output.exe",
    "\\\\server\\share",
    "\\\\.\\pipe\\output",
    "\\\\.\\PhysicalDrive0",
    "\\\\?\\Volume{not-a-guid}\\tool.exe",
    "//server/share/output.exe",
    "/work/\0output.exe",
  ])("rejects a path outside the frozen grammar: %s", (path) => {
    expect(() => decodeAbsolutePath(path)).toThrow();
  });
});

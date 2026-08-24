import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { toPlatformMetadataPath } from "../../packages/effect-build-bun/src/internal/MetadataPath.js";

describe("Bun metadata paths", () => {
  it("normalizes exact Windows drive spellings without resolving them against the current drive", () => {
    expect(toPlatformMetadataPath(win32, String.raw`C:\Users\runner\entry.ts`))
      .toBe(String.raw`C:\Users\runner\entry.ts`);
    expect(toPlatformMetadataPath(win32, String.raw`\C:\Users\runner\entry.ts`))
      .toBe(String.raw`C:\Users\runner\entry.ts`);
    expect(toPlatformMetadataPath(win32, "/C:/Users/runner/entry.ts"))
      .toBe("C:/Users/runner/entry.ts");
  });

  it("retains ordinary absolute paths and resolves relative metadata paths", () => {
    expect(toPlatformMetadataPath(posix, "/tmp/entry.ts")).toBe("/tmp/entry.ts");
    expect(toPlatformMetadataPath(posix, "src/entry.ts")).toBe(posix.resolve("src/entry.ts"));
  });
});

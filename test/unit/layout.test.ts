import * as Layout from "effect-build/Layout";
import { describe, expect, it } from "vitest";

describe("portable shipping layouts", () => {
  it("accepts a shared directory before or after its children", () => {
    const entries: readonly Layout.Entry[] = [
      { path: "docs", kind: "directory" },
      { path: "docs/a", kind: "file" },
      { path: "docs/b", kind: "symlink" },
    ];
    expect(Layout.validate(entries)).toBeUndefined();
    expect(Layout.validate([...entries].reverse())).toBeUndefined();
  });

  it.each(
    [
      ["duplicate", [{ path: "a", kind: "file" }, { path: "a", kind: "directory" }]],
      ["file ancestor", [{ path: "a", kind: "file" }, { path: "a/b", kind: "file" }]],
      ["symlink ancestor", [{ path: "a", kind: "symlink" }, { path: "a/b", kind: "file" }]],
      ["implicit directory spelling", [{ path: "Docs/a", kind: "file" }, { path: "docs/b", kind: "file" }]],
      ["explicit directory spelling", [{ path: "Docs", kind: "directory" }, { path: "docs/b", kind: "file" }]],
      ["Unicode directory spelling", [{ path: "café/a", kind: "file" }, { path: "cafe\u0301/b", kind: "file" }]],
    ] satisfies readonly [string, readonly Layout.Entry[]][],
  )("rejects %s in either input order", (_label, entries) => {
    expect(Layout.validate(entries)).toBeDefined();
    expect(Layout.validate([...entries].reverse())).toBeDefined();
  });
});

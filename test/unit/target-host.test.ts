import { Target } from "effect-build";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
describe("host ABI evidence", () => {
  it.each([
    [{ header: { glibcVersionRuntime: "2.41" }, sharedObjects: [] }, "linux-x64"],
    [{ header: {}, sharedObjects: ["/lib/ld-musl-x86_64.so.1"] }, "linux-x64-musl"],
    [{ header: {}, sharedObjects: [] }, undefined],
  ] as const)("reports only an ABI established by the runtime report", (report, expected) => {
    vi.stubGlobal("process", { platform: "linux", arch: "x64", report: { getReport: () => report } });
    expect(Target.host()).toBe(expected);
  });
  it("does not guess glibc when reports are unavailable", () => {
    vi.stubGlobal("process", { platform: "linux", arch: "arm64" });
    expect(Target.host()).toBeUndefined();
  });
});

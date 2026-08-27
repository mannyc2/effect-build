import { describe, expect, it } from "vitest";

const expected = process.env.EFFECT_BUILD_EXPECTED_HOST_RUNTIME;

describe.skipIf(expected === undefined)("provider-native host runtime coordinate", () => {
  it("executes inside the exact runtime named by the compatibility cell", () => {
    if (expected === "bun@1.3.14") {
      const bun = Reflect.get(globalThis, "Bun") as { readonly version?: unknown } | undefined;
      expect(bun?.version).toBe("1.3.14");
      expect(process.execPath.toLowerCase()).toContain("bun");
      return;
    }
    if (expected === "node@24.14.1") {
      expect(Reflect.has(globalThis, "Bun")).toBe(false);
      expect(process.version).toBe("v24.14.1");
      return;
    }
    throw new Error(`unsupported provider-native host runtime expectation: ${expected}`);
  });
});

import { describe, expect, it } from "vitest";

// @ts-expect-error The terminal observation helper is an intentionally unprotected Node script module.
import { finalizeAfterTerminalObservation } from "../../scripts/release/terminal-observation.mjs";

describe("terminal release observation", () => {
  it("returns only after semantic validation and one fresh terminal observation", async () => {
    const order: Array<string> = [];
    const result = await finalizeAfterTerminalObservation({
      validate: async () => {
        order.push("validate-start");
        await Promise.resolve();
        order.push("validate-end");
        return Object.freeze({ verdict: "success" });
      },
      observe: async () => {
        order.push("terminal-observation");
      },
    });
    expect(result).toEqual({ verdict: "success" });
    expect(order).toEqual(["validate-start", "validate-end", "terminal-observation"]);
  });

  it("rejects when main advances during semantic or Sigstore validation", async () => {
    let currentMain = "a".repeat(40);
    const releasePoint = currentMain;
    await expect(finalizeAfterTerminalObservation({
      validate: async () => {
        currentMain = "b".repeat(40);
        return { verdict: "must-not-escape" };
      },
      observe: async () => {
        if (currentMain !== releasePoint) throw new Error("main advanced during semantic validation");
      },
    })).rejects.toThrow("main advanced");
  });

  it("rejects before validation when either required capability is absent", async () => {
    await expect(finalizeAfterTerminalObservation({ validate: undefined, observe: async () => {} }))
      .rejects.toThrow("capabilities");
    await expect(finalizeAfterTerminalObservation({ validate: async () => ({}), observe: undefined }))
      .rejects.toThrow("capabilities");
  });
});

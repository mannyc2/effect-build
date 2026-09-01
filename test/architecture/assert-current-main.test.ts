import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The current-main admission helper is an intentionally unprotected Node script module.
import { assertCurrentMain } from "../../scripts/release/assert-current-main.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const sourceSha = "a".repeat(40);

describe("authenticated current-main admission", () => {
  it("uses exactly the repository-scoped ref endpoint and admits one full source SHA", async () => {
    const github = {
      readJson: vi.fn(async () => ({
        ref: "refs/heads/main",
        object: { type: "commit", sha: sourceSha },
      })),
    };
    await expect(assertCurrentMain({
      contract,
      repository: "mannyc2/effect-build",
      sourceSha,
      github,
    })).resolves.toMatchObject({ object: { sha: sourceSha } });
    expect(github.readJson).toHaveBeenCalledOnce();
    expect(github.readJson).toHaveBeenCalledWith("repos/mannyc2/effect-build/git/ref/heads/main");
  });

  it.each([
    ["wrong source", { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } }],
    ["symbolic object", { ref: "refs/heads/main", object: { type: "tag", sha: sourceSha } }],
    ["wrong ref", { ref: "refs/heads/release", object: { type: "commit", sha: sourceSha } }],
  ])("rejects %s", async (_label, observation) => {
    await expect(assertCurrentMain({
      contract,
      repository: "mannyc2/effect-build",
      sourceSha,
      github: { readJson: async () => observation },
    })).rejects.toThrow("authenticated current main");
  });

  it("rejects a self-consistent caller repository mutation before the endpoint is used", async () => {
    const github = { readJson: vi.fn() };
    await expect(assertCurrentMain({
      contract,
      repository: "attacker/effect-build",
      sourceSha,
      github,
    })).rejects.toThrow();
    expect(github.readJson).not.toHaveBeenCalled();
  });
});

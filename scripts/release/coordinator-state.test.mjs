import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyGithub, coordinate, nextAction, registryPrefix } from "./coordinator-state.mjs";
import { releaseControl } from "../node-finalizer/common.mjs";

const absentAssets = () => Array.from({ length: 9 }, () => "Absent");
const equivalentAssets = () => Array.from({ length: 9 }, () => "Equivalent");

test("registry convergence admits only one contiguous equivalent prefix", () => {
  assert.deepEqual(registryPrefix(["Equivalent", "Equivalent", "Absent"]), { _tag: "Prefix", length: 2 });
  assert.equal(registryPrefix(["Absent", "Equivalent"])._tag, "Conflict");
  assert.equal(registryPrefix(["Unknown", "Absent"])._tag, "Unknown");
});

test("GitHub phase classification is fail-closed", () => {
  assert.equal(classifyGithub({
    tag: "Absent",
    release: "Absent",
    releasePhase: "absent",
    escrow: "Absent",
    finalAssets: absentAssets(),
  }), "TagAbsent");
  assert.equal(classifyGithub({
    tag: "Equivalent",
    release: "Equivalent",
    releasePhase: "draft",
    escrow: "Equivalent",
    finalAssets: equivalentAssets(),
  }), "DraftEquivalentEscrowAndFinalAssetsComplete");
  assert.equal(classifyGithub({
    tag: "Equivalent",
    release: "Equivalent",
    releasePhase: "public",
    escrow: "Equivalent",
    finalAssets: equivalentAssets(),
  }), "Conflict");
});

test("the coordinator performs one mutation at a time and converges after response loss", async () => {
  const state = {
    github: {
      tag: "Absent",
      release: "Absent",
      releasePhase: "absent",
      escrow: "Absent",
      finalAssets: absentAssets(),
    },
    registry: Array.from({ length: releaseControl.orderedPackages.length }, () => "Absent"),
  };
  const mutations = [];
  let loseResponseAt = 3;
  const result = await coordinate({
    observe: async () => structuredClone(state),
    mutate: async (action) => {
      mutations.push(action);
      if (action.kind === "create-tag") state.github.tag = "Equivalent";
      else if (action.kind === "create-draft") {
        state.github.release = "Equivalent";
        state.github.releasePhase = "draft";
      } else if (action.kind === "upload-escrow") state.github.escrow = "Equivalent";
      else if (action.kind === "upload-final-asset") state.github.finalAssets[action.index] = "Equivalent";
      else if (action.kind === "publish-coordinate") {
        state.registry[action.index] = "Equivalent";
        if (action.index === loseResponseAt) {
          loseResponseAt = -1;
          throw new Error("simulated lost npm response");
        }
      } else if (action.kind === "delete-escrow") state.github.escrow = "Absent";
      else if (action.kind === "publish-draft") state.github.releasePhase = "public";
    },
  });
  assert.deepEqual(result, { _tag: "Complete" });
  assert.equal(
    mutations.filter(({ kind }) => kind === "publish-coordinate").length,
    releaseControl.orderedPackages.length,
  );
  assert.equal(mutations.at(-1).kind, "publish-draft");
});

test("the coordinator never crosses a gap, conflict, or unknown", () => {
  const github = {
    tag: "Equivalent",
    release: "Equivalent",
    releasePhase: "draft",
    escrow: "Equivalent",
    finalAssets: equivalentAssets(),
  };
  assert.deepEqual(nextAction({ github, registry: ["Absent", "Equivalent"] }), { _tag: "Stop", reason: "Conflict" });
  assert.deepEqual(nextAction({ github, registry: ["Unknown", "Absent"] }), { _tag: "Stop", reason: "Unknown" });
});

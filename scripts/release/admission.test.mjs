import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAdmission } from "./admission.mjs";
import { releaseControl } from "../node-finalizer/common.mjs";

const absent = Array.from({ length: releaseControl.orderedPackages.length }, () => "Absent");
const equivalent = Array.from({ length: releaseControl.orderedPackages.length }, () => "Equivalent");

test("initial admission is fresh, available, all-absent, and main-only", () => {
  assert.deepEqual(selectAdmission({
    expired: false,
    actionsArtifacts: "Available",
    githubCoordinatorState: "TagAbsent",
    registry: absent,
    origin: "initial-main-attempt-one",
  }), { _tag: "Admit", arm: "initial-staging" });
  assert.equal(selectAdmission({
    expired: true,
    actionsArtifacts: "Available",
    githubCoordinatorState: "TagAbsent",
    registry: absent,
    origin: "initial-main-attempt-one",
  })._tag, "Stop");
});

test("escrow admits only contiguous prefixes and ignores artifact expiry only at terminal proof", () => {
  assert.deepEqual(selectAdmission({
    expired: true,
    actionsArtifacts: "ExpiredOrDeleted",
    githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
    registry: ["Equivalent", "Equivalent", ...absent.slice(2)],
    origin: "recovery-tag-attempt-one",
  }), { _tag: "Admit", arm: "escrow-backed-npm-resumption" });
  assert.equal(selectAdmission({
    expired: true,
    actionsArtifacts: "Available",
    githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
    registry: ["Equivalent", "Absent", "Equivalent", ...absent.slice(3)],
    origin: "recovery-tag-attempt-one",
  })._tag, "Stop");
  assert.deepEqual(selectAdmission({
    expired: true,
    actionsArtifacts: "Unknown",
    githubCoordinatorState: "DraftEquivalentPublicAssetsComplete",
    registry: equivalent,
    origin: "recovery-tag-attempt-one",
  }), { _tag: "Admit", arm: "escrow-deleted-draft-github-finalization" });
});

test("pre-escrow recovery can only roll back with zero registry publications", () => {
  assert.deepEqual(selectAdmission({
    expired: true,
    actionsArtifacts: "Unknown",
    githubCoordinatorState: "DraftRollbackEligiblePartialStaging",
    registry: absent,
    origin: "recovery-tag-attempt-one",
  }), { _tag: "Admit", arm: "pre-escrow-staging-rollback" });
  assert.equal(selectAdmission({
    expired: true,
    actionsArtifacts: "Unknown",
    githubCoordinatorState: "DraftRollbackEligiblePartialStaging",
    registry: ["Equivalent", ...absent.slice(1)],
    origin: "recovery-tag-attempt-one",
  })._tag, "Stop");
});

import { registryPrefix } from "./coordinator-state.mjs";

const all = (records, state) => records.every((record) => record === state);

export const selectAdmission = ({
  expired,
  actionsArtifacts,
  githubCoordinatorState,
  registry,
  origin,
}) => {
  const prefix = registryPrefix(registry);
  if (prefix._tag === "Unknown") return { _tag: "Stop", reason: "Unknown" };
  if (prefix._tag === "Conflict") return { _tag: "Stop", reason: "Conflict" };
  const sevenAbsent = registry.length === 7 && all(registry, "Absent");
  const sevenEquivalent = registry.length === 7 && all(registry, "Equivalent");
  if (githubCoordinatorState === "TagAbsent") {
    return !expired && actionsArtifacts === "Available" && sevenAbsent && origin === "initial-main-attempt-one"
      ? { _tag: "Admit", arm: "initial-staging" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (["TagEquivalentReleaseAbsent", "DraftEquivalentEscrowAbsent"].includes(githubCoordinatorState)) {
    return actionsArtifacts === "Available" && sevenAbsent && origin === "same-attempt-continuous-lease"
      ? { _tag: "Admit", arm: "same-attempt-pre-escrow-staging-continuation" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (["TagRollbackEligible", "DraftRollbackEligibleEmpty", "DraftRollbackEligiblePartialStaging"].includes(
    githubCoordinatorState,
  )) {
    return sevenAbsent && origin === "recovery-tag-attempt-one"
      ? { _tag: "Admit", arm: "pre-escrow-staging-rollback" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubCoordinatorState === "DraftEquivalentEscrowCompleteFinalAssetsIncomplete") {
    if (!sevenAbsent) return { _tag: "Stop", reason: "Conflict" };
    if (actionsArtifacts === "Unknown") return { _tag: "Wait", arm: "escrow-bound-final-assets-wait" };
    return ["Available", "ExpiredOrDeleted"].includes(actionsArtifacts)
      ? { _tag: "Admit", arm: "escrow-bound-final-assets-continuation" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubCoordinatorState === "DraftEquivalentEscrowAndFinalAssetsComplete") {
    if (sevenEquivalent) return { _tag: "Admit", arm: "escrow-present-github-finalization" };
    if (prefix.length < 7 && ["Available", "ExpiredOrDeleted"].includes(actionsArtifacts)) {
      return { _tag: "Admit", arm: "escrow-backed-npm-resumption" };
    }
    return { _tag: "Stop", reason: actionsArtifacts === "Unknown" ? "Unknown" : "Conflict" };
  }
  if (githubCoordinatorState === "DraftEquivalentPublicAssetsComplete") {
    return sevenEquivalent
      ? { _tag: "Admit", arm: "escrow-deleted-draft-github-finalization" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubCoordinatorState === "Equivalent") {
    return sevenEquivalent
      ? { _tag: "Admit", arm: "already-public-observation-only-success" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  return { _tag: "Stop", reason: githubCoordinatorState === "Unknown" ? "Unknown" : "Conflict" };
};

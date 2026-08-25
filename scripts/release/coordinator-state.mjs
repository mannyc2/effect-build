export const observationStates = ["Absent", "Equivalent", "Conflict", "Unknown"];

const requireState = (value, subject) => {
  if (!observationStates.includes(value)) throw new Error(`invalid ${subject} observation ${value}`);
};

export const registryPrefix = (records) => {
  records.forEach((record, index) => requireState(record, `registry[${index}]`));
  if (records.includes("Unknown")) return { _tag: "Unknown" };
  if (records.includes("Conflict")) return { _tag: "Conflict" };
  const firstAbsent = records.indexOf("Absent");
  const length = firstAbsent < 0 ? records.length : firstAbsent;
  if (records.slice(length).some((state) => state !== "Absent")) return { _tag: "Conflict" };
  return { _tag: "Prefix", length };
};

export const classifyGithub = (observation) => {
  const subjects = [observation.tag, observation.release, observation.escrow, ...observation.finalAssets];
  subjects.forEach((state, index) => requireState(state, `github[${index}]`));
  if (subjects.includes("Unknown")) return "Unknown";
  if (subjects.includes("Conflict")) return "Conflict";
  const finalEquivalent = observation.finalAssets.every((state) => state === "Equivalent");
  const finalAbsent = observation.finalAssets.every((state) => state === "Absent");
  const finalAdmissible = observation.finalAssets.every((state) => state === "Equivalent" || state === "Absent");
  if (observation.tag === "Absent") {
    return observation.release === "Absent" && observation.escrow === "Absent" && finalAbsent ? "TagAbsent" : "Conflict";
  }
  if (observation.release === "Absent") {
    return observation.escrow === "Absent" && finalAbsent ? "TagEquivalentReleaseAbsent" : "Conflict";
  }
  if (observation.release === "EquivalentDraft") throw new Error("release phase must be carried separately");
  if (observation.releasePhase === "draft") {
    if (observation.escrow === "Absent" && finalAbsent) return "DraftEquivalentEscrowAbsent";
    if (observation.escrow === "Equivalent" && finalAdmissible && !finalEquivalent) {
      return "DraftEquivalentEscrowCompleteFinalAssetsIncomplete";
    }
    if (observation.escrow === "Equivalent" && finalEquivalent) return "DraftEquivalentEscrowAndFinalAssetsComplete";
    if (observation.escrow === "Absent" && finalEquivalent) return "DraftEquivalentPublicAssetsComplete";
    return "Conflict";
  }
  if (observation.releasePhase === "public") {
    return observation.escrow === "Absent" && finalEquivalent ? "Equivalent" : "Conflict";
  }
  return "Conflict";
};

export const nextAction = ({ github, registry }) => {
  const githubState = classifyGithub(github);
  const prefix = registryPrefix(registry);
  if (githubState === "Unknown" || prefix._tag === "Unknown") return { _tag: "Stop", reason: "Unknown" };
  if (githubState === "Conflict" || prefix._tag === "Conflict") return { _tag: "Stop", reason: "Conflict" };
  if (githubState === "TagAbsent") {
    return prefix.length === 0 ? { _tag: "Mutate", kind: "create-tag" } : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubState === "TagEquivalentReleaseAbsent") {
    return prefix.length === 0 ? { _tag: "Mutate", kind: "create-draft" } : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubState === "DraftEquivalentEscrowAbsent") {
    return prefix.length === 0 ? { _tag: "Mutate", kind: "upload-escrow" } : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubState === "DraftEquivalentEscrowCompleteFinalAssetsIncomplete") {
    if (prefix.length !== 0) return { _tag: "Stop", reason: "Conflict" };
    return { _tag: "Mutate", kind: "upload-final-asset", index: github.finalAssets.indexOf("Absent") };
  }
  if (githubState === "DraftEquivalentEscrowAndFinalAssetsComplete") {
    return prefix.length === registry.length
      ? { _tag: "Mutate", kind: "delete-escrow" }
      : { _tag: "Mutate", kind: "publish-coordinate", index: prefix.length };
  }
  if (githubState === "DraftEquivalentPublicAssetsComplete") {
    return prefix.length === registry.length
      ? { _tag: "Mutate", kind: "publish-draft" }
      : { _tag: "Stop", reason: "Conflict" };
  }
  if (githubState === "Equivalent") {
    return prefix.length === registry.length ? { _tag: "Complete" } : { _tag: "Stop", reason: "Conflict" };
  }
  return { _tag: "Stop", reason: "Conflict" };
};

export const coordinate = async (adapter, maximumSteps = 40) => {
  for (let step = 0; step < maximumSteps; step += 1) {
    const observation = await adapter.observe();
    const action = nextAction(observation);
    if (action._tag === "Complete" || action._tag === "Stop") return action;
    try {
      await adapter.mutate(action);
    } catch (error) {
      if (action.kind !== "publish-coordinate") throw error;
      // An ambiguous npm response is never retried. The next loop reobserves
      // the exact coordinate; only Equivalent permits progress.
      const after = await adapter.observe();
      const state = after.registry[action.index];
      if (state !== "Equivalent") return { _tag: "Stop", reason: "Unknown", error };
    }
  }
  return { _tag: "Stop", reason: "Unknown", error: new Error("coordinator step bound exhausted") };
};

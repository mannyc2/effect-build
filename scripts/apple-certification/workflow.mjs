import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appleCertificationPolicy } from "./canonical.mjs";
import { authenticateGeneratedAppleContract } from "./cli.mjs";

const stage = (id, needs, coordinates) => ({
  id,
  needs,
  coordinates,
});

export const deriveAppleWorkflowPlan = (contract) => {
  const { policy } = appleCertificationPolicy(contract);
  const hostedExecution = policy.hostedExecution;
  if (
    hostedExecution?.protocol !== "effect-build/apple-hosted-execution@1"
    || hostedExecution.status !== "blocked"
    || hostedExecution.artifactDisposition !== "forbidden-while-blocked"
    || !Array.isArray(hostedExecution.blockerIds)
    || !Array.isArray(hostedExecution.protectedStageIds)
  ) throw new Error("generated Apple hosted execution policy is not the supported blocked hard cut");
  const coordinates = (category) =>
    policy.coordinateRules.filter((rule) => rule.category === category).map(({ coordinate }) => coordinate);
  const native = coordinates("N-native");
  const signedApps = coordinates("P-signed-app");
  const notarized = coordinates("P-notarized-product");
  const cleanHost = coordinates("G-clean-host");
  const verdicts = coordinates("A-verdict");
  const pairedApps = [...new Set(
    policy.coordinateRules.filter(({ category }) => category === "P-signed-app").map(({ provider }) => provider),
  )].map((provider) => `paired-app:${provider}`);
  const distributionPairs = policy.productLineage.products
    .filter((product) => product !== "app")
    .map((product) => `paired-product:${product}`);
  const stages = [
    stage("admission", [], []),
    stage("native", ["admission"], native),
    stage("paired-app", ["native"], pairedApps),
    stage("sign-app", ["paired-app"], signedApps),
    stage("distribution-pairs", ["sign-app"], distributionPairs),
    stage("submit-product", ["sign-app", "distribution-pairs"], notarized),
    stage("continue-notary", ["submit-product"], notarized),
    stage("clean-host", ["continue-notary"], cleanHost),
    stage("verdict", ["native", "sign-app", "continue-notary", "clean-host"], verdicts),
    stage("aggregate", ["verdict"], []),
  ];
  const stageIds = new Set(stages.map(({ id }) => id));
  if (
    new Set(hostedExecution.blockerIds).size !== hostedExecution.blockerIds.length
    || new Set(hostedExecution.protectedStageIds).size !== hostedExecution.protectedStageIds.length
    || hostedExecution.protectedStageIds.some((id) => !stageIds.has(id))
  ) throw new Error("generated Apple hosted execution lists are invalid");
  return {
    workflow: policy.workflow,
    workflowPath: policy.workflowPath,
    coordinates: policy.coordinates,
    evidenceDescriptorOrder: policy.evidenceDescriptorOrder,
    stages: stages.map((entry) => ({
      ...entry,
      protectedEnvironment: hostedExecution.protectedStageIds.includes(entry.id),
    })),
    hostedExecution,
    protectedStageIds: [...hostedExecution.protectedStageIds],
  };
};

export const assertHostedAppleExecutionReady = (contract) => {
  const { hostedExecution } = deriveAppleWorkflowPlan(contract);
  throw new Error(`external-interface-stop:${hostedExecution.blockerIds.join(",")}`);
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--assert-hosted-ready") {
    process.stderr.write("usage: node scripts/apple-certification/workflow.mjs --assert-hosted-ready\n");
    process.exitCode = 64;
  } else {
    try {
      assertHostedAppleExecutionReady(await authenticateGeneratedAppleContract());
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : "external-interface-stop"}\n`);
      process.exitCode = 78;
    }
  }
}

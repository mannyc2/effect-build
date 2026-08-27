import { authenticateCandidate, candidateRequestFromEnvironment } from "../release/candidate.mjs";
import { requireEnvironment } from "../node-finalizer/common.mjs";

const candidate = await authenticateCandidate({
  repository: requireEnvironment("GITHUB_REPOSITORY"),
  token: requireEnvironment("GITHUB_TOKEN"),
  inputs: candidateRequestFromEnvironment(),
});

process.stdout.write(`${candidate.descriptor.sourceSha}\n`);

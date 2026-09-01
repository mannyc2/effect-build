import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createGitHubReadOnlyBoundary } from "./github-read-only-boundary.mjs";

const validateInputs = (contract, { repository, sourceSha }) => {
  const authority = contract?.releaseCertification?.githubAuthority;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || authority === undefined
    || repository !== authority.repository
    || typeof sourceSha !== "string"
    || !/^[0-9a-f]{40}$/u.test(sourceSha)
  ) throw new Error("current-main admission input or authority is not canonical");
  return { authority, repository, sourceSha };
};

export const assertCurrentMain = async ({ contract, repository, sourceSha, github }) => {
  const expected = validateInputs(contract, { repository, sourceSha });
  const main = await github.readJson(`repos/${expected.repository}/git/ref/heads/main`);
  if (
    main === null
    || typeof main !== "object"
    || Array.isArray(main)
    || main.ref !== "refs/heads/main"
    || main.object?.type !== "commit"
    || main.object?.sha !== expected.sourceSha
  ) throw new Error("source SHA is not authenticated current main");
  return main;
};

const cli = async () => {
  const contract = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(resolve(process.env.CONTRACT_PATH ?? "tooling/effect-build-contract.json")),
    ),
  );
  const repository = process.env.REPOSITORY;
  const sourceSha = process.env.SOURCE_SHA;
  const token = process.env.ACTIONS_READ_TOKEN ?? process.env.GH_TOKEN;
  delete process.env.ACTIONS_READ_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const github = createGitHubReadOnlyBoundary({
    repository,
    token,
    transport: contract.releaseCertification?.githubAuthority?.readOnlyTransport,
  });
  await assertCurrentMain({ contract, repository, sourceSha, github });
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(() => {
    process.stderr.write("current-main admission failed closed\n");
    process.exitCode = 1;
  });
}

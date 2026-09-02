#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  commitTarget,
  exactProvenance,
  packageNames,
  readState,
  registryUrl,
  targetVersion,
  workflowRef,
  writeState,
} from "./release-state.mjs";

const statePath = process.env.FAKE_RELEASE_STATE;
const tool = process.env.FAKE_RELEASE_BOUNDARY_TOOL;
if (statePath === undefined || !["curl", "npm"].includes(tool ?? "")) process.exit(97);

const args = process.argv.slice(2);
const state = readState(statePath);
const fail = (message = "fake release boundary rejected non-allowlisted request") => {
  process.stderr.write(`${message}\n`);
  process.exit(97);
};
const outputJson = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
state.invocations.push({ args, tool });
writeState(statePath, state);

const forbiddenEnvironment = ["NPM_ID_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN", "SIGSTORE_ID_TOKEN"]
  .filter((name) => Object.hasOwn(process.env, name));
if (tool === "npm" && forbiddenEnvironment.length > 0) {
  state.violations ??= [];
  state.violations.push({ code: "forbidden-environment", names: forbiddenEnvironment });
  writeState(statePath, state);
  fail("fake npm received forbidden authentication environment");
}
if (tool === "npm" && ["GH_TOKEN", "UNRELATED_RUNNER_SECRET"].some((name) => Object.hasOwn(process.env, name))) {
  state.violations ??= [];
  state.violations.push({ code: "non-allowlisted-npm-environment" });
  writeState(statePath, state);
  fail("fake npm received a non-allowlisted runner identity");
}
if (tool === "curl" && [
  "GH_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "UNRELATED_RUNNER_SECRET",
].some((name) => Object.hasOwn(process.env, name))) {
  state.violations ??= [];
  state.violations.push({ code: "inherited-curl-credential" });
  writeState(statePath, state);
  fail("fake curl inherited a credential instead of receiving one explicit header");
}
if (tool === "npm") {
  const oidcNames = ["ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL"];
  const present = oidcNames.filter((name) => Object.hasOwn(process.env, name));
  if (args[0] === "publish" ? present.length !== oidcNames.length : present.length !== 0) {
    state.violations ??= [];
    state.violations.push({ code: "npm-oidc-authority-scope", command: args[0], present });
    writeState(statePath, state);
    fail("fake npm received the wrong OIDC authority for its command");
  }
}

const parseOptions = (values, allowed) => {
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const kind = allowed.get(key);
    if (kind === undefined || options.has(key)) fail();
    if (kind === "boolean") {
      options.set(key, true);
      continue;
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) fail();
    options.set(key, value);
    index += 1;
  }
  return options;
};

const registryPackage = (name) => {
  const entry = state.registry.packages[name];
  if (entry === undefined) fail();
  return entry;
};

const npmView = () => {
  if (args.length < 5) fail();
  const spec = args[1];
  const field = args[2];
  const options = parseOptions(args.slice(3), new Map([
    ["--json", "boolean"],
    ["--cache", "value"],
    ["--fetch-retries", "value"],
    ["--fetch-retry-mintimeout", "value"],
    ["--fetch-retry-maxtimeout", "value"],
    ["--fetch-timeout", "value"],
    ["--globalconfig", "value"],
    ["--prefer-online", "boolean"],
    ["--registry", "value"],
    ["--userconfig", "value"],
  ]));
  if (!options.has("--json") || options.get("--registry") !== registryUrl) fail();
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : undefined;
  if (
    state.faults.driftDuringPrefixAfterFirstCommit !== undefined
    && state.mutations.filter(({ committed }) => committed).length === 1
    && state.faults.registryPrefixDriftInjected !== true
  ) {
    state.registry.packages[state.faults.driftDuringPrefixAfterFirstCommit].tags.latest = "0.4.0";
    state.faults.registryPrefixDriftInjected = true;
    writeState(statePath, state);
  }
  const entry = registryPackage(name);
  if (state.faults.view?.name === name && state.faults.view?.field === field) {
    process.stderr.write("npm error code E500\nsimulated inconclusive registry response\n");
    process.exit(1);
  }
  if (field === "dist-tags" && version === undefined) return outputJson(entry.tags);
  if (field === "versions" && version === undefined) return outputJson(Object.keys(entry.versions).sort());
  if (version === undefined || entry.versions[version] === undefined) {
    process.stderr.write("npm error code E404\n404 Not Found\n");
    process.exit(1);
  }
  const release = entry.versions[version];
  const attestations = release.provenance === null
    ? undefined
    : {
      provenance: { predicateType: release.provenance.predicateType },
      url: `${registryUrl}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`,
    };
  if (field === "dist.integrity") {
    if (state.faults.postPublish?.name === name && state.faults.postPublish?.mode === "integrity") {
      return outputJson(`sha512-${Buffer.from("post-publish-integrity-mismatch").toString("base64")}`);
    }
    return outputJson(release.integrity);
  }
  if (field === "dist.attestations") return outputJson(attestations ?? null);
  if (field === "dist") {
    return outputJson({
      ...(attestations === undefined ? {} : { attestations }),
      integrity: release.integrity,
      shasum: release.sha256.slice(0, 40),
    });
  }
  fail();
};

const npmPack = () => {
  const spec = args[1];
  if (typeof spec !== "string") fail();
  const options = parseOptions(args.slice(2), new Map([
    ["--cache", "value"],
    ["--fetch-retries", "value"],
    ["--fetch-retry-mintimeout", "value"],
    ["--fetch-retry-maxtimeout", "value"],
    ["--fetch-timeout", "value"],
    ["--globalconfig", "value"],
    ["--ignore-scripts", "boolean"],
    ["--json", "boolean"],
    ["--pack-destination", "value"],
    ["--prefer-online", "boolean"],
    ["--registry", "value"],
    ["--userconfig", "value"],
  ]));
  if (
    options.get("--registry") !== registryUrl
    || !options.has("--ignore-scripts")
    || !options.has("--json")
    || typeof options.get("--pack-destination") !== "string"
  ) fail();
  const at = spec.lastIndexOf("@");
  if (at <= 0) fail();
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  const release = registryPackage(name).versions[version];
  if (release?.file === null || release?.file === undefined) fail();
  const filename = `${name}-${version}.tgz`;
  copyFileSync(release.file, resolve(options.get("--pack-destination"), filename));
  if (
    state.faults.postPublish?.name === name
    && ["bytes", "size"].includes(state.faults.postPublish?.mode)
    && version === targetVersion
  ) {
    appendFileSync(resolve(options.get("--pack-destination"), filename), "post-publish-mismatch");
  }
  outputJson([{ filename }]);
};

const npmPublish = () => {
  const tarball = args[1];
  if (typeof tarball !== "string" || tarball.startsWith("--")) fail();
  const options = parseOptions(args.slice(2), new Map([
    ["--access", "value"],
    ["--cache", "value"],
    ["--dry-run", "boolean"],
    ["--fetch-retries", "value"],
    ["--fetch-retry-mintimeout", "value"],
    ["--fetch-retry-maxtimeout", "value"],
    ["--fetch-timeout", "value"],
    ["--globalconfig", "value"],
    ["--ignore-scripts", "boolean"],
    ["--loglevel", "value"],
    ["--prefer-online", "boolean"],
    ["--provenance", "boolean"],
    ["--registry", "value"],
    ["--tag", "value"],
    ["--userconfig", "value"],
  ]));
  if (
    options.get("--access") !== "public"
    || options.get("--registry") !== registryUrl
    || options.get("--tag") !== "latest"
    || !options.has("--ignore-scripts")
    || !options.has("--provenance")
  ) fail();
  const name = packageNames.find((candidateName) =>
    basename(state.candidate.packages[candidateName].file) === basename(tarball)
  );
  if (name === undefined) fail();
  if (options.has("--dry-run")) {
    const markers = state.faults.dryRunMarker === "missing"
      ? 0
      : state.faults.dryRunMarker === "duplicate"
      ? 2
      : 1;
    for (let index = 0; index < markers; index += 1) {
      process.stderr.write("npm verbose oidc Successfully retrieved and set token\n");
    }
    process.stdout.write(`+ ${name}@${targetVersion}\n`);
    return;
  }

  const mutation = {
    committed: false,
    name,
    provenance: false,
    sequence: state.mutations.length + 1,
  };
  state.mutations.push(mutation);
  const fault = state.faults.publish?.name === name ? state.faults.publish.mode : undefined;
  if (fault === "before-commit") {
    writeState(statePath, state);
    process.stderr.write("simulated response loss before registry commitment\n");
    process.exit(1);
  }
  if (fault === "after-tag") {
    commitTarget(state, name, null);
    mutation.committed = true;
    writeState(statePath, state);
    process.stderr.write("simulated response loss after bytes and tag but before provenance\n");
    process.exit(1);
  }
  commitTarget(state, name, exactProvenance(state.sourceSha));
  mutation.committed = true;
  mutation.provenance = true;
  writeState(statePath, state);
  if (fault === "after-commit") {
    process.stderr.write("simulated response loss after registry commitment\n");
    process.exit(1);
  }
  process.stdout.write(`+ ${name}@${targetVersion}\n`);
};

const npmAudit = () => {
  const options = parseOptions(args.slice(2), new Map([
    ["--cache", "value"],
    ["--ignore-scripts", "boolean"],
    ["--json", "boolean"],
    ["--registry", "value"],
    ["--userconfig", "value"],
  ]));
  if (args[1] !== "signatures" || !options.has("--json") || options.get("--registry") !== registryUrl) fail();
  outputJson({ invalid: [], missing: [] });
};

const npmConfig = () => {
  const options = parseOptions(args.slice(2), new Map([
    ["--globalconfig", "value"],
    ["--json", "boolean"],
    ["--userconfig", "value"],
  ]));
  if (args[1] !== "list" || !options.has("--json")) fail();
  outputJson({
    "auth-type": "web",
    cert: null,
    key: null,
    registry: registryUrl,
    "token-description": null,
    ...(state.faults.npmConfigAuth
      ? { "//registry.npmjs.org/:_authToken": "fixture-preexisting-token" }
      : {}),
  });
};

const handleNpm = () => {
  if (JSON.stringify(args) === JSON.stringify(["--version"])) {
    process.stdout.write("11.11.0\n");
    return;
  }
  if (args[0] === "view") return npmView();
  if (args[0] === "pack") return npmPack();
  if (args[0] === "publish") return npmPublish();
  if (args[0] === "audit") return npmAudit();
  if (args[0] === "config") return npmConfig();
  fail();
};

const parseCurl = () => {
  if (args[0] !== "--disable" || args.filter((value) => value === "--disable").length !== 1) fail();
  const headers = [];
  let authorizationConfigured = false;
  let output;
  let url;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--disable" && index === 0) continue;
    if (["--fail", "--location", "--show-error", "--silent"].includes(arg)) continue;
    if (["--connect-timeout", "--max-time", "--retry", "--proto", "--proto-redir"].includes(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) fail();
      const expected = {
        "--connect-timeout": "15",
        "--max-time": "120",
        "--proto": "=https",
        "--proto-redir": "=https",
        "--retry": "0",
      }[arg];
      if (value !== expected) fail();
      index += 1;
      continue;
    }
    if (arg === "--config") {
      const path = args[index + 1];
      if (path !== "-" || authorizationConfigured) fail();
      let contents;
      try {
        contents = readFileSync(0, "utf8");
      } catch {
        fail();
      }
      const match = /^header = "Authorization: Bearer ([A-Za-z0-9._-]+)"\n$/u.exec(contents);
      if (match === null) fail();
      headers.push(`Authorization: Bearer ${match[1]}`);
      authorizationConfigured = true;
      index += 1;
      continue;
    }
    if (arg === "--header") {
      const header = args[index + 1];
      if (
        header === undefined
        || !(
          /^Accept: application\/vnd\.github(?:\.raw)?\+json$/u.test(header)
          || header === "Accept: application/json"
          || /^X-GitHub-Api-Version: 20\d\d-\d\d-\d\d$/u.test(header)
        )
      ) fail();
      headers.push(header);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      output = args[index + 1];
      if (output === undefined) fail();
      index += 1;
      continue;
    }
    if (arg.startsWith("--") || url !== undefined) fail();
    url = arg;
  }
  if (url === undefined) fail();
  return { headers, output, url };
};

const artifactMetadata = (artifact) => ({
  archive_download_url: `https://api.github.com/repos/mannyc2/effect-build/actions/artifacts/${artifact.artifactId}/zip`,
  digest: artifact.digest,
  expired: false,
  id: artifact.artifactId,
  name: artifact.name,
  size_in_bytes: artifact.size,
  workflow_run: { head_sha: artifact.headSha ?? state.sourceSha, id: artifact.runId },
});

const runMetadata = (artifact) => ({
  conclusion: "success",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: artifact.headSha ?? state.sourceSha,
  id: artifact.runId,
  path: artifact.workflowPath,
  run_attempt: artifact.runAttempt,
  status: "completed",
});

const writeCurlBody = (body, output) => {
  if (output === undefined) {
    if (Buffer.isBuffer(body)) writeFileSync(1, body);
    else process.stdout.write(typeof body === "string" ? body : `${JSON.stringify(body)}\n`);
  } else {
    writeFileSync(output, Buffer.isBuffer(body) || typeof body === "string" ? body : `${JSON.stringify(body)}\n`);
  }
};

const handleCurl = () => {
  const { headers, output, url } = parseCurl();
  const prefix = "https://api.github.com/repos/mannyc2/effect-build/";
  const hasAuthorization = headers.some((header) => /^Authorization:/iu.test(header));
  const githubApiRequest = url === prefix.slice(0, -1) || url.startsWith(prefix);
  const oidcTokenRequest = url === "https://pipelinesghubeus13.actions.githubusercontent.com/"
    + "ABCDEFGHIJKLMNOPQRSTUVWX/00000000-0000-4000-8000-000000000001/"
    + "_apis/distributedtask/hubs/Actions/plans/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/jobs/"
    + "ZYXWVUTSRQPONMLKJIHGFEDCBA987654/idtoken?api-version=2.0&audience=npm%3Aregistry.npmjs.org";
  if ((githubApiRequest || oidcTokenRequest) !== hasAuthorization) {
    state.violations ??= [];
    state.violations.push({ code: "cross-origin-authorization", url });
    writeState(statePath, state);
    fail("fake curl observed authorization at the wrong origin");
  }
  if (url === prefix.slice(0, -1)) {
    return writeCurlBody({
      full_name: "mannyc2/effect-build",
      id: 1331906770,
      owner: { id: 126291407, login: "mannyc2" },
      visibility: "public",
    }, output);
  }
  if (url === `${prefix}environments/npm`) {
    state.observations.environmentReads += 1;
    if (
      state.mutations.filter(({ committed }) => committed).length === 1
      && state.faults.authorityDriftAfterFirstCommit === true
      && state.faults.authorityDriftInjected !== true
    ) {
      state.api.environment.protection_rules.push({ type: "wait_timer", wait_timer: 1 });
      state.faults.authorityDriftInjected = true;
    }
    writeState(statePath, state);
    return writeCurlBody(state.api.environment, output);
  }
  if (url === `${prefix}environments/npm/deployment-branch-policies`) {
    return writeCurlBody(state.api.policies, output);
  }
  if (url === `${prefix}git/ref/heads/main`) {
    state.observations.mainReads += 1;
    if (
      state.mutations.filter(({ committed }) => committed).length === 1
      && state.faults.advanceMainAfterFirstCommit === true
      && state.faults.mainAdvanceInjected !== true
    ) {
      state.api.mainSha = "2222222222222222222222222222222222222222";
      state.faults.mainAdvanceInjected = true;
    }
    writeState(statePath, state);
    return writeCurlBody({
      object: { sha: state.api.mainSha, type: "commit" },
      ref: "refs/heads/main",
    }, output);
  }
  if (url === `${prefix}actions/oidc/customization/sub`) return writeCurlBody(state.api.oidc, output);
  if (url === "https://pipelinesghubeus13.actions.githubusercontent.com/"
    + "ABCDEFGHIJKLMNOPQRSTUVWX/00000000-0000-4000-8000-000000000001/"
    + "_apis/distributedtask/hubs/Actions/plans/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/jobs/"
    + "ZYXWVUTSRQPONMLKJIHGFEDCBA987654/idtoken?api-version=2.0&audience=npm%3Aregistry.npmjs.org") {
    return writeCurlBody({ value: state.api.oidcProvider.token }, output);
  }
  if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
    return writeCurlBody(state.api.oidcProvider.discovery, output);
  }
  if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
    return writeCurlBody(state.api.oidcProvider.jwks, output);
  }
  if (url === `${prefix}contents/tooling/effect-build-contract.json?ref=${state.sourceSha}`) {
    return writeCurlBody(readFileSync(state.candidate.contractPath), output);
  }
  if (url === `${prefix}contents/tooling/sigstore/trusted_root.json?ref=${state.sourceSha}`) {
    return writeCurlBody(
      readFileSync(new URL("../../../tooling/sigstore/trusted_root.json", import.meta.url)),
      output,
    );
  }
  for (const artifact of Object.values(state.artifacts)) {
    if (url === `${prefix}actions/artifacts/${artifact.artifactId}`) {
      return writeCurlBody(artifactMetadata(artifact), output);
    }
    if (url === `${prefix}actions/artifacts/${artifact.artifactId}/zip`) {
      return writeCurlBody(readFileSync(artifact.path), output);
    }
    if (url === `${prefix}actions/runs/${artifact.runId}/attempts/${artifact.runAttempt}`) {
      return writeCurlBody(runMetadata(artifact), output);
    }
  }
  const attestation = new RegExp(
    `^${registryUrl.replaceAll("/", "\\/")}\\/-\\/npm\\/v1\\/attestations\\/(.+)@${targetVersion}$`,
    "u",
  ).exec(url);
  if (attestation !== null) {
    const name = decodeURIComponent(attestation[1]);
    const provenance = registryPackage(name).versions[targetVersion]?.provenance;
    if (provenance === null || provenance === undefined) fail();
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      predicate: {
        buildDefinition: {
          buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
          externalParameters: {
            workflow: provenance.workflowRef === workflowRef
              ? {
                path: ".github/workflows/release.yml",
                ref: "refs/heads/main",
                repository: "https://github.com/mannyc2/effect-build",
              }
              : {
                path: ".github/workflows/release.yml",
                ref: "refs/heads/main",
                repository: "https://github.com/foreign/repository",
              },
          },
          internalParameters: {
            github: {
              event_name: "workflow_dispatch",
              repository_id: "1331906770",
              repository_owner_id: "126291407",
            },
          },
          resolvedDependencies: [{
            digest: { gitCommit: provenance.sourceSha },
            uri: "git+https://github.com/mannyc2/effect-build@refs/heads/main",
          }],
        },
        runDetails: {
          builder: { id: "https://github.com/actions/runner/github-hosted" },
          metadata: {
            invocationId: "https://github.com/mannyc2/effect-build/actions/runs/8001/attempts/1",
          },
        },
      },
      predicateType: provenance.predicateType,
      subject: [{
        digest: {
          sha512: createHash("sha512")
            .update(readFileSync(state.candidate.packages[name].file))
            .digest("hex"),
        },
        name: `pkg:npm/${name}@${targetVersion}`,
      }],
    };
    return writeCurlBody({
      attestations: [{
        bundle: {
          fakeVerified: provenance.verified,
          ...(provenance.signerOid === undefined ? {} : { fakeSignerOid: provenance.signerOid }),
          dsseEnvelope: {
            payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
            payloadType: "application/vnd.in-toto+json",
            signatures: [{ sig: "fake-verified-by-npm-audit-signatures" }],
          },
        },
        predicateType: provenance.predicateType,
      }],
    }, output);
  }
  fail();
};

if (tool === "npm") handleNpm();
else handleCurl();

import { readFile } from "node:fs/promises";
import { conclusion, infrastructure, writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

const eventName = process.env.GITHUB_EVENT_NAME;
const eventPath = process.env.GITHUB_EVENT_PATH;
const apiUrl = process.env.GITHUB_API_URL;
const repository = process.env.GITHUB_REPOSITORY;
infrastructure(eventName === "pull_request" || eventName === "push", "unsupported certification event");
infrastructure(typeof eventPath === "string" && eventPath.length > 0, "GITHUB_EVENT_PATH is missing");
infrastructure(typeof apiUrl === "string" && apiUrl.length > 0, "GITHUB_API_URL is missing");
infrastructure(typeof repository === "string" && /^[^/]+\/[^/]+$/.test(repository), "GITHUB_REPOSITORY is missing");

const event = JSON.parse(await readFile(eventPath, "utf8"));
const trustedApiOrigin = new URL(apiUrl).origin;
const requestJson = async (value) => {
  const url = new URL(value);
  infrastructure(url.origin === trustedApiOrigin, "remote-head request escaped the configured GitHub API origin");
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "effect-build-architecture-certifier",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  infrastructure(response.ok, `GitHub API returned ${response.status} while resolving the fresh remote head`);
  return await response.json();
};

let eventSourceSha;
let observedSha;
let observedRef;
if (eventName === "pull_request") {
  const pullUrl = event.pull_request?.url;
  infrastructure(typeof pullUrl === "string", "pull-request API URL is missing from the event");
  const expectedPrefix = `/repos/${repository}/pulls/`;
  infrastructure(new URL(pullUrl).pathname.startsWith(expectedPrefix), "pull-request API URL names another repository");
  eventSourceSha = event.pull_request?.head?.sha;
  const pull = await requestJson(pullUrl);
  observedSha = pull.head?.sha;
  observedRef = `${pull.head?.repo?.full_name ?? "unknown"}:${pull.head?.ref ?? "unknown"}`;
} else {
  const ref = event.ref;
  infrastructure(typeof ref === "string" && ref.startsWith("refs/"), "push ref is missing from the event");
  infrastructure(ref === process.env.GITHUB_REF, "push event ref differs from GITHUB_REF");
  eventSourceSha = event.after;
  const encodedRef = ref.slice("refs/".length).split("/").map(encodeURIComponent).join("/");
  const remoteRef = await requestJson(`${apiUrl}/repos/${repository}/git/ref/${encodedRef}`);
  observedSha = remoteRef.object?.sha;
  observedRef = remoteRef.ref;
}

conclusion(eventSourceSha === sourceSha, "workflow event source does not equal the certified source SHA");
conclusion(observedSha === sourceSha, "fresh pull-request or branch head moved away from the certified source SHA");

await writeReceipt({
  id: "remote-head",
  sourceSha,
  claims: [{
    id: "fresh-remote-head",
    classification: "established",
    conclusion: "fresh-pull-request-or-branch-head-equals-the-exact-certified-source",
    assertions: [
      assertion("event-source-equals-source-sha"),
      assertion("fresh-api-head-equals-source-sha"),
    ],
  }],
  evidence: {
    result: "passed",
    eventName,
    repository,
    observedRef,
    eventSourceSha,
    observedSha,
  },
});

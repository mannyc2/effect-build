import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digest, integrity, readCandidate } from "./candidate.mjs";
import { resolveNpm } from "./npm.mjs";

const registry = "https://registry.npmjs.org";
const get = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}; registry verification incomplete, retry later`);
  return response;
};

// Check policy against the same bundle the maintained verifier authenticates, not a second fetch.
export const verifyProvenance = async ({ bundle, verifier, entry, manifest, repository }) => {
  await verifier.verify(bundle);
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  const source = definition?.resolvedDependencies?.find((dependency) =>
    dependency.uri === `git+https://github.com/${repository}@refs/tags/${manifest.tag}`
  );
  const purl = `pkg:npm/${entry.name.replace(/^@/u, "%40")}@${manifest.version}`;
  const sha512 = Buffer.from(entry.integrity.slice("sha512-".length), "base64").toString("hex");
  if (
    statement._type !== "https://in-toto.io/Statement/v1"
    || statement.predicateType !== "https://slsa.dev/provenance/v1"
    || statement.subject?.length !== 1 || statement.subject[0].name !== purl
    || statement.subject[0].digest?.sha512 !== sha512
    || source?.digest?.gitCommit !== manifest.sourceSha
    || workflow?.repository !== `https://github.com/${repository}` || workflow?.path !== ".github/workflows/release.yml"
    || workflow?.ref !== `refs/tags/${manifest.tag}`
  ) throw new Error(`${entry.name}: authenticated provenance does not identify this candidate, source and workflow`);
};

const main = async () => {
  if (!process.argv[2]) throw new Error("usage: node scripts/release/verify-published.mjs <candidate-directory>");
  const manifest = readCandidate(resolve(process.argv[2]));
  const repository = process.env.GITHUB_REPOSITORY ?? "mannyc2/effect-build";
  const require = createRequire(resolveNpm());
  if (require("../package.json").version !== "11.11.0") throw new Error("verification requires npm 11.11.0");
  const { createVerifier } = require("sigstore");
  const verifier = await createVerifier({
    certificateIssuer: "https://token.actions.githubusercontent.com",
    certificateIdentityURI: `https://github.com/${repository}/.github/workflows/release.yml@refs/tags/${manifest.tag}`,
  });
  for (const entry of manifest.packages) {
    const name = encodeURIComponent(entry.name);
    const metadata = await (await get(`${registry}/${name}`)).json();
    const dist = metadata.versions?.[manifest.version]?.dist;
    if (dist?.integrity !== entry.integrity) {
      throw new Error(`${entry.name}: registry integrity differs from the candidate`);
    }
    if (metadata["dist-tags"]?.latest !== manifest.version) {
      throw new Error(`${entry.name}: latest differs; inspect dist-tags before repairing`);
    }
    const bytes = Buffer.from(await (await get(dist.tarball)).arrayBuffer());
    if (digest(bytes) !== entry.sha256 || integrity(bytes) !== entry.integrity) {
      throw new Error(`${entry.name}: downloaded bytes differ from the candidate`);
    }
    const attestations = await (await get(`${registry}/-/npm/v1/attestations/${name}@${manifest.version}`)).json();
    const provenance = attestations.attestations?.find((item) =>
      item.predicateType === "https://slsa.dev/provenance/v1"
    );
    if (!provenance) {
      throw new Error(
        `${entry.name}: public provenance is missing; retry verification after registry visibility catches up`,
      );
    }
    await verifyProvenance({ bundle: provenance.bundle, verifier, entry, manifest, repository });
    console.log(
      `${entry.name}@${manifest.version}: exact published bytes, latest and authenticated provenance verified`,
    );
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

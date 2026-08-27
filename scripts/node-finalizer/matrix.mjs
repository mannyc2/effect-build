import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evidenceControl, nodeMainApplicableCoordinates, nodeMainRule, targetHost } from "./common.mjs";

const constructionHosts = new Map(evidenceControl.certificationHosts.map((host) => [host.id, host]));

export const buildNodeMainMatrices = () => {
  const construction = nodeMainApplicableCoordinates.map((entry) => {
    const host = constructionHosts.get(entry.constructionHost);
    if (host === undefined) throw new Error(`missing construction host ${entry.constructionHost}`);
    return {
      producer: entry.producerGroup,
      format: entry.format,
      construction: {
        id: host.id,
        runner: host.runner,
        system_target: host.systemTarget,
      },
      target: entry.target,
    };
  });
  const finalization = nodeMainApplicableCoordinates.map((entry) => ({
    producer: entry.producerGroup,
    format: entry.format,
    construction_host: entry.constructionHost,
    target: { token: entry.target, runner: targetHost(entry.target).runner },
  }));
  if (
    construction.length !== nodeMainRule.expectedCoordinateCount
    || finalization.length !== nodeMainRule.expectedCoordinateCount
  ) {
    throw new Error("generated Node matrices do not match the applicable contract count");
  }
  return Object.freeze({
    construction: Object.freeze({ include: Object.freeze(construction) }),
    finalization: Object.freeze({ include: Object.freeze(finalization) }),
  });
};

const main = async () => {
  const output = process.env.GITHUB_OUTPUT;
  if (output === undefined || output.length === 0) throw new Error("GITHUB_OUTPUT is required");
  const matrices = buildNodeMainMatrices();
  await appendFile(
    output,
    `construction=${JSON.stringify(matrices.construction)}\nfinalization=${JSON.stringify(matrices.finalization)}\n`,
  );
};

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await main();

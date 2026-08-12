#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const arguments_ = process.argv.slice(2);
const endpoint = arguments_[1];
if (arguments_.length !== 2 || arguments_[0] !== "api" || endpoint === undefined) {
  console.error(`unexpected fake gh arguments: ${JSON.stringify(arguments_)}`);
  process.exit(2);
}

const log = process.env.FAKE_GH_LOG;
if (log !== undefined) appendFileSync(log, `${JSON.stringify(arguments_)}\n`);

const response = endpoint.endsWith("/jobs?per_page=100")
  ? process.env.FAKE_GH_JOBS_JSON
  : process.env.FAKE_GH_RUN_JSON;
if (response === undefined) {
  console.error(`missing fake response for ${endpoint}`);
  process.exit(2);
}
process.stdout.write(response);

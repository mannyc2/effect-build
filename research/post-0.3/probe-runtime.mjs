import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  infrastructure,
  ResearchInfrastructureFailure,
} from "./receipt.mjs";

const execFileAsync = promisify(execFile);
export const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const sourceSha = process.env.SOURCE_SHA;
infrastructure(typeof sourceSha === "string" && /^[0-9a-f]{40}$/.test(sourceSha), "SOURCE_SHA must be a commit SHA");

export const requiredPath = async (name) => {
  const value = process.env[name];
  infrastructure(typeof value === "string" && isAbsolute(value), `${name} must be an absolute path`);
  await access(value).catch((error) => {
    throw new ResearchInfrastructureFailure(`${name} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  });
  return value;
};

export const runRequired = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd ?? repository,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 300_000,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    throw new ResearchInfrastructureFailure(
      `probe command failed: ${executable} ${argv.join(" ")}\n${stderr || stdout || (error instanceof Error ? error.message : String(error))}`,
      { cause: error },
    );
  }
};

export const markerValue = (stdout, marker) => {
  const prefix = `${marker}=`;
  const line = stdout.split(/\r?\n/).findLast((value) => value.startsWith(prefix));
  infrastructure(line !== undefined, `probe did not emit ${marker}`);
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch (error) {
    throw new ResearchInfrastructureFailure(`${marker} did not contain JSON`, { cause: error });
  }
};

export const rawMarkerValue = (stdout, marker) => {
  const prefix = `${marker}=`;
  const line = stdout.split(/\r?\n/).findLast((value) => value.startsWith(prefix));
  infrastructure(line !== undefined, `probe did not emit ${marker}`);
  const raw = line.slice(prefix.length);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export const assertion = (name, detail) => ({
  name,
  passed: true,
  ...(detail === undefined ? {} : { detail }),
});

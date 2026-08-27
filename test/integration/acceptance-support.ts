import { accessSync, constants } from "node:fs";
import { isAbsolute } from "node:path";

export const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for this acceptance lane`);
  }
  return value;
};

export const requiredExecutable = (name: string): string => {
  const value = requiredEnvironment(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  accessSync(value, constants.X_OK);
  return value;
};

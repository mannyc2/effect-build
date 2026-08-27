import { execFile } from "node:child_process";
import { chmod, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export const installFixtureExecutable = async (options: {
  readonly fixture: string;
  readonly root: string;
  readonly name: string;
}): Promise<string> => {
  if (process.platform === "win32") {
    const executable = join(options.root, `${options.name}.exe`);
    await execute("bun", ["build", options.fixture, "--compile", "--outfile", executable]);
    return executable;
  }
  const executable = join(options.root, options.name);
  await copyFile(options.fixture, executable);
  await chmod(executable, 0o755);
  return executable;
};

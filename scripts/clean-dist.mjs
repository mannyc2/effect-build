import { readFile, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
// The build's project references own the package inventory.
const { references } = JSON.parse(await readFile(new URL("../tsconfig.packages.json", import.meta.url), "utf8"));
const targets = ["dist", ...references.map(({ path }) => `${path.replace(/^\.\//u, "")}/dist`)];

for (const targetPath of targets) {
  const target = resolve(repository, targetPath);
  const contained = relative(repository, target);
  if (
    !/^packages\/[^/]+\/dist$/u.test(targetPath) && targetPath !== "dist"
    || contained !== targetPath.split("/").join(sep)
    || contained.startsWith(".." + sep)
    || contained === ".."
  ) {
    throw new Error("refusing to remove non-dist target: " + target);
  }
  await rm(target, { recursive: true, force: true });
}

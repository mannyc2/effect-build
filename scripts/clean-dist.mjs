import { rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const targets = [
  "packages/effect-build/dist",
  "packages/effect-build-bun/dist",
  "packages/effect-build-deno/dist",
];

for (const targetPath of targets) {
  const target = resolve(repository, targetPath);
  const contained = relative(repository, target);
  if (
    contained !== targetPath.split("/").join(sep)
    || contained.startsWith(".." + sep)
    || contained === ".."
  ) {
    throw new Error("refusing to remove non-package dist target: " + target);
  }
  await rm(target, { recursive: true, force: true });
}

import { rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const targets = [
  "dist",
  "packages/effect-build/dist",
  "packages/effect-build-apple/dist",
  "packages/effect-build-archives/dist",
  "packages/effect-build-bun/dist",
  "packages/effect-build-deno/dist",
  "packages/effect-build-esbuild/dist",
  "packages/effect-build-nfpm/dist",
  "packages/effect-build-node-sea/dist",
  "packages/effect-build-python/dist",
  "packages/effect-build-rolldown/dist",
  "packages/effect-build-sbom/dist",
  "packages/effect-build-windows/dist",
];

for (const targetPath of targets) {
  const target = resolve(repository, targetPath);
  const contained = relative(repository, target);
  if (
    contained !== targetPath.split("/").join(sep)
    || contained.startsWith(".." + sep)
    || contained === ".."
  ) {
    throw new Error("refusing to remove non-dist target: " + target);
  }
  await rm(target, { recursive: true, force: true });
}

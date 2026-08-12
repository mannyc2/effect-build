import { rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const target = resolve(repository, "dist");
const contained = relative(repository, target);
if (contained !== "dist" || contained.includes("..") || contained.includes(sep)) {
  throw new Error(`refusing to remove non-dist target: ${target}`);
}
await rm(target, { recursive: true, force: true });

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import * as NodeSea from "effect-build-node-sea";
import { chmod, copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { elf } from "../fixtures/native-executable.js";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const tool = (path: string): Tool.Resolved => ({
  name: "node",
  path,
  version: "22.0.0",
  bytes: 0,
  sha256: "0".repeat(64),
});

it.skipIf(process.platform === "win32")(
  "reports both copy paths when the SEA base disappears and preserves committed output",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-sea-base-"));
    try {
      const base = join(root, "base");
      const main = join(root, "main.cjs");
      const builder = join(root, "builder.mjs");
      const outfile = join(root, "output");
      await writeFile(base, elf());
      await writeFile(main, "console.log('main');\n");
      await writeFile(outfile, "previous output\n");
      await copyFile(fileURLToPath(new URL("../fixtures/sea-remove-base.mjs", import.meta.url)), builder);
      await chmod(builder, 0o755);
      const artifact = await run(Artifact.file(main, { name: "fixture", version: "1" }));
      const failure = await run(
        NodeSea.assemble({ main: artifact, outfile, cwd: root }).pipe(
          Effect.provideService(NodeSea.NodeSea, { builder: tool(builder), base: tool(base) }),
          Effect.flip,
        ),
      );
      expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "copy-failed" });
      if (!(failure instanceof Artifact.ArtifactError)) throw failure;
      expect(failure.detail).toContain(`copy ${base} -> ${failure.path}:`);
      expect(failure.detail).toContain("NotFound: FileSystem.copyFile");
      expect(await readFile(outfile, "utf8")).toBe("previous output\n");
      expect((await readdir(root)).sort()).toEqual(["builder.mjs", "main.cjs", "output"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

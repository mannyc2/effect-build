import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** A real TS program whose runtime remains runnable after relocation (Homebrew Node may not). */
export const standaloneProgram = async (outfile: string): Promise<void> => {
  const temporary = await mkdtemp(join(tmpdir(), "effect-build-program-"));
  try {
    const entrypoint = join(temporary, "main.ts");
    await writeFile(entrypoint, "console.log(42);\n");
    await execute(process.env.EFFECT_BUILD_BUN ?? "bun", ["build", "--compile", entrypoint, "--outfile", outfile], {
      timeout: 60_000,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

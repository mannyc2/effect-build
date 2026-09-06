import { Command } from "effect-build-bun";
import { fileURLToPath } from "node:url";

// Keep construction separate from execution: tests can choose a temporary
// destination and provide one explicitly selected compiler.
export const compile = (
  outfile: string,
): ReturnType<typeof Command.CompileExecutable.compileExecutable<"hashed">> =>
  Command.CompileExecutable.compileExecutable({
    entrypoints: [fileURLToPath(new URL("./main.ts", import.meta.url))],
    outfile,
    observation: "hashed",
    options: { minify: true },
  });

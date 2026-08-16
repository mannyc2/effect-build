const mode = Deno.args[0];
const entrypoint = Deno.args[1];
if (entrypoint === undefined) throw new Error("entrypoint argument required");

if (mode === "success") {
  const outputDir = Deno.args[2];
  if (outputDir === undefined) throw new Error("output directory argument required");
  const memory = await Deno.bundle({ entrypoints: [entrypoint], write: false, platform: "deno" });
  const written = await Deno.bundle({ entrypoints: [entrypoint], outputDir, write: true, platform: "deno" });
  console.log(`EFFECT_BUILD_DENO_HOST_RECEIPT=${JSON.stringify({
    runtime: Deno.version.deno,
    memory: {
      success: memory.success,
      errors: memory.errors,
      warnings: memory.warnings,
      outputs: memory.outputFiles?.map((file) => ({ path: file.path, hash: file.hash, bytes: file.contents?.byteLength })),
    },
    written: {
      success: written.success,
      errors: written.errors,
      warnings: written.warnings,
      outputs: written.outputFiles?.map((file) => ({ path: file.path, hash: file.hash, bytes: file.contents?.byteLength })),
    },
    cancellationHandle: false,
  })}`);
} else if (mode === "permission") {
  try {
    await Deno.bundle({ entrypoints: [entrypoint], write: false });
    console.log("EFFECT_BUILD_DENO_PERMISSION_RECEIPT=unexpected-success");
  } catch (error) {
    console.log(`EFFECT_BUILD_DENO_PERMISSION_RECEIPT=${JSON.stringify({
      name: error instanceof Error ? error.name : "Unknown",
      message: String(error),
    })}`);
  }
} else {
  throw new Error(`unknown mode: ${mode}`);
}

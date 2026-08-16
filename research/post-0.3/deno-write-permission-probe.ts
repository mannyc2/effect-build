const entrypoint = Deno.args[0];
const outputPath = Deno.args[1];
if (entrypoint === undefined || outputPath === undefined) {
  throw new Error("entrypoint and output path required");
}
try {
  await Deno.bundle({ entrypoints: [entrypoint], outputPath, write: true });
  console.log("EFFECT_BUILD_DENO_WRITE_PERMISSION_RECEIPT=unexpected-success");
} catch (error) {
  console.log(`EFFECT_BUILD_DENO_WRITE_PERMISSION_RECEIPT=${JSON.stringify({
    name: error instanceof Error ? error.name : "Unknown",
    message: String(error),
  })}`);
}

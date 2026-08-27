import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as Nfpm from "../../packages/effect-build-nfpm/src/Package.js";
import { requiredEnvironment, requiredExecutable } from "./acceptance-support.js";

const nfpm = requiredExecutable("EFFECT_BUILD_NFPM_BIN");
const outdir = requiredEnvironment("EFFECT_BUILD_ACCEPTANCE_OUTDIR");
const format = Schema.decodeUnknownSync(Nfpm.Format)(requiredEnvironment("EFFECT_BUILD_NFPM_FORMAT"));

const extension: Readonly<Record<Nfpm.Format, string>> = {
  deb: ".deb",
  rpm: ".rpm",
  apk: ".apk",
  archlinux: ".pkg.tar.zst",
  msix: ".msix",
};

const operation: Readonly<
  Record<Nfpm.Format, (input: Nfpm.PackageInput) => Effect.Effect<unknown, unknown, Nfpm.Packager>>
> = {
  deb: Nfpm.buildDeb,
  rpm: Nfpm.buildRpm,
  apk: Nfpm.buildApk,
  archlinux: Nfpm.buildArchLinux,
  msix: Nfpm.buildMsix,
};

describe("real nFPM 2.47.0 package acceptance", () => {
  it(`builds the ${format} cell for an independent clean-install oracle`, async () => {
    if (format === "msix") throw new Error("the MSIX cell belongs to windows-msix-real.test.ts");
    await mkdir(outdir, { recursive: true });
    const payload = join(outdir, "effect-build-acceptance");
    await writeFile(payload, "#!/bin/sh\nprintf 'effect-build-package-ok\\n'\n");
    await chmod(payload, 0o755);
    const payloadBytes = await readFile(payload);
    const outfile = join(outdir, `effect-build-acceptance${extension[format]}`);
    const input = new Nfpm.PackageInput({
      metadata: new Nfpm.PackageMetadata({
        name: "effect-build-acceptance",
        version: "1.2.3",
        architecture: "amd64",
        maintainer: "effect-build acceptance <acceptance@example.test>",
        description: "effect-build nFPM clean-install acceptance fixture",
        license: "MIT",
        contents: [
          new Nfpm.PackageContent({
            artifact: {
              path: payload,
              bytes: payloadBytes.byteLength,
              sha256: createHash("sha256").update(payloadBytes).digest("hex"),
            },
            dst: "/usr/bin/effect-build-acceptance",
            mode: 493,
          }),
        ],
      }),
      release: "1",
      mtime: "2009-11-10T23:00:00Z",
      outfile,
    });
    const artifact = await Effect.runPromise(
      operation[format](input).pipe(
        Effect.provide(Nfpm.layer({ executable: nfpm })),
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<{
        readonly path: string;
        readonly bytes: number;
        readonly sha256: string;
        readonly tool: { readonly name: string; readonly version: string };
      }>,
    );
    expect(artifact.path).toBe(outfile);
    expect(artifact.tool).toEqual({ name: "nfpm", version: "2.47.0" });
    const packageBytes = await readFile(outfile);
    expect(artifact.bytes).toBe(packageBytes.byteLength);
    expect(artifact.sha256).toBe(createHash("sha256").update(packageBytes).digest("hex"));
  }, 120_000);
});

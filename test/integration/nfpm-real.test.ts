import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as BunCommand from "../../packages/effect-build-bun/src/Command/index.js";
import * as Nfpm from "../../packages/effect-build-nfpm/src/Package.js";
import { finalizedFile } from "../fixtures/finalized-artifacts.js";
import { requiredEnvironment, requiredExecutable } from "./acceptance-support.js";

const nfpm = requiredExecutable("EFFECT_BUILD_NFPM_BIN");
const selectedBun = requiredExecutable("EFFECT_BUILD_BUN");
if (execFileSync(selectedBun, ["--version"], { encoding: "utf8" }).trim() !== "1.3.14") {
  throw new Error("real nFPM compiler composition requires exact Bun 1.3.14");
}
const outdir = requiredEnvironment("EFFECT_BUILD_ACCEPTANCE_OUTDIR");
const format = Schema.decodeUnknownSync(Nfpm.Format)(requiredEnvironment("EFFECT_BUILD_NFPM_FORMAT"));
const nativeDestination = "/usr/lib/effect-build-acceptance/native";

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
    const native = await Effect.runPromise(
      BunCommand.CompileExecutable.compileExecutable({
        entrypoints: [fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url))],
        outfile: join(outdir, "effect-build-acceptance-native"),
        target: "bun-linux-x64",
        observation: "hashed",
      }).pipe(
        Effect.provide(BunCommand.layer({ executable: selectedBun as Artifact.AbsolutePath })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(native).toMatchObject({
      _tag: "HashedExecutable",
      provider: "bun",
      target: "linux-x64-gnu",
      nativeFormat: "elf",
      runtime: { name: "bun", version: "1.3.14" },
    });
    const nativeIdentity = structuredClone(native);
    const nativeBytes = await readFile(native.path);
    expect(createHash("sha256").update(nativeBytes).digest("hex")).toBe(native.digest.value);
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
            artifact: await finalizedFile(payload),
            dst: "/usr/bin/effect-build-acceptance",
            mode: Artifact.fileMode(493),
          }),
          new Nfpm.PackageContent({
            artifact: native,
            dst: nativeDestination,
            mode: Artifact.fileMode(493),
          }),
        ],
      }),
      release: "1",
      mtime: "2009-11-10T23:00:00Z",
      outfile,
    });
    expect(input.metadata.contents[1]?.artifact).toBe(native);
    const artifact = await Effect.runPromise(
      operation[format](input).pipe(
        Effect.provide(Nfpm.layer({ executable: nfpm })),
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<{
        readonly path: string;
        readonly bytes: string;
        readonly digest: { readonly value: string };
        readonly provenance: Artifact.Provenance;
      }>,
    );
    expect(artifact.path).toBe(outfile);
    expect(artifact.provenance).toMatchObject({
      name: "nfpm",
      participants: [{ name: "nfpm", version: "2.47.0" }],
    });
    const packageBytes = await readFile(outfile);
    expect(artifact.bytes).toBe(String(packageBytes.byteLength));
    expect(artifact.digest.value).toBe(createHash("sha256").update(packageBytes).digest("hex"));
    expect(native).toEqual(nativeIdentity);
    expect((await readFile(native.path)).equals(nativeBytes)).toBe(true);
    await writeFile(`${outfile}.native.sha256`, `${native.digest.value}  ${nativeDestination}\n`);
  }, 120_000);
});

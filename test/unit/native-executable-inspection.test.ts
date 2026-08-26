import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as BunExecutable from "../../packages/effect-build-bun/src/internal/Executable.js";
import * as DenoExecutable from "../../packages/effect-build-deno/src/internal/Executable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";
import type { SystemTarget } from "../../packages/effect-build/src/SystemTarget.js";

type Provider = "bun" | "deno";

const elf = (interpreter?: string): Uint8Array => {
  const encoded = interpreter === undefined ? undefined : new TextEncoder().encode(`${interpreter}\0`);
  const bytes = new Uint8Array(120 + (encoded?.byteLength ?? 0));
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, 62, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, 1, true);
  view.setUint32(64, encoded === undefined ? 1 : 3, true);
  if (encoded !== undefined) {
    view.setBigUint64(72, 120n, true);
    view.setBigUint64(96, BigInt(encoded.byteLength), true);
    bytes.set(encoded, 120);
  }
  return bytes;
};

const inspect = (provider: Provider, path: AbsolutePath, target: SystemTarget) =>
  provider === "bun"
    ? BunExecutable.inspect(path, "bun", "1.3.14", target)
    : DenoExecutable.inspect(path, "2.9.5", target);

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) throw new Error("expected native inspection failure");
  const failure = Cause.findErrorOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "None") throw new Error("expected typed native inspection failure");
  return failure.value;
};

describe("Bun and Deno native executable inspection", () => {
  for (const provider of ["bun", "deno"] as const) {
    it(`${provider} rejects Linux artifacts whose ABI is absent or unknown`, async () => {
      const root = await mkdtemp(join(tmpdir(), `effect-build-${provider}-abi-`));
      try {
        for (
          const [name, interpreter] of [
            ["static", undefined],
            ["unknown", "/lib64/ld-unknown-x86-64.so.1"],
          ] as const
        ) {
          const path = join(root, name) as AbsolutePath;
          await writeFile(path, elf(interpreter));
          await chmod(path, 0o755);
          const exit = await Effect.runPromiseExit(
            inspect(provider, path, "linux-x64-gnu").pipe(Effect.provide(NodeServices.layer)),
          );
          expect(errorOf(exit)).toMatchObject({
            _tag: "NativeExecutableInspectionFailed",
            reason: "native-target-does-not-match-request",
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it(`${provider} requires the observed Linux ABI to equal the requested ABI`, async () => {
      const root = await mkdtemp(join(tmpdir(), `effect-build-${provider}-abi-`));
      try {
        for (
          const [name, interpreter, target] of [
            ["gnu", "/lib64/ld-linux-x86-64.so.2", "linux-x64-gnu"],
            ["musl", "/lib/ld-musl-x86_64.so.1", "linux-x64-musl"],
          ] as const
        ) {
          const path = join(root, name) as AbsolutePath;
          await writeFile(path, elf(interpreter));
          await chmod(path, 0o755);
          const matching = await Effect.runPromiseExit(
            inspect(provider, path, target).pipe(Effect.provide(NodeServices.layer)),
          );
          expect(Exit.isSuccess(matching)).toBe(true);

          const mismatched = await Effect.runPromiseExit(
            inspect(
              provider,
              path,
              target === "linux-x64-gnu" ? "linux-x64-musl" : "linux-x64-gnu",
            ).pipe(Effect.provide(NodeServices.layer)),
          );
          expect(errorOf(mismatched)).toMatchObject({
            _tag: "NativeExecutableInspectionFailed",
            reason: "native-target-does-not-match-request",
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as Executable from "effect-build/Executable";
import { chmod, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { elf, thinMacho, fatMacho, pe } from "../fixtures/native-executable.js";

const changed = (source: Uint8Array, update: (view: DataView) => void): Uint8Array => {
  const bytes = Uint8Array.from(source);
  update(new DataView(bytes.buffer));
  return bytes;
};

const fixtures = [
  ["glibc x64", elf("/lib64/ld-linux-x86-64.so.2"), { format: "elf", os: "linux", arch: "x64", abi: "gnu" }, "linux-x64"],
  ["glibc arm64", elf("/lib/ld-linux-aarch64.so.1", 183), { format: "elf", os: "linux", arch: "arm64", abi: "gnu" }, "linux-arm64"],
  ["musl x64", elf("/lib/ld-musl-x86_64.so.1"), { format: "elf", os: "linux", arch: "x64", abi: "musl" }, "linux-x64-musl"],
  ["musl arm64", elf("/lib/ld-musl-aarch64.so.1", 183), { format: "elf", os: "linux", arch: "arm64", abi: "musl" }, "linux-arm64-musl"],
  ["Mach-O x64", thinMacho(0x01000007), { format: "mach-o", os: "darwin", arch: "x64" }, "darwin-x64"],
  ["Mach-O arm64", thinMacho(0x0100000c), { format: "mach-o", os: "darwin", arch: "arm64" }, "darwin-arm64"],
  ["fat Mach-O x64", fatMacho([0x01000007]), { format: "mach-o", os: "darwin", arch: "x64" }, "darwin-x64"],
  ["PE x64", pe(0x8664), { format: "pe", os: "windows", arch: "x64" }, "windows-x64"],
  ["PE arm64", pe(0xaa64), { format: "pe", os: "windows", arch: "arm64" }, "windows-arm64"],
] as const;

describe("executable headers", () => {
  it.each(fixtures)("identifies %s and resolves its target", async (_name, bytes, expected, target) => {
    const facts = await Effect.runPromise(Executable.parse(bytes));
    expect(facts).toEqual(expected);
    expect(Executable.matches(facts, target)).toBe(true);
    expect(await Effect.runPromise(Executable.resolveTarget("app", facts))).toBe(target);
  });

  it("accepts static Linux binaries for either ABI and defaults to glibc", async () => {
    const facts = await Effect.runPromise(Executable.parse(elf()));
    expect(facts).toEqual({ format: "elf", os: "linux", arch: "x64" });
    expect(Executable.matches(facts, "linux-x64")).toBe(true);
    expect(Executable.matches(facts, "linux-x64-musl")).toBe(true);
    expect(await Effect.runPromise(Executable.resolveTarget("app", facts))).toBe("linux-x64");
    expect(await Effect.runPromise(Executable.resolveTarget("app", facts, "linux-x64-musl"))).toBe("linux-x64-musl");
  });

  it.each(["linux-x64-musl", "linux-arm64", "darwin-x64"] as const)(
    "rejects %s when the header identifies glibc x64",
    async (target) => {
      const facts = await Effect.runPromise(Executable.parse(elf("/lib64/ld-linux-x86-64.so.2")));
      expect(Executable.matches(facts, target)).toBe(false);
      const error = await Effect.runPromise(Executable.resolveTarget("app", facts, target).pipe(Effect.flip));
      expect(error).toMatchObject({ _tag: "ExecutableTargetMismatch", path: "app", expected: target, observed: "linux-x64-gnu" });
    },
  );

  it.each([
    ["short header", new Uint8Array(3), "truncated-header"],
    ["non-native file", new TextEncoder().encode("#!/bin/sh"), "not-a-native-executable"],
    ["invalid ELF class", changed(elf(), (v) => v.setUint8(4, 0)), "invalid-header"],
    ["eight-byte Mach-O", thinMacho().subarray(0, 8), "truncated-header"],
    ["missing Mach-O load commands", thinMacho().subarray(0, 32), "truncated-header"],
    ["missing Mach-O segment payload", thinMacho().subarray(0, 104), "truncated-header"],
    ["missing ELF program-header table", elf().subarray(0, 64), "truncated-header"],
    ["missing ELF interpreter", elf("/lib64/ld-linux-x86-64.so.2").subarray(0, 180), "truncated-header"],
    ["unknown ELF interpreter", elf("/lib/custom-loader.so"), "unsupported-interpreter"],
    ["missing ELF loadable payload", elf().subarray(0, 120), "truncated-header"],
    ["missing PE COFF header", pe().subarray(0, 70), "truncated-header"],
    ["missing PE section payload", pe().subarray(0, 512), "truncated-header"],
    ["PE DLL", changed(pe(), (v) => v.setUint16(86, 0x2002, true)), "invalid-header"],
    ["unsupported ELF machine", elf(undefined, 0), "unsupported-machine"],
    ["missing ELF program headers", changed(elf(), (v) => v.setUint16(56, 0, true)), "invalid-header"],
    ["overflowing ELF offset", changed(elf(), (v) => v.setBigUint64(32, 0xffff_ffff_ffff_ffffn, true)), "invalid-header"],
    ["empty fat Mach-O", fatMacho([]), "invalid-header"],
    ["mixed-architecture fat Mach-O", fatMacho([0x01000007, 0x0100000c]), "ambiguous-fat-binary"],
    ["invalid PE signature", changed(pe(0x8664), (v) => v.setUint8(64, 0)), "invalid-header"],
  ] as const)("rejects a %s", async (_name, bytes, reason) => {
    const error = await Effect.runPromise(Executable.parse(bytes).pipe(Effect.flip));
    expect(error).toBeInstanceOf(Executable.ParseError);
    expect(error.reason).toBe(reason);
  });

  it("reads a real file and reports unreadable or malformed files with their path", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-header-"));
    try {
      const path = join(root, "app");
      await writeFile(path, pe(0xaa64));
      expect(await Effect.runPromise(Executable.inspect(path).pipe(Effect.provide(NodeServices.layer)))).toEqual({
        format: "pe", os: "windows", arch: "arm64",
      });
      const missing = join(root, "missing");
      const unreadable = await Effect.runPromise(Executable.inspect(missing).pipe(Effect.flip, Effect.provide(NodeServices.layer)));
      expect(unreadable).toMatchObject({ _tag: "ExecutableInspectError", path: missing, reason: "unreadable" });
      await writeFile(path, new Uint8Array(3));
      const malformed = await Effect.runPromise(Executable.inspect(path).pipe(Effect.flip, Effect.provide(NodeServices.layer)));
      expect(malformed).toMatchObject({ _tag: "ExecutableInspectError", path, reason: "truncated-header" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("inspects metadata near the end of a large sparse file without buffering its payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-sparse-header-"));
    try {
      const path = join(root, "app"), bytes = elf("/lib64/ld-linux-x86-64.so.2");
      const offset = 512 * 1024 * 1024, view = new DataView(bytes.buffer);
      view.setBigUint64(128, BigInt(offset), true);
      const handle = await open(path, "w");
      try {
        await handle.write(bytes.subarray(0, 176));
        await handle.write(bytes.subarray(176), 0, bytes.length - 176, offset);
      } finally { await handle.close(); }
      expect(await Effect.runPromise(Executable.inspect(path).pipe(Effect.provide(NodeServices.layer)))).toEqual({ format: "elf", os: "linux", arch: "x64", abi: "gnu" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("re-reads the header when an executable passes through expectTarget", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-target-"));
    try {
      const path = join(root, "app");
      await writeFile(path, thinMacho(0x01000007));
      await chmod(path, 0o755);
      const artifact = await Effect.runPromise(
        Artifact.executable(path, { name: "fixture", version: "1.0.0" }).pipe(Effect.provide(NodeServices.layer)),
      );
      const check = Effect.succeed(artifact).pipe(Executable.expectTarget("darwin-x64"), Effect.provide(NodeServices.layer));
      expect(await Effect.runPromise(check)).toBe(artifact);
      await writeFile(path, thinMacho(0x0100000c));
      const error = await Effect.runPromise(check.pipe(Effect.flip));
      expect(error).toMatchObject({ _tag: "ExecutableTargetMismatch", path, expected: "darwin-x64", observed: "darwin-arm64" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const { packageCoordinates, parseDenortChecksum } = await import(resolve("scripts/install-provider-fixture.mjs")) as {
  readonly packageCoordinates: (name: string, platform: string, arch: string) => {
    readonly packageName: string;
    readonly relativeExecutable: string;
  };
  readonly parseDenortChecksum: (text: string, filename: string) => string;
};

describe("native provider fixture installation", () => {
  it.each([
    ["deno", "darwin", "x64", "@deno/darwin-x64", "deno"],
    ["deno", "darwin", "arm64", "@deno/darwin-arm64", "deno"],
    ["deno", "linux", "x64", "@deno/linux-x64-glibc", "deno"],
    ["deno", "linux", "arm64", "@deno/linux-arm64-glibc", "deno"],
    ["deno", "win32", "x64", "@deno/win32-x64", "deno.exe"],
    ["deno", "win32", "arm64", "@deno/win32-arm64", "deno.exe"],
    ["bun", "darwin", "x64", "@oven/bun-darwin-x64", "bin/bun"],
    ["bun", "darwin", "arm64", "@oven/bun-darwin-aarch64", "bin/bun"],
    ["bun", "linux", "x64", "@oven/bun-linux-x64", "bin/bun"],
    ["bun", "linux", "arm64", "@oven/bun-linux-aarch64", "bin/bun"],
    ["bun", "win32", "x64", "@oven/bun-windows-x64", "bin/bun.exe"],
    ["bun", "win32", "arm64", "@oven/bun-windows-aarch64", "bin/bun.exe"],
    ["esbuild", "darwin", "x64", "@esbuild/darwin-x64", "bin/esbuild"],
    ["esbuild", "darwin", "arm64", "@esbuild/darwin-arm64", "bin/esbuild"],
    ["esbuild", "linux", "x64", "@esbuild/linux-x64", "bin/esbuild"],
    ["esbuild", "linux", "arm64", "@esbuild/linux-arm64", "bin/esbuild"],
    ["esbuild", "win32", "x64", "@esbuild/win32-x64", "esbuild.exe"],
    ["esbuild", "win32", "arm64", "@esbuild/win32-arm64", "esbuild.exe"],
  ])("maps %s %s %s to its published native package", (name, platform, arch, packageName, relativeExecutable) => {
    expect(packageCoordinates(name, platform, arch)).toEqual({ packageName, relativeExecutable });
  });

  it("accepts the actual Unix and Windows release checksum formats", () => {
    expect(parseDenortChecksum(
      "f6ae578826a67390ca6b6181a8ce385dec0ada0f5601cdbe16c0f8c657152507  denort-x86_64-unknown-linux-gnu.zip\n",
      "denort-x86_64-unknown-linux-gnu.zip",
    )).toBe("f6ae578826a67390ca6b6181a8ce385dec0ada0f5601cdbe16c0f8c657152507");
    expect(parseDenortChecksum(
      "\r\nAlgorithm : SHA256\r\nHash      : 2C3447443ECABAF63B4D21EF3C472B8DC3475BE8D188ED8A60A012854C801C0B\r\nPath      : C:\\a\\deno\\deno\\target\\release\\denort-x86_64-pc-windows-msvc.zip\r\n\r\n",
      "denort-x86_64-pc-windows-msvc.zip",
    )).toBe("2c3447443ecabaf63b4d21ef3c472b8dc3475be8d188ed8a60a012854c801c0b");
  });

  it("refuses other files, algorithms, malformed hashes, and extra checksum entries", () => {
    const filename = "denort-x86_64-pc-windows-msvc.zip";
    const digest = "a".repeat(64);
    for (
      const text of [
        `${digest}  wrong.zip`,
        `${digest}  ../${filename}`,
        `${digest}  ${filename}\n${digest}  other.zip`,
        `${"a".repeat(63)}  ${filename}`,
        `Algorithm : SHA512\nHash : ${digest}\nPath : C:\\a\\${filename}`,
        `Algorithm : SHA256\nHash : ${digest}\nPath : C:\\a\\wrong.zip`,
        `Algorithm : SHA256\nHash : ${digest}\nPath : ${filename}`,
        `Algorithm : SHA256\nHash : ${digest}\nHash : ${digest}\nPath : C:\\a\\${filename}`,
      ]
    ) expect(() => parseDenortChecksum(text, filename)).toThrow(/checksum or archive filename/u);
    expect(() => packageCoordinates("deno", "freebsd", "x64")).toThrow(/no fixture package mapping/u);
    expect(() => packageCoordinates("deno", "linux", "riscv64")).toThrow(/no fixture package mapping/u);
  });
});

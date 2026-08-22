import { Effect, Schema } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { describe, expect, it } from "vitest";
import * as Tool from "../../packages/effect-build/src/Author/Tool.js";
import * as Matrix from "../../packages/effect-build/src/Matrix.js";
import * as SystemTarget from "../../packages/effect-build/src/SystemTarget.js";

describe("v0.4 frozen primitives", () => {
  it("exposes the exact SystemTarget runtime surface and vocabulary", () => {
    expect(Object.keys(SystemTarget).sort()).toEqual(["Abi", "Architecture", "OperatingSystem", "SystemTarget"]);
    expect(SystemTarget.OperatingSystem.literals).toEqual(["macos", "linux", "windows"]);
    expect(SystemTarget.Architecture.literals).toEqual(["x64", "aarch64"]);
    expect(SystemTarget.Abi.literals).toEqual(["gnu", "musl"]);
    expect(SystemTarget.SystemTarget.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "linux-aarch64-musl",
      "windows-x64",
      "windows-aarch64",
    ]);

    const decodeTarget = Schema.decodeUnknownSync(SystemTarget.SystemTarget);
    expect(decodeTarget("linux-aarch64-musl")).toBe("linux-aarch64-musl");
    expect(() => decodeTarget("linux-arm64-musl")).toThrow();
    expect(() => decodeTarget("browser")).toThrow();
  });

  it("exposes only the frozen outer InvalidInput tag at Matrix runtime", () => {
    expect(Object.keys(Matrix)).toEqual(["InvalidInput"]);
    expect(new Matrix.InvalidInput({})._tag).toBe("InvalidInput");
  });

  it("keeps Tool scalars canonical and unbounded", () => {
    expect(Object.keys(Tool).sort()).toEqual(["decimalBytes", "define", "sha256Digest"]);
    expect(Tool.decimalBytes("0")).toBe("0");
    expect(Tool.decimalBytes("1234567890123456789012345678901234567890")).toBe(
      "1234567890123456789012345678901234567890",
    );
    for (const invalid of ["", "00", "01", "-1", "+1", "1.0", " 1"]) {
      expect(() => Tool.decimalBytes(invalid)).toThrow(TypeError);
    }

    const value = "0123456789abcdef".repeat(4);
    expect(Tool.sha256Digest(value)).toEqual({ algorithm: "sha256", value });
    for (const invalid of [value.slice(1), `${value}0`, value.toUpperCase(), `sha256:${value}`]) {
      expect(() => Tool.sha256Digest(invalid)).toThrow(TypeError);
    }
  });

  it("accepts an external structural Tool definition without adding core identity", () => {
    const definition: Tool.Definition<"fixture", { readonly target: string }, "Unsupported"> = {
      observation: {
        name: "fixture",
        participants: [{
          role: "compiler",
          name: "fixture",
          version: "1.0.0",
          revision: "fixture-r1",
          channel: "selected-command",
          content: {
            digest: Tool.sha256Digest("a".repeat(64)),
            bytes: Tool.decimalBytes("42"),
          },
        }],
        capabilities: [{ _tag: "Present", id: "compileExecutable", evidence: "fixture" }],
      },
      evaluate: () => Effect.succeed({ _tag: "ReviewedAdmission", admissionKey: "admission:fixture" }),
      command: (argv, options) => ChildProcess.make("/fixture/compiler", argv, options),
    };

    const defined = Tool.define(definition);
    expect(defined).toBe(definition);
    expect(Object.isFrozen(defined)).toBe(true);
    expect(Object.isFrozen(defined.observation)).toBe(false);
    const command = defined.command(["build", "main.ts"], { cwd: "/fixture/project" });
    expect(ChildProcess.isStandardCommand(command)).toBe(true);
    if (ChildProcess.isStandardCommand(command)) {
      expect(command.command).toBe("/fixture/compiler");
      expect(command.args).toEqual(["build", "main.ts"]);
      expect(command.options.cwd).toBe("/fixture/project");
    }
  });
});

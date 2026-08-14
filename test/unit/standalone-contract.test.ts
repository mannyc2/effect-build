import { Context, Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { targetTokens as bunTargetTokens } from "../../packages/effect-build-bun/src/Adapter.js";
import {
  definition as denoDefinition,
  targetTokens as denoTargetTokens,
} from "../../packages/effect-build-deno/src/Adapter.js";
import type { TargetFor } from "../../packages/effect-build/src/Provider.js";
import { Artifact } from "../../packages/effect-build/src/standalone/Artifact.js";
import {
  BuildError,
  InvalidDriverOptions,
  OutputInvalid,
  OutputLocked,
  OutputMissing,
  PublicationFailed,
  TargetUnsupported,
  ToolFailed,
  ToolNotFound,
  ToolProbeFailed,
} from "../../packages/effect-build/src/standalone/BuildError.js";
import { makeCompileExecutable } from "../../packages/effect-build/src/standalone/CompileExecutable.js";
import type { CompileExecutableInput, CompilerService } from "../../packages/effect-build/src/standalone/Driver.js";
import type {
  PreparedExecutableRequest,
  ProviderArtifact,
} from "../../packages/effect-build/src/standalone/internal/CompilerAdapter.js";
import {
  inspectNativeExecutable,
  inspectNativeExecutableChunks,
  NativeExecutableRangeRequired,
} from "../../packages/effect-build/src/standalone/internal/NativeExecutable.js";
import { descriptorOf } from "../../packages/effect-build/src/standalone/internal/TargetCatalog.js";
import {
  makeProviderTargetTable,
  makeTargetTable,
} from "../../packages/effect-build/src/standalone/internal/TargetTable.js";
import { Target } from "../../packages/effect-build/src/standalone/Target.js";

const _bunMuslTarget: BunTarget = "linux-x64-musl";
void _bunMuslTarget;
// @ts-expect-error Bun 1.3.9's ARM64 musl artifact has contradictory GLIBC dependencies.
const _rejectBunArm64MuslTarget: BunTarget = "linux-aarch64-musl";
void _rejectBunArm64MuslTarget;
// @ts-expect-error Bun 1.3.9 has no downloadable Windows ARM64 runtime.
const _rejectBunWindowsArm64Target: BunTarget = "windows-aarch64";
void _rejectBunWindowsArm64Target;
// @ts-expect-error Deno's package-private target type deliberately excludes musl.
const _denoMuslTarget: DenoTarget = "linux-x64-musl";
void _denoMuslTarget;
const _rejectDenoMuslAtAdapterBoundary = () => {
  const options = denoDefinition.validateOptions(undefined);
  if (options._tag !== "Valid") throw new Error(options.reason);
  return denoDefinition.renderArgv({
    input: {
      entrypoint: "main.ts",
      // @ts-expect-error The private Deno adapter boundary must reject root-only musl targets.
      target: "linux-x64-musl",
      options: options.value,
    },
    nativeTarget: "x86_64-unknown-linux-gnu",
    stagedOutfile: "/tmp/app",
  });
};
void _rejectDenoMuslAtAdapterBoundary;

const assertPreparedExecutableRequestNarrowing = (
  request: PreparedExecutableRequest<Record<string, never>, BunTarget>,
): void => {
  void request.entrypoint;
  void request.target;
  void request.options;
  void request.stagedOutfile;
  // @ts-expect-error Final outfile is lifecycle-owned, not adapter-visible.
  void request.outfile;
  void request.cwd;
  // @ts-expect-error Digest policy is lifecycle-owned, not adapter-visible.
  void request.digest;
  void request.resolvedDestination;
};
void assertPreparedExecutableRequestNarrowing;

const decodeTarget = Schema.decodeUnknownSync(Target);
const decodeArtifact = Schema.decodeUnknownSync(Artifact);
const encodeArtifact = Schema.encodeSync(Artifact);
const decodeError = Schema.decodeUnknownSync(BuildError);
const encodeError = Schema.encodeSync(BuildError);

const canonicalTargets = [
  "macos-x64",
  "macos-aarch64",
  "linux-x64-gnu",
  "linux-x64-musl",
  "linux-aarch64-gnu",
  "linux-aarch64-musl",
  "windows-x64",
  "windows-aarch64",
] as const;

const validArtifact = {
  path: "/work/dist/app",
  bytes: 12_345,
  digest: `sha256:${"a".repeat(64)}`,
  target: "macos-aarch64",
  provider: "bun",
  stages: [{
    operation: "compile-executable",
    tool: { name: "bun", version: "1.3.9", path: "/usr/local/bin/bun" },
  }],
};

const fatMacho = (
  byteOrder: "big" | "little",
  cpuTypes: readonly number[],
): Uint8Array => {
  const bytes = new Uint8Array(8 + cpuTypes.length * 20);
  const view = new DataView(bytes.buffer);
  const little = byteOrder === "little";
  bytes.set(little ? [0xbe, 0xba, 0xfe, 0xca] : [0xca, 0xfe, 0xba, 0xbe], 0);
  view.setUint32(4, cpuTypes.length, little);
  for (let index = 0; index < cpuTypes.length; index++) {
    view.setUint32(8 + index * 20, cpuTypes[index]!, little);
  }
  return bytes;
};

describe("standalone contract: target and artifact", () => {
  it("derives each provider target schema and native token from one ordered table", () => {
    const bunEntries = [
      ["macos-x64", "bun-darwin-x64"],
      ["macos-aarch64", "bun-darwin-arm64"],
      ["linux-x64-gnu", "bun-linux-x64"],
      ["linux-x64-musl", "bun-linux-x64-musl"],
      ["linux-aarch64-gnu", "bun-linux-arm64"],
      ["windows-x64", "bun-windows-x64"],
    ] as const;
    const denoEntries = [
      ["macos-x64", "x86_64-apple-darwin"],
      ["macos-aarch64", "aarch64-apple-darwin"],
      ["linux-x64-gnu", "x86_64-unknown-linux-gnu"],
      ["linux-aarch64-gnu", "aarch64-unknown-linux-gnu"],
      ["windows-x64", "x86_64-pc-windows-msvc"],
      ["windows-aarch64", "aarch64-pc-windows-msvc"],
    ] as const;

    expect(bunTargetTable.Target.literals).toEqual(bunEntries.map(([target]) => target));
    expect(denoTargetTable.Target.literals).toEqual(denoEntries.map(([target]) => target));
    expect(canonicalTargets.map((target) => [target, descriptorOf(target)])).toEqual([
      ["macos-x64", { os: "macos", architecture: "x64", executableSuffix: "" }],
      ["macos-aarch64", { os: "macos", architecture: "aarch64", executableSuffix: "" }],
      ["linux-x64-gnu", { os: "linux", architecture: "x64", abi: "gnu", executableSuffix: "" }],
      ["linux-x64-musl", { os: "linux", architecture: "x64", abi: "musl", executableSuffix: "" }],
      ["linux-aarch64-gnu", { os: "linux", architecture: "aarch64", abi: "gnu", executableSuffix: "" }],
      ["linux-aarch64-musl", { os: "linux", architecture: "aarch64", abi: "musl", executableSuffix: "" }],
      ["windows-x64", { os: "windows", architecture: "x64", executableSuffix: ".exe" }],
      ["windows-aarch64", { os: "windows", architecture: "aarch64", executableSuffix: ".exe" }],
    ]);
    for (const [target, token] of bunEntries) {
      expect(bunTargetTable.resolve(target)).toBe(target);
      expect(bunTargetTable.nativeToken(target)).toBe(token);
    }
    for (const [target, token] of denoEntries) {
      expect(denoTargetTable.resolve(target)).toBe(target);
      expect(denoTargetTable.nativeToken(target)).toBe(token);
    }
    expect(bunTargetTable.resolve("not-a-target")).toBeUndefined();
    expect(bunTargetTable.resolve("linux-aarch64-musl")).toBeUndefined();
    expect(bunTargetTable.resolve("windows-aarch64")).toBeUndefined();
    expect(denoTargetTable.resolve("linux-x64-musl")).toBeUndefined();
    expect(denoTargetTable.resolve(null)).toBeUndefined();
  });

  it("rejects malformed target tables at their construction boundary", () => {
    const unsafeMake = makeTargetTable as (entries: Readonly<Record<string, string>>) => unknown;
    expect(() => unsafeMake({})).toThrow("target table must not be empty");
    expect(() => unsafeMake({ "not-a-target": "native" })).toThrow("unknown canonical target");
    expect(() => unsafeMake({ "macos-x64": "" })).toThrow("native target token must be non-empty");
  });

  it("inspects a valid ELF whose program headers are stored in a distant range", () => {
    const header = new Uint8Array(64);
    header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
    header.set([0x3e, 0x00], 18);
    new DataView(header.buffer).setBigUint64(32, 2_000_000n, true);
    new DataView(header.buffer).setUint16(54, 56, true);
    new DataView(header.buffer).setUint16(56, 1, true);

    const programHeader = new Uint8Array(56);
    new DataView(programHeader.buffer).setUint32(0, 3, true);
    new DataView(programHeader.buffer).setBigUint64(8, 128n, true);
    new DataView(programHeader.buffer).setBigUint64(32, 28n, true);
    const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
    const chunks = [
      { offset: 0, bytes: header },
      { offset: 128, bytes: interpreter },
      { offset: 2_000_000, bytes: programHeader },
    ];

    expect(() => inspectNativeExecutableChunks(2_000_056, [chunks[0]!])).toThrow(NativeExecutableRangeRequired);
    expect(inspectNativeExecutableChunks(2_000_056, chunks)).toEqual({
      format: "elf",
      os: "linux",
      architecture: "x64",
      abi: "gnu",
    });
  });

  it("rejects ELF ranges beyond the artifact and oversized interpreters", () => {
    const elf = new Uint8Array(64);
    elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
    elf.set([0x3e, 0x00], 18);
    new DataView(elf.buffer).setBigUint64(32, 64n, true);
    new DataView(elf.buffer).setUint16(54, 56, true);
    new DataView(elf.buffer).setUint16(56, 1, true);
    expect(() => inspectNativeExecutable(elf)).toThrow("truncated-header");

    const programHeader = new Uint8Array(56);
    new DataView(programHeader.buffer).setUint32(0, 3, true);
    new DataView(programHeader.buffer).setBigUint64(8, 120n, true);
    new DataView(programHeader.buffer).setBigUint64(32, 4097n, true);
    expect(() =>
      inspectNativeExecutableChunks(5_000, [{ offset: 0, bytes: elf }, { offset: 64, bytes: programHeader }])
    ).toThrow("invalid-interpreter");
  });

  it("decodes a standard big-endian FAT_MAGIC Mach-O with one x64 slice", () => {
    expect(inspectNativeExecutable(fatMacho("big", [0x01000007]))).toEqual({
      format: "macho",
      os: "macos",
      architecture: "x64",
    });
  });

  it("decodes a byte-swapped FAT_CIGAM Mach-O with one aarch64 slice", () => {
    expect(inspectNativeExecutable(fatMacho("little", [0x0100000c]))).toEqual({
      format: "macho",
      os: "macos",
      architecture: "aarch64",
    });
  });

  it("retains the explicit ambiguity rejection for a universal x64 and aarch64 Mach-O", () => {
    expect(() => inspectNativeExecutable(fatMacho("big", [0x01000007, 0x0100000c])))
      .toThrow("ambiguous-fat-architecture");
  });

  it("rejects a fat Mach-O whose slices have only unknown CPU types", () => {
    expect(() => inspectNativeExecutable(fatMacho("big", [0x12345678])))
      .toThrow("ambiguous-fat-architecture");
  });

  it("accepts every canonical target", () => {
    for (const target of canonicalTargets) {
      expect(decodeTarget(target)).toBe(target);
    }
  });

  it("rejects tool-specific and malformed target spellings", () => {
    for (
      const target of [
        "bun-darwin-arm64",
        "aarch64-apple-darwin",
        "linux-x64",
        "macos-x64-gnu",
        "windows-x64-msvc",
        "",
      ]
    ) {
      expect(() => decodeTarget(target)).toThrow();
    }
  });

  it("round trips a full artifact through JSON", () => {
    const decoded = decodeArtifact(validArtifact);
    expect(encodeArtifact(decoded)).toEqual(validArtifact);
    expect(JSON.parse(JSON.stringify(encodeArtifact(decoded)))).toEqual(validArtifact);
  });

  it("accepts all 12 provider-correlated target pairs and rejects every narrowed impossible pair", () => {
    const providerTargets = [
      ["bun", bunTargetTable.Target.literals],
      ["deno", denoTargetTable.Target.literals],
    ] as const;

    for (const [name, targets] of providerTargets) {
      for (const target of targets) {
        expect(decodeArtifact({
          path: `/work/dist/${name}-${target}`,
          bytes: 64,
          provider: name,
          target,
          stages: [{ operation: "compile-executable", tool: { name, version: "1.0.0", path: `/tools/${name}` } }],
        })).toMatchObject({ provider: name, target, stages: [{ tool: { name } }] });
      }
    }

    for (
      const [name, target] of [
        ["deno", "linux-x64-musl"],
        ["deno", "linux-aarch64-musl"],
        ["bun", "linux-aarch64-musl"],
        ["bun", "windows-aarch64"],
      ] as const
    ) {
      expect(() =>
        decodeArtifact({
          path: `/work/dist/${name}-${target}`,
          bytes: 64,
          target,
          tool: { name, version: "1.0.0", path: `/tools/${name}` },
        })
      ).toThrow();
    }
  });

  it("accepts an artifact without a digest", () => {
    const { digest: _digest, ...withoutDigest } = validArtifact;
    const decoded = decodeArtifact(withoutDigest);
    expect(decoded.digest).toBeUndefined();
    expect(Object.hasOwn(encodeArtifact(decoded), "digest")).toBe(false);
  });

  it("rejects relative artifact and tool paths", () => {
    expect(() => decodeArtifact({ ...validArtifact, path: "dist/app" })).toThrow();
    expect(() =>
      decodeArtifact({
        ...validArtifact,
        stages: [{ ...validArtifact.stages[0], tool: { ...validArtifact.stages[0]!.tool, path: "bun" } }],
      })
    ).toThrow();
  });

  it("rejects malformed digests", () => {
    for (
      const digest of [
        "a".repeat(64),
        `sha256:${"a".repeat(63)}`,
        `sha256:${"A".repeat(64)}`,
        `sha512:${"a".repeat(64)}`,
        "sha256:",
      ]
    ) {
      expect(() => decodeArtifact({ ...validArtifact, digest })).toThrow();
    }
  });

  it("rejects unsafe byte counts", () => {
    for (const bytes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => decodeArtifact({ ...validArtifact, bytes })).toThrow();
    }
  });

  it("rejects empty tool versions and unknown tool names", () => {
    expect(() =>
      decodeArtifact({
        ...validArtifact,
        stages: [{ ...validArtifact.stages[0], tool: { ...validArtifact.stages[0]!.tool, version: "" } }],
      })
    ).toThrow();
    expect(() =>
      decodeArtifact({
        ...validArtifact,
        stages: [{ ...validArtifact.stages[0], tool: { ...validArtifact.stages[0]!.tool, name: "node" } }],
      })
    ).toThrow();
  });
});

describe("standalone contract: errors", () => {
  const diagnostics = [{ channel: "stderr", text: "boom", truncated: false }];
  const samples = [
    { _tag: "ToolNotFound", tool: "bun", command: "bun" },
    { _tag: "ToolProbeFailed", tool: "deno", reason: "malformed probe output" },
    { _tag: "ToolFailed", tool: "bun", exitCode: 1, diagnostics },
    {
      _tag: "TargetUnsupported",
      tool: "deno",
      requested: "linux-x64-musl",
      available: ["linux-x64-gnu", "linux-aarch64-gnu"],
    },
    { _tag: "InvalidDriverOptions", tool: "deno", reason: "minify requires bundle" },
    { _tag: "OutputMissing", path: "/work/dist/app" },
    { _tag: "OutputInvalid", path: "/work/dist/app", reason: "abi-unrecognized" },
    { _tag: "OutputLocked", path: "/work/dist/app" },
    { _tag: "PublicationFailed", path: "/work/dist/app", operation: "rename", reason: "EACCES" },
  ] as const;

  it("decodes and encodes every error tag", () => {
    for (const sample of samples) {
      const decoded = decodeError(sample);
      expect(decoded._tag).toBe(sample._tag);
      expect(encodeError(decoded)).toEqual(sample);
    }
  });

  it("constructs every member as a tagged error class", () => {
    const constructed: ReadonlyArray<BuildError> = [
      new ToolNotFound({ tool: "bun", command: "bun" }),
      new ToolProbeFailed({ tool: "deno", reason: "nonzero exit" }),
      new ToolFailed({ tool: "bun", exitCode: 2, diagnostics: [] }),
      new TargetUnsupported({ tool: "deno", requested: "linux-x64-musl", available: [] }),
      new InvalidDriverOptions({ tool: "bun", reason: "unknown option" }),
      new OutputMissing({ path: "/work/dist/app" }),
      new OutputInvalid({ path: "/work/dist/app", reason: "not a regular file" }),
      new OutputLocked({ path: "/work/dist/app" }),
      new PublicationFailed({ path: "/work/dist/app", operation: "rename", reason: "EXDEV" }),
    ];
    const tags = constructed.map((error) => error._tag);
    expect(tags).toEqual(samples.map((sample) => sample._tag));
    for (const error of constructed) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("round trips an unsupported unknown string with provider-derived availability", () => {
    const error = new TargetUnsupported({
      tool: "deno",
      requested: "not-a-canonical-target",
      available: [...denoTargetTable.Target.literals],
    });
    expect(encodeError(error)).toEqual({
      _tag: "TargetUnsupported",
      tool: "deno",
      requested: "not-a-canonical-target",
      available: [...denoTargetTable.Target.literals],
    });
    expect(decodeError(encodeError(error))).toEqual(error);
  });

  it("keeps the union closed and free of interruption", () => {
    expect(() => decodeError({ _tag: "Interrupted" })).toThrow();
    expect(() => decodeError({ _tag: "SomethingElse" })).toThrow();
  });
});

interface BunLikeOptions {
  readonly minify?: boolean;
}

interface DenoLikeOptions {
  readonly permissions?: { readonly all: true };
}

class BunLikeCompiler extends Context.Service<
  BunLikeCompiler,
  CompilerService<"bun", BunTarget, BunLikeOptions>
>()(
  "test/standalone/BunLikeCompiler",
) {}

class DenoLikeCompiler extends Context.Service<
  DenoLikeCompiler,
  CompilerService<"deno", DenoTarget, DenoLikeOptions>
>()(
  "test/standalone/DenoLikeCompiler",
) {}

const fakeService = <const Name extends "bun" | "deno", SupportedTarget extends Target, Options>(
  name: Name,
  defaultTarget: SupportedTarget,
): CompilerService<Name, SupportedTarget, Options> => ({
  compileExecutable: (input: CompileExecutableInput<Options, SupportedTarget>) =>
    Effect.sync(() =>
      decodeArtifact({
        path: `/work/${input.outfile}`,
        bytes: 64,
        ...(input.digest === true ? { digest: `sha256:${"b".repeat(64)}` } : {}),
        target: input.target ?? defaultTarget,
        provider: name,
        stages: [{
          operation: "compile-executable",
          tool: { name, version: "0.0.1", path: `/usr/local/bin/${name}` },
        }],
      }) as ProviderArtifact<Name, SupportedTarget>
    ),
  compileExecutableMatrix: () => Effect.die("unused matrix operation"),
});

const bunLikeCompile = makeCompileExecutable(BunLikeCompiler);
const denoLikeCompile = makeCompileExecutable(DenoLikeCompiler);

describe("standalone contract: driver correlation", () => {
  it("delegates each per-tool operation to exactly its own provided service", () => {
    const artifact = Effect.runSync(
      bunLikeCompile({ entrypoint: "src/main.ts", outfile: "dist/app", options: { minify: true } }).pipe(
        Effect.provideService(BunLikeCompiler, fakeService<"bun", BunTarget, BunLikeOptions>("bun", "macos-aarch64")),
      ),
    );
    expect(artifact.path).toBe("/work/dist/app");
    expect(artifact.provider).toBe("bun");
    expect(artifact.stages[0].tool.name).toBe("bun");
    expect(artifact.digest).toBeUndefined();

    const denoArtifact = Effect.runSync(
      denoLikeCompile({
        entrypoint: "src/main.ts",
        outfile: "dist/app",
        digest: true,
        options: { permissions: { all: true } },
      }).pipe(
        Effect.provideService(
          DenoLikeCompiler,
          fakeService<"deno", DenoTarget, DenoLikeOptions>("deno", "macos-aarch64"),
        ),
      ),
    );
    expect(denoArtifact.provider).toBe("deno");
    expect(denoArtifact.digest).toBe(`sha256:${"b".repeat(64)}`);
  });

  it("propagates typed failures unchanged", () => {
    const failing: CompilerService<"bun", BunTarget, BunLikeOptions> = {
      compileExecutable: () =>
        Effect.fail(
          new ToolFailed({
            tool: "bun",
            exitCode: 3,
            diagnostics: [{ channel: "stderr", text: "error: missing import", truncated: false }],
          }),
        ),
      compileExecutableMatrix: () => Effect.die("unused matrix operation"),
    };
    const exit = Effect.runSyncExit(
      bunLikeCompile({ entrypoint: "src/main.ts", outfile: "dist/app" }).pipe(
        Effect.provideService(BunLikeCompiler, failing),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    let observed: BuildError | undefined;
    Effect.runSync(
      bunLikeCompile({ entrypoint: "src/main.ts", outfile: "dist/app" }).pipe(
        Effect.provideService(BunLikeCompiler, failing),
        Effect.catch((buildError: BuildError) =>
          Effect.sync(() => {
            observed = buildError;
          })
        ),
      ),
    );
    expect(observed?._tag).toBe("ToolFailed");
  });
});
type BunTarget = TargetFor<"bun">;
type DenoTarget = TargetFor<"deno">;
const bunTargetTable = makeProviderTargetTable("bun", bunTargetTokens);
const denoTargetTable = makeProviderTargetTable("deno", denoTargetTokens);

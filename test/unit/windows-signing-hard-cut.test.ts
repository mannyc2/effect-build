import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, Redacted, Schema } from "effect";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Sign from "../../packages/effect-build-windows/src/SignMsix.js";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";
import { installFixtureExecutable } from "../fixtures/tools/install-fixture-executable.js";

const fixture = resolve(
  fileURLToPath(new URL("../fixtures/tools/fake-signtool-hard-cut.mjs", import.meta.url)),
);
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-windows-hard-cut-"));
  executable = await installFixtureExecutable({ fixture, root, name: "signtool" });
});

afterEach(() => {
  delete process.env.FAKE_SIGNTOOL_LOG;
  delete process.env.FAKE_SIGNTOOL_MODE;
  delete process.env.FAKE_SIGNTOOL_VERSION;
  delete process.env.FAKE_SIGNTOOL_VERSION_COLON;
  delete process.env.FAKE_PROJECT_MARKER;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const unsigned = async (name: string): Promise<Artifact.FinalizedFile> => {
  const path = join(root, `${name}-unsigned.msix`);
  const contents = new TextEncoder().encode(`MSIX:${name}\n`);
  await writeFile(path, contents);
  return {
    path,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
};

const input = (
  source: Artifact.FinalizedFile,
  outfile: string,
  overrides: Partial<Sign.SignMsixInput> = {},
) =>
  new Sign.SignMsixInput({
    source,
    outfile: join(root, outfile),
    timestampUrl: "http://timestamp.example.test/rfc3161",
    ...overrides,
  });

const pfx = (password = "pfx-local-secret") =>
  Sign.pfxCredentialLayer({
    file: join(root, "certificate.pfx"),
    password: Redacted.make(password),
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, Sign.Signer>,
  credential: Layer.Layer<Sign.SigningCredential> = pfx(),
  options: Sign.LayerOptions = { executable },
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Sign.layer(options).pipe(Layer.provide(credential))),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const absent = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (error as { readonly code?: string }).code === "ENOENT";
  }
};

const logLines = async (path: string) =>
  (await readFile(path, "utf8")).trim().split("\n").map((line) =>
    JSON.parse(line) as { readonly argv: readonly string[]; readonly cwd: string; readonly marker: string }
  );

describe.sequential("Windows MSIX Authenticode hard cut", () => {
  it("fails layer construction for a missing explicit SignTool", async () => {
    const source = await unsigned("missing-tool");
    const exit = await run(Sign.signMsix(input(source, "missing-tool.msix")), pfx(), {
      executable: join(root, "not-signtool"),
    });
    const failure = failureOf(exit) as { readonly _tag: string; readonly tool: string };
    expect(failure._tag).toBe("ToolNotFound");
    expect(failure.tool).toBe("signtool");
    expect(await absent(join(root, "missing-tool.msix"))).toBe(true);
  });

  it("signs a staged copy with SHA-256 and RFC3161 using the PFX backend, then verifies", async () => {
    const source = await unsigned("pfx");
    const log = join(root, "pfx.log");
    process.env.FAKE_SIGNTOOL_LOG = log;
    process.env.FAKE_PROJECT_MARKER = "preserved";
    process.env.FAKE_SIGNTOOL_VERSION_COLON = "1";
    const exit = await run(
      Sign.signMsix(input(source, "pfx.msix", {
        description: "Fixture Application",
        descriptionUrl: "https://example.test/application",
      })),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toMatchObject({
        _tag: "File",
        path: join(root, "pfx.msix"),
        tool: { name: "signtool", version: "10.0.26100.0" },
      });
      expect(exit.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(await readFile(source.path, "utf8")).toBe("MSIX:pfx\n");
    expect(await readFile(join(root, "pfx.msix"), "utf8"))
      .toContain("AUTHENTICODE-SHA256-RFC3161");

    const invocations = await logLines(log);
    expect(invocations[0]?.argv).toEqual(["/?"]);
    const sign = invocations[1]?.argv ?? [];
    expect(sign.slice(0, 11)).toEqual([
      "sign",
      "/fd",
      "SHA256",
      "/tr",
      "http://timestamp.example.test/rfc3161",
      "/td",
      "SHA256",
      "/d",
      "Fixture Application",
      "/du",
      "https://example.test/application",
    ]);
    expect(sign.slice(11, 15)).toEqual([
      "/f",
      join(root, "certificate.pfx"),
      "/p",
      "pfx-local-secret",
    ]);
    const stagedPath = sign.at(-1) ?? "";
    expect(basename(dirname(stagedPath))).toMatch(/^\.effect-build-/);
    expect(invocations[2]?.argv).toEqual([
      "verify",
      "/pa",
      "/all",
      "/v",
      "/tw",
      sign.at(-1),
    ]);
    expect(invocations[1]?.marker).toBe("preserved");
  });

  it("uses an exact thumbprint with native certificate-store switches", async () => {
    const source = await unsigned("store");
    const log = join(root, "store.log");
    process.env.FAKE_SIGNTOOL_LOG = log;
    const credential = Sign.certificateStoreCredentialLayer(
      new Sign.CertificateStoreOptions({
        thumbprint: "0123456789abcdef0123456789abcdef01234567",
        storeName: "TrustedPeople",
        machineStore: true,
      }),
    );
    const exit = await run(Sign.signMsix(input(source, "store.msix")), credential);
    expect(Exit.isSuccess(exit)).toBe(true);
    const invocations = await logLines(log);
    const sign = invocations.find(({ argv }) => argv[0] === "sign")?.argv ?? [];
    expect(sign.slice(-6, -1)).toEqual([
      "/sm",
      "/s",
      "TrustedPeople",
      "/sha1",
      "0123456789abcdef0123456789abcdef01234567",
    ]);
  });

  it("scrubs PFX secrets from typed native failures and never finalizes", async () => {
    const source = await unsigned("secret-failure");
    const secret = "never-return-this-password";
    process.env.FAKE_SIGNTOOL_MODE = "fail-secret";
    const failure = failureOf(
      await run(Sign.signMsix(input(source, "secret-failure.msix")), pfx(secret)),
    ) as {
      readonly _tag: string;
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
      readonly message: string;
    };
    expect(failure._tag).toBe("ToolFailed");
    expect(failure.exitCode).toBe(31);
    expect(failure.stdout).toBe("native signtool stdout");
    expect(failure.stderr).toContain("<redacted>");
    expect(failure.stderr).not.toContain(secret);
    expect(failure.message).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(await absent(join(root, "secret-failure.msix"))).toBe(true);
  });

  it("preserves verification diagnostics and rejects an unverified staged output", async () => {
    const source = await unsigned("verify-failure");
    process.env.FAKE_SIGNTOOL_MODE = "verify-fail";
    const failure = failureOf(
      await run(Sign.signMsix(input(source, "verify-failure.msix"))),
    ) as { readonly _tag: string; readonly exitCode: number; readonly stderr: string };
    expect(failure).toMatchObject({
      _tag: "ToolFailed",
      exitCode: 32,
      stderr: "native verify stderr",
    });
    expect(await absent(join(root, "verify-failure.msix"))).toBe(true);
  });

  it("treats SignTool timestamp warnings as a failed acceptance", async () => {
    const source = await unsigned("timestamp-warning");
    process.env.FAKE_SIGNTOOL_MODE = "timestamp-warning";
    const failure = failureOf(
      await run(Sign.signMsix(input(source, "timestamp-warning.msix"))),
    ) as { readonly _tag: string; readonly exitCode: number; readonly stderr: string };
    expect(failure).toMatchObject({
      _tag: "ToolFailed",
      exitCode: 2,
      stderr: "signature is not timestamped",
    });
    expect(await absent(join(root, "timestamp-warning.msix"))).toBe(true);
  });

  it("rejects an absent finalized source before signing and cleans private staging", async () => {
    const missing = join(root, "absent-unsigned.msix");
    const failure = failureOf(
      await run(Sign.signMsix(input({ path: missing, bytes: 1, sha256: "0".repeat(64) }, "absent.msix"))),
    ) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("ArtifactVerificationFailed");
    expect(failure.reason).toContain("read");
    expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
  });

  it("rejects malformed signing input at the runtime boundary", async () => {
    const source = await unsigned("invalid-input");
    const destination = join(root, "invalid-input.msix");
    const failure = failureOf(
      await run(Sign.signMsix({
        source,
        outfile: destination,
        timestampUrl: "http://user:secret@timestamp.example.test/?token=secret",
      } as unknown as Sign.SignMsixInput)),
    ) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("SignMsixInputRejected");
    expect(failure.reason).toContain("SignMsixInput schema");
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(await absent(destination)).toBe(true);
  });

  it("rejects parser-invalid HTTPS timestamp authorities before SignTool can run", async () => {
    const source = await unsigned("invalid-urls");
    for (
      const [name, timestampUrl] of [
        ["invalid-host", "https://%"],
        ["invalid-port", "https://example.com:99999"],
      ] as const
    ) {
      const valid = input(source, `${name}.msix`);
      const failure = failureOf(
        await run(Sign.signMsix({ ...valid, timestampUrl } as unknown as Sign.SignMsixInput)),
      ) as { readonly _tag: string; readonly reason: string };
      expect(failure._tag).toBe("SignMsixInputRejected");
      expect(failure.reason).toContain("SignMsixInput schema");
      expect(await absent(valid.outfile)).toBe(true);
    }
  });

  it("keeps the optional artifact description URL HTTPS-only", async () => {
    const source = await unsigned("insecure-description");
    const destination = join(root, "insecure-description.msix");
    const valid = input(source, "insecure-description.msix");
    const failure = failureOf(
      await run(
        Sign.signMsix({ ...valid, descriptionUrl: "http://example.test/application" } as unknown as Sign.SignMsixInput),
      ),
    ) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("SignMsixInputRejected");
    expect(failure.reason).toContain("SignMsixInput schema");
    expect(await absent(destination)).toBe(true);
  });

  it("rejects non-MSIX source and output names before SignTool can run", async () => {
    const source = await unsigned("wrong-extension");
    const destination = join(root, "wrong-extension.bin");
    const failure = failureOf(
      await run(Sign.signMsix(input(source, "wrong-extension.bin"))),
    ) as { readonly _tag: string; readonly reason: string };
    expect(failure).toMatchObject({
      _tag: "SignMsixInputRejected",
      reason: "source and output must both use the .msix extension",
    });
    expect(await absent(destination)).toBe(true);
  });

  it("uses an externally validated SDK file version when SignTool help omits it", async () => {
    const source = await unsigned("explicit-version");
    const log = join(root, "explicit-version.log");
    process.env.FAKE_SIGNTOOL_LOG = log;
    const exit = await run(
      Sign.signMsix(input(source, "explicit-version.msix")),
      pfx(),
      { executable, version: "10.0.26100.8249" },
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value.tool.version).toBe("10.0.26100.8249");
    const invocations = await logLines(log);
    expect(invocations.filter(({ argv }) => argv[0] === "/?")).toHaveLength(0);
    expect(invocations.filter(({ argv }) => argv[0] === "sign")).toHaveLength(1);
    expect(invocations.filter(({ argv }) => argv[0] === "verify")).toHaveLength(1);
  });

  it("probes once, allows an untested SDK with a warning, and always hashes output", async () => {
    const first = await unsigned("once-a");
    const second = await unsigned("once-b");
    const log = join(root, "resolve-once.log");
    process.env.FAKE_SIGNTOOL_LOG = log;
    process.env.FAKE_SIGNTOOL_VERSION = "99.0.0";
    const program = Effect.all([
      Sign.signMsix(input(first, "once-a.msix")),
      Sign.signMsix(input(second, "once-b.msix")),
    ]).pipe(
      Effect.provide(Sign.layer({ executable }).pipe(Layer.provide(pfx()))),
      Effect.provide(NodeServices.layer),
    );
    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value[0].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(exit.value[0].tool.version).toBe("99.0.0");
    }
    const invocations = await logLines(log);
    expect(invocations.filter(({ argv }) => argv[0] === "/?")).toHaveLength(1);
    expect(invocations.filter(({ argv }) => argv[0] === "sign")).toHaveLength(2);
    expect(invocations.filter(({ argv }) => argv[0] === "verify")).toHaveLength(2);
  });

  it("exports closed credential and Authenticode policy schemas", () => {
    expect(() => Schema.decodeUnknownSync(Sign.CertificateStoreOptions)({ thumbprint: "abcd" })).toThrow();
    const store = Schema.decodeUnknownSync(Sign.CertificateStoreOptions)({
      thumbprint: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(store.thumbprint).toHaveLength(40);
    expect(Schema.decodeUnknownSync(Sign.AuthenticodePolicy)(Sign.policy)).toEqual(Sign.policy);
    expect(Sign.policy).toMatchObject({
      fileDigest: "SHA256",
      timestampProtocol: "RFC3161",
      timestampDigest: "SHA256",
      verificationPolicy: "Authenticode",
    });
  });
});

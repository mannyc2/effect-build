import { Context, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Tool } from "effect-build";

export class Windows extends Context.Service<Windows, { readonly tool: Tool.Resolved }>()("effect-build-windows/Windows") {}
export class InputInvalid extends Schema.TaggedError<InputInvalid>()("WindowsInputInvalid", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}
export interface LayerOptions {
  readonly executable?: string | undefined;
  /** String ranges select SDK families; predicates receive the complete native version. */
  readonly version?: string | ((version: string) => boolean) | undefined;
}
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;
/** Windows SDK 26100 SignTool; production credentials remain experimental. */
export const supported = ">=10.0.26100 <11.0.0";
/** SDK family exercised by native CI with a temporary certificate. */
export const tested = "10.0.26100";
// SignTool's help has no version. Search its language-independent VS_FIXEDFILEINFO resource:
// https://learn.microsoft.com/en-us/windows/win32/api/verrsrc/ns-verrsrc-vs_fixedfileinfo
const productVersion = (contents: Uint8Array): string | undefined => {
  const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
  const key = "VS_VERSION_INFO\0";
  const header = { length: 0, valueLength: 2, type: 4, key: 6, value: 40, size: 92 } as const;
  const fixed = { size: 52, signature: 0, version: 4, productHigh: 16, productLow: 20 } as const;
  let version: string | undefined;
  // Resource data is DWORD-aligned, so the block can only start on a multiple of four.
  for (let offset = 0; offset + header.size <= contents.byteLength; offset += 4) {
    const length = view.getUint16(offset + header.length, true);
    if (length < header.size || offset + length > contents.byteLength || view.getUint16(offset + header.valueLength, true) !== fixed.size || view.getUint16(offset + header.type, true) !== 0) continue;
    if (!Array.from(key).every((char, i) => view.getUint16(offset + header.key + i * 2, true) === char.charCodeAt(0))) continue;
    const value = offset + header.value;
    if (view.getUint32(value + fixed.signature, true) !== 0xfeef04bd || view.getUint32(value + fixed.version, true) !== 0x10000) continue;
    const high = view.getUint32(value + fixed.productHigh, true);
    const low = view.getUint32(value + fixed.productLow, true);
    const native = [high >>> 16, high & 0xffff, low >>> 16, low & 0xffff].join(".");
    // Two resources that disagree cannot name the SDK; the layer reports that no single version exists.
    if (version !== undefined && version !== native) return undefined;
    version = native;
  }
  return version;
};
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Windows, Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported, Env
> => {
  const version = options.version ?? supported;
  const familyMatches = typeof version === "string" ? Tool.satisfies(version) : undefined;
  // Keep the native revision in producedBy; only the range comparison uses its SDK family.
  const accepts = typeof version === "function" ? version : (native: string) => familyMatches!(native.split(".").slice(0, 3).join("."));
  return Layer.effect(Windows, Effect.gen(function*() {
    const path = yield* Tool.locate({ name: "signtool", executable: options.executable });
    const contents = yield* FileSystem.FileSystem.use((fs) => fs.readFile(path)).pipe(
      Effect.mapError((error) => new Tool.ProbeFailed({ tool: "signtool", path, detail: String(error) })),
    );
    const native = productVersion(contents);
    if (native === undefined) return yield* new Tool.ProbeFailed({ tool: "signtool", path, detail: "no single VS_FIXEDFILEINFO ProductVersion resource" });
    const tool = yield* Tool.resolve({ name: "signtool", executable: path, versionArgs: ["/?"], parseVersion: () => native }).pipe(
      Tool.requireVersion(accepts),
    );
    return { tool };
  }));
};

export type Credential = {
  readonly kind: "pfx";
  readonly file: string;
  readonly password?: Redacted.Redacted<string> | undefined;
} | {
  readonly kind: "store";
  readonly thumbprint: string;
  readonly storeName?: string | undefined;
  readonly machineStore?: boolean | undefined;
} | {
  /** Azure Trusted Signing: SignTool loads the client library and account metadata; Azure identity comes from the environment. */
  readonly kind: "trusted-signing";
  readonly library: string;
  readonly metadata: string;
};
export type SignInput<A extends Artifact.Regular = Artifact.Regular> = Credential & Commit.ProducerOptions & {
  readonly artifact: A;
  readonly outfile?: string | undefined;
  readonly cwd?: string | undefined;
  readonly timestampUrl: string;
  readonly description?: string | undefined;
  readonly descriptionUrl?: string | undefined;
};
export interface Signature {
  readonly fileDigest: "SHA256";
  readonly timestampProtocol: "RFC3161";
  readonly timestampDigest: "SHA256";
  readonly timestampUrl: string;
  readonly verification: "Authenticode";
}
export type Signed<A extends Artifact.Regular = Artifact.Regular> = A & { readonly signature: Signature };
export type SignError = InputInvalid | Artifact.ArtifactError | Executable.InspectError | Executable.TargetMismatch | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;
const urlValid = (value: string, httpsOnly: boolean): boolean => {
  if (Tool.argumentIssue(value) !== undefined || /\s/u.test(value) || value.includes("?") || value.includes("#") || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) && url.hostname.length > 0 && url.username === "" && url.password === "";
};

export function sign(input: SignInput<Artifact.Executable>): Effect.Effect<Signed<Artifact.Executable>, SignError, Windows | Env>;
export function sign(input: SignInput<Artifact.File>): Effect.Effect<Signed<Artifact.File>, SignError, Windows | Env>;
export function sign(input: SignInput): Effect.Effect<Signed, SignError, Windows | Env>;
export function sign(input: SignInput): Effect.Effect<Signed, SignError, Windows | Env> {
  return Effect.gen(function*() {
    const output = input.outfile ?? input.artifact.path;
    const extension = input.artifact.kind === "executable" ? ".exe" : ".msix";
    if (input.artifact.kind === "executable" && (input.artifact.format !== "pe" || !input.artifact.target.startsWith("windows-"))) {
      return yield* new InputInvalid({ reason: "executable artifacts must use PE and target Windows" });
    }
    if (![input.artifact.path, output].every((path) => Tool.argumentIssue(path) === undefined && path.toLowerCase().endsWith(extension))) {
      return yield* new InputInvalid({ reason: `artifact and outfile must be non-empty ${extension} paths without NUL` });
    }
    if (!urlValid(input.timestampUrl, false) || (input.descriptionUrl !== undefined && !urlValid(input.descriptionUrl, true))) {
      return yield* new InputInvalid({ reason: "timestampUrl must be HTTP(S) and descriptionUrl HTTPS, without credentials, whitespace, query, or fragment" });
    }
    if ([input.cwd, input.description].some((value) => value !== undefined && Tool.argumentIssue(value) !== undefined)) {
      return yield* new InputInvalid({ reason: "cwd and description must be non-empty strings without NUL" });
    }
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, output);
    const credential: string[] = [];
    let password: string | undefined;
    if (input.kind === "pfx") {
      if (Tool.argumentIssue(input.file) !== undefined) return yield* new InputInvalid({ reason: "PFX file must be a non-empty path without NUL" });
      credential.push("/f", p.resolve(cwd, input.file));
      if (input.password !== undefined) {
        password = yield* Effect.try({ try: () => Redacted.value(input.password!), catch: () => new InputInvalid({ reason: "PFX password is unavailable" }) });
        if (password.includes("\0")) return yield* new InputInvalid({ reason: "PFX password must not contain NUL" });
        credential.push("/p", password);
      }
    } else if (input.kind === "store") {
      if (!/^[0-9a-f]{40}$/iu.test(input.thumbprint) || (input.storeName !== undefined && Tool.argumentIssue(input.storeName) !== undefined)) {
        return yield* new InputInvalid({ reason: "store credentials require a 40-digit SHA-1 thumbprint and a non-empty store name without NUL" });
      }
      if (input.machineStore === true) credential.push("/sm");
      if (input.storeName !== undefined) credential.push("/s", input.storeName);
      credential.push("/sha1", input.thumbprint);
    } else {
      if ([input.library, input.metadata].some((path) => Tool.argumentIssue(path) !== undefined)) {
        return yield* new InputInvalid({ reason: "Trusted Signing credentials require non-empty library and metadata paths without NUL" });
      }
      credential.push("/dlib", p.resolve(cwd, input.library), "/dmdf", p.resolve(cwd, input.metadata));
    }
    const { tool } = yield* Windows;
    const produce = (out: string) => Effect.gen(function*() {
      // Sign a verified copy whose header agrees with the declared target; an in-place destination is verified where it stands.
      yield* Artifact.copyVerified(input.artifact, out);
      yield* Tool.run(tool, [
        "sign", "/fd", "SHA256", "/tr", input.timestampUrl, "/td", "SHA256",
        ...(input.description === undefined ? [] : ["/d", input.description]),
        ...(input.descriptionUrl === undefined ? [] : ["/du", input.descriptionUrl]),
        ...credential, out,
      ], { cwd, redact: password === undefined ? [] : [password] });
      yield* Tool.run(tool, ["verify", "/pa", "/all", "/v", "/tw", out], { cwd, redact: password === undefined ? [] : [password] });
      return yield* input.artifact.kind === "executable"
        ? Artifact.executable(out, Tool.producer(tool), input.artifact.target)
        : Artifact.file(out, Tool.producer(tool));
    });
    const artifact = yield* Commit.output(outfile, produce, input);
    return { ...artifact, signature: {
      fileDigest: "SHA256", timestampProtocol: "RFC3161", timestampDigest: "SHA256",
      timestampUrl: input.timestampUrl, verification: "Authenticode",
    } };
  });
}

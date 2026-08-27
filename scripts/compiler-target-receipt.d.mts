export interface CompilerTargetHostObservation {
  readonly certificationHost: string;
  readonly platform: string;
  readonly architecture: string;
  readonly libc: string;
  readonly systemTarget: string;
}

export interface CompilerTargetReceiptInput {
  readonly compiler: "bun" | "deno";
  readonly target: string;
  readonly toolVersion: string;
  readonly artifactBytes: string;
  readonly artifactSha256: string;
  readonly observedHost: CompilerTargetHostObservation;
}

export interface CompilerTargetReceipt {
  readonly schema: "effect-build/compiler-target-evidence-receipt@1";
  readonly compiler: "bun" | "deno";
  readonly target: string;
  readonly certificationHost: "linux-x64";
  readonly toolVersion: string;
  readonly artifactBytes: string;
  readonly artifactSha256: string;
  readonly claim: "compiled-hashed-and-structurally-inspected-no-target-execution-claim";
  readonly operationIds: readonly string[];
}

export declare const compilerTargetReceiptSchema: CompilerTargetReceipt["schema"];
export declare const compilerTargetReceiptExpectation: (
  compiler: "bun" | "deno",
  target: string,
) => Omit<CompilerTargetReceipt, "artifactBytes" | "artifactSha256">;
export declare const createCompilerTargetReceipt: (input: CompilerTargetReceiptInput) => CompilerTargetReceipt;
export declare const writeCompilerTargetReceipt: (
  input: CompilerTargetReceiptInput & { readonly output: string },
) => Promise<CompilerTargetReceipt>;

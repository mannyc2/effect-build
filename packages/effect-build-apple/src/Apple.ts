import { Context, FileSystem, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Tool } from "effect-build";

export class Apple extends Context.Service<Apple, Tool.Service>()("effect-build-apple/Apple") {}
export type Env = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;
export const { name, layer, supported, tested, constraints, requirements, resolved, testLayer } = Tool.provider(Apple, {
  name: "xcrun",
  version: {
    parse: (probe) => {
      const major = Tool.versionPattern(/^xcrun version (0|[1-9]\d*)\.?\s*$/u)(probe);
      return major === undefined ? undefined : `${major}.0.0`;
    },
    supported: ">=70.0.0 <71.0.0", tested: ["70.0.0"],
  },
  requirements: { env: ["HOME", "DEVELOPER_DIR", "SDKROOT", "TMPDIR"], network: true, services: ["macOS keychain", "Apple notarization service"],
    detail: "Signing reads keychain identities; notarization uploads bytes and waits for Apple. Local packaging can run without network." },
});

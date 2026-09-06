import type { Plugin } from "esbuild";

export interface BuildInfo {
  readonly version: string;
  readonly channel: string;
}

/** A native esbuild plugin: no extra Effect wrapper is needed for plugin hooks. */
export const virtualBuildInfo = (readInfo: () => BuildInfo): Plugin => ({
  name: "virtual-build-info",
  setup(build) {
    build.onResolve({ filter: /^virtual:build-info$/ }, () => ({
      path: "build-info",
      namespace: "build-info",
    }));
    build.onLoad({ filter: /.*/, namespace: "build-info" }, () => ({
      contents: `export default ${JSON.stringify(readInfo())};`,
      loader: "js",
    }));
  },
});

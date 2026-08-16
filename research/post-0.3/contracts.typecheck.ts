import { Context, Effect, Layer } from "effect";
import type { JavaScriptBundleInput as BunJavaScriptBundleInput } from "effect-build-bun";
import type { Options as DenoOptions } from "effect-build-deno";
import type { JavaScriptBundleInput as EsbuildJavaScriptBundleInput } from "effect-build-esbuild";
import type { CreateExecutableInput as NodeSeaCreateExecutableInput } from "effect-build-node-sea";
import {
  BrowserModuleApplicationProtocol,
  NodeMainExecutableProtocol,
  NodeMainProgramProtocol,
  nodeSourceExecutable,
  validateProfileProtocol,
  type BrowserModuleApplication,
  type BrowserModuleApplicationRequest,
  type BrowserModuleApplicationService,
  type BrowserResourceObservation,
  type BuildStepObservation,
  type ExecutableArtifact,
  type NodeImportObservation,
  type NodeMain,
  type NodeMainExecutableRequest,
  type NodeMainExecutableService,
  type NodeMainIdentity,
  type NodeMainProgramRequest,
  type NodeMainProgramService,
  type NodeMainSnapshot,
  type PermanentProviderApi,
  type ProfileAdapter,
  type ProviderPackageObservation,
} from "./contracts.js";

const digest: `sha256:${string}` =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";

const providerPackage = (name: string): ProviderPackageObservation => ({ name, version: "0.4.0-research" });

const step = (
  operation: string,
  provider: ProviderPackageObservation,
  profileProtocol: BuildStepObservation["profileProtocol"],
): BuildStepObservation => ({ operation, providerPackage: provider, profileProtocol });

const makeNodeMain = (
  request: NodeMainProgramRequest,
  provider: ProviderPackageObservation,
): NodeMain => {
  const contents = new TextEncoder().encode(
    request.moduleFormat === "esm" ? "console.log('esm')\n" : "console.log('commonjs')\n",
  );
  const identity: NodeMainIdentity = { algorithm: "sha256", digest, bytes: contents.byteLength };
  const snapshot: NodeMainSnapshot = { ...identity, contents };
  const imports: readonly NodeImportObservation[] = [
    { kind: "static-import", specifier: "node:fs", disposition: "builtin" },
    { kind: "dynamic-import", specifier: "./chunk.js", disposition: "bundled" },
    { kind: "json", specifier: "./data.json", disposition: "json-bundled" },
  ];
  return {
    _tag: "NodeMain",
    profileProtocol: NodeMainProgramProtocol,
    providerPackage: provider,
    content: {
      lifetime: "borrowed",
      identity,
      acquire: Effect.succeed(snapshot),
    },
    moduleFormat: request.moduleFormat,
    runtimeTarget: request.runtimeTarget,
    syntaxCompatibility: {
      minimumNodeVersion: request.runtimeTarget.version,
      testedNodeVersions: [request.runtimeTarget.version],
      topLevelAwait: request.moduleFormat === "esm" ? "supported" : "not-applicable",
      dynamicImport: "supported",
      jsonModules: request.moduleFormat === "esm" ? "bundled" : "commonjs-require",
    },
    imports,
    observations: [step("bundle-node-main", provider, NodeMainProgramProtocol)],
  };
};

const makeNodeMainProgramService = (
  provider: ProviderPackageObservation,
): NodeMainProgramService<never> => ({
  profile: "NodeMainProgram",
  protocol: NodeMainProgramProtocol,
  providerPackage: provider,
  withMain: (request, use) =>
    Effect.flatMap(
      validateProfileProtocol("NodeMainProgram", NodeMainProgramProtocol, NodeMainProgramProtocol, provider),
      () => Effect.scoped(use(makeNodeMain(request, provider))),
    ),
});

const sameTarget = (
  left: NodeMainExecutableRequest["runtimeTarget"],
  right: NodeMainExecutableRequest["runtimeTarget"],
): boolean => left.runtime === right.runtime && left.version === right.version;

const makeNodeMainExecutableService = (
  provider: ProviderPackageObservation,
): NodeMainExecutableService<never> => ({
  profile: "NodeMainExecutable",
  protocol: NodeMainExecutableProtocol,
  providerPackage: provider,
  assemble: (request) =>
    Effect.flatMap(
      validateProfileProtocol(
        "NodeMainExecutable",
        NodeMainExecutableProtocol,
        NodeMainExecutableProtocol,
        provider,
      ),
      () => {
        if (!sameTarget(request.main.runtimeTarget, request.runtimeTarget)) {
          return Effect.fail({
            _tag: "NodeTargetMismatch",
            produced: request.main.runtimeTarget,
            requested: request.runtimeTarget,
          });
        }
        const inadmissible = request.main.imports.filter((item) =>
          item.disposition === "package-external" || item.disposition === "unresolved-external"
        );
        const firstInadmissible = inadmissible[0];
        if (firstInadmissible !== undefined) {
          return Effect.fail({
            _tag: "NodeExternalImportUnsupported",
            imports: [firstInadmissible, ...inadmissible.slice(1)],
          });
        }
        return Effect.flatMap(request.main.content.acquire, (snapshot) => {
          const expected = request.main.content.identity;
          if (snapshot.digest !== expected.digest || snapshot.bytes !== expected.bytes) {
            return Effect.fail({
              _tag: "NodeMainIdentityMismatch",
              expected,
              observed: {
                algorithm: snapshot.algorithm,
                digest: snapshot.digest,
                bytes: snapshot.bytes,
              },
            });
          }
          const artifact: ExecutableArtifact = {
            _tag: "ExecutableArtifact",
            path: request.destination,
            bytes: snapshot.bytes,
            ...(request.digest ? { digest: snapshot.digest } : {}),
            runtime: request.runtimeTarget,
            observations: [
              ...request.main.observations,
              step("assemble-node-main", provider, NodeMainExecutableProtocol),
            ],
            publication: { commitPoint: "atomic-file-replacement", committed: true },
          };
          return Effect.succeed(artifact);
        });
      },
    ),
});

const makeBrowserService = (
  provider: ProviderPackageObservation,
): BrowserModuleApplicationService<never> => ({
  profile: "BrowserModuleApplication",
  protocol: BrowserModuleApplicationProtocol,
  providerPackage: provider,
  withApplication: (request, use) => {
    const html: BrowserResourceObservation = {
      path: request.entryHtml[0],
      kind: "html",
      bytes: 32,
      digest,
      references: ["./app.js", "./style.css"],
    };
    const application: BrowserModuleApplication = {
      _tag: "BrowserModuleApplication",
      profileProtocol: BrowserModuleApplicationProtocol,
      providerPackage: provider,
      lifetime: "borrowed",
      acquire: Effect.succeed({ entryHtml: request.entryHtml, resources: [html] }),
      observations: [step("build-browser-module-application", provider, BrowserModuleApplicationProtocol)],
    };
    return Effect.flatMap(
      validateProfileProtocol(
        "BrowserModuleApplication",
        BrowserModuleApplicationProtocol,
        BrowserModuleApplicationProtocol,
        provider,
      ),
      () => Effect.scoped(use(application)),
    );
  },
});

const bunPackage = providerPackage("effect-build-bun");
const denoPackage = providerPackage("effect-build-deno");
const esbuildPackage = providerPackage("effect-build-esbuild");
const nodeSeaPackage = providerPackage("effect-build-node-sea");

const bunNodeMain = makeNodeMainProgramService(bunPackage);
const esbuildNodeMain = makeNodeMainProgramService(esbuildPackage);
const bunBrowser = makeBrowserService(bunPackage);
const denoBrowser = makeBrowserService(denoPackage);
const nodeSeaExecutable = makeNodeMainExecutableService(nodeSeaPackage);

class BunNodeMain extends Context.Service<BunNodeMain, NodeMainProgramService<never>>()(
  "research/effect-build-bun/NodeMainProgram",
) {}
class EsbuildNodeMain extends Context.Service<EsbuildNodeMain, NodeMainProgramService<never>>()(
  "research/effect-build-esbuild/NodeMainProgram",
) {}
class BunBrowser extends Context.Service<BunBrowser, BrowserModuleApplicationService<never>>()(
  "research/effect-build-bun/BrowserModuleApplication",
) {}
class DenoBrowser extends Context.Service<DenoBrowser, BrowserModuleApplicationService<never>>()(
  "research/effect-build-deno/BrowserModuleApplication",
) {}
class NodeSeaExecutable extends Context.Service<
  NodeSeaExecutable,
  NodeMainExecutableService<never>
>()("research/effect-build-node-sea/NodeMainExecutable") {}
class BunApi extends Context.Service<BunApi, { readonly provider: "bun" }>()(
  "research/effect-build-bun/Api",
) {}

const bunNodeMainAdapter: ProfileAdapter<BunNodeMain, never> = {
  status: "additive-portable-role",
  profile: "NodeMainProgram",
  protocol: NodeMainProgramProtocol,
  providerPackage: bunPackage,
  layer: Layer.succeed(BunNodeMain, bunNodeMain),
};
const esbuildNodeMainAdapter: ProfileAdapter<EsbuildNodeMain, never> = {
  status: "additive-portable-role",
  profile: "NodeMainProgram",
  protocol: NodeMainProgramProtocol,
  providerPackage: esbuildPackage,
  layer: Layer.succeed(EsbuildNodeMain, esbuildNodeMain),
};
const bunBrowserAdapter: ProfileAdapter<BunBrowser, never> = {
  status: "additive-portable-role",
  profile: "BrowserModuleApplication",
  protocol: BrowserModuleApplicationProtocol,
  providerPackage: bunPackage,
  layer: Layer.succeed(BunBrowser, bunBrowser),
};
const denoBrowserAdapter: ProfileAdapter<DenoBrowser, never> = {
  status: "additive-portable-role",
  profile: "BrowserModuleApplication",
  protocol: BrowserModuleApplicationProtocol,
  providerPackage: denoPackage,
  layer: Layer.succeed(DenoBrowser, denoBrowser),
};
const nodeSeaExecutableAdapter: ProfileAdapter<NodeSeaExecutable, never> = {
  status: "additive-portable-role",
  profile: "NodeMainExecutable",
  protocol: NodeMainExecutableProtocol,
  providerPackage: nodeSeaPackage,
  layer: Layer.succeed(NodeSeaExecutable, nodeSeaExecutable),
};
const bunApi: PermanentProviderApi<BunApi, never> = {
  status: "permanent-canonical-provider-surface",
  providerPackage: bunPackage,
  layer: Layer.succeed(BunApi, { provider: "bun" }),
};

const nodeRequests: readonly NodeMainProgramRequest[] = [
  {
    entrypoint: "src/main.mts",
    moduleFormat: "esm",
    runtimeTarget: { runtime: "node", version: "25.5.0", moduleResolution: "node" },
    minify: false,
    sourceMap: "none",
  },
  {
    entrypoint: "src/main.mts",
    moduleFormat: "esm",
    runtimeTarget: { runtime: "node", version: "26.7.0", moduleResolution: "node" },
    minify: true,
    sourceMap: "linked",
  },
  {
    entrypoint: "src/main.cts",
    moduleFormat: "commonjs",
    runtimeTarget: { runtime: "node", version: "25.5.0", moduleResolution: "node" },
    minify: false,
    sourceMap: "inline",
  },
  {
    entrypoint: "src/main.cts",
    moduleFormat: "commonjs",
    runtimeTarget: { runtime: "node", version: "26.7.0", moduleResolution: "node" },
    minify: true,
    sourceMap: "none",
  },
];

const consumeNodeMain = <Failure, Requirements>(
  service: NodeMainProgramService<Failure, Requirements>,
  request: NodeMainProgramRequest,
) => service.withMain(request, (main) => Effect.succeed(main.content.identity));

for (const request of nodeRequests) {
  consumeNodeMain(bunNodeMain, request);
  consumeNodeMain(esbuildNodeMain, request);
  nodeSourceExecutable(bunNodeMain, nodeSeaExecutable, {
    program: request,
    destination: "out/bun-app",
    acquisition: "bytes",
    digest: true,
  });
  nodeSourceExecutable(esbuildNodeMain, nodeSeaExecutable, {
    program: request,
    destination: "out/esbuild-app",
    acquisition: "private-file",
    digest: false,
  });
}

const browserRequests: readonly BrowserModuleApplicationRequest[] = [
  { entryHtml: ["index.html"], minify: false, sourceMap: "none" },
  { entryHtml: ["index.html"], minify: true, sourceMap: "linked" },
];
const consumeBrowser = <Failure, Requirements>(
  service: BrowserModuleApplicationService<Failure, Requirements>,
  request: BrowserModuleApplicationRequest,
) => service.withApplication(request, (application) => application.acquire);
for (const request of browserRequests) {
  consumeBrowser(bunBrowser, request);
  consumeBrowser(denoBrowser, request);
}

const bunInputs: readonly BunJavaScriptBundleInput[] = nodeRequests.map((request) => ({
  entrypoint: request.entrypoint,
  format: request.moduleFormat === "esm" ? "esm" : "cjs",
  ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
}));
const esbuildInputs: readonly EsbuildJavaScriptBundleInput[] = nodeRequests.map((request) => ({
  entrypoint: request.entrypoint,
  format: request.moduleFormat === "esm" ? "esm" : "cjs",
  ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
}));
const denoOptions: readonly DenoOptions[] = [
  { bundle: false },
  { bundle: true, minify: false },
  { bundle: true, minify: true },
];
const inspectNodeSeaNativeInput = <Stages extends readonly BuildStepObservation[]>(
  input: NodeSeaCreateExecutableInput<Stages>,
) => ({ outfile: input.outfile, assets: input.assets });

void bunNodeMainAdapter;
void esbuildNodeMainAdapter;
void bunBrowserAdapter;
void denoBrowserAdapter;
void nodeSeaExecutableAdapter;
void bunApi;
void bunInputs;
void esbuildInputs;
void denoOptions;
void inspectNodeSeaNativeInput;

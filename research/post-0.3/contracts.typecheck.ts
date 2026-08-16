import type { Effect, Layer, Scope } from "effect";
import type {
  BorrowedNodeMainProgram,
  IncrementalNodeMainService,
  NodeMainExecutableService,
  NodeMainProgramRequest,
  NodeMainProgramService,
  PermanentProviderApi,
  ProfileAdapter,
  StaticWebApplicationService,
  ToolVersionUnsupported,
} from "./contracts.js";

declare const bunFailure: unique symbol;
declare const esbuildFailure: unique symbol;
declare const denoFailure: unique symbol;
declare const nodeSeaFailure: unique symbol;

type BunFailure = { readonly [bunFailure]: true };
type EsbuildFailure = { readonly [esbuildFailure]: true };
type DenoFailure = { readonly [denoFailure]: true };
type NodeSeaFailure = { readonly [nodeSeaFailure]: true };

declare const bunNodeMain: NodeMainProgramService<BunFailure>;
declare const esbuildNodeMain: NodeMainProgramService<EsbuildFailure>;
declare const bunStaticWeb: StaticWebApplicationService<BunFailure>;
declare const denoStaticWeb: StaticWebApplicationService<DenoFailure>;
declare const nodeSeaExecutable: NodeMainExecutableService<NodeSeaFailure>;
declare const pkgExecutable: NodeMainExecutableService<Error>;
declare const esbuildIncremental: IncrementalNodeMainService<EsbuildFailure>;
declare const rolldownIncremental: IncrementalNodeMainService<Error>;

declare const genericRequest: NodeMainProgramRequest;

const consumeMain = <Failure>(service: NodeMainProgramService<Failure>) =>
  service.withProgram(genericRequest, (program) =>
    program.file as Effect.Effect<unknown, unknown>
  );

consumeMain(bunNodeMain);
consumeMain(esbuildNodeMain);

const assemble = <Failure>(service: NodeMainExecutableService<Failure>, program: BorrowedNodeMainProgram) => ({
  service,
  file: program.file as Effect.Effect<unknown, unknown>,
});

assemble(nodeSeaExecutable, {} as BorrowedNodeMainProgram);
assemble(pkgExecutable, {} as BorrowedNodeMainProgram);

bunStaticWeb.withApplication({ entryHtml: ["index.html"] }, () => undefined as never);
denoStaticWeb.withApplication({ entryHtml: ["index.html"] }, () => undefined as never);

esbuildIncremental.context(genericRequest);
rolldownIncremental.context(genericRequest);

declare const apiLayer: Layer.Layer<"BunApi", ToolVersionUnsupported>;
declare const profileLayer: Layer.Layer<"NodeMainProgram", ToolVersionUnsupported>;

const permanent: PermanentProviderApi<"BunApi", ToolVersionUnsupported> = {
  status: "permanent-canonical-provider-surface",
  layer: apiLayer,
};
const additive: ProfileAdapter<"NodeMainProgram", ToolVersionUnsupported> = {
  status: "additive-portable-role",
  layer: profileLayer,
};

void permanent;
void additive;
void bunStaticWeb;
void denoStaticWeb;
void nodeSeaExecutable;
void pkgExecutable;
void esbuildIncremental;
void rolldownIncremental;
void (undefined as unknown as Scope.Scope);

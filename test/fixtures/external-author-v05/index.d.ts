import type { Layer } from "effect";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as StaticBrowserApplication from "effect-build/Profile/StaticBrowserApplication";

export declare const identity: NodeMain.ProviderIdentity;
export declare const adapterProducerTag: typeof NodeMain.Producer;
export declare const getCalls: () => number;
export declare const layer: Layer.Layer<NodeMain.Producer | StaticBrowserApplication.Provider>;

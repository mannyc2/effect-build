export interface ProviderNativeObservation {
  readonly schema: "effect-build/provider-native-operation-observation@1";
  readonly providerRuntimeCell: string;
  readonly certificationHost: string;
  readonly kind: "operation" | "atom";
  readonly id: string;
}

export declare const providerNativeObservationSchema: ProviderNativeObservation["schema"];

export declare const providerNativeObservation: (input: {
  readonly providerRuntimeCell: string;
  readonly certificationHost: string;
  readonly id: string;
}) => ProviderNativeObservation;

export declare const writeProviderNativeObservation: (input: {
  readonly directory: string;
  readonly providerRuntimeCell: string;
  readonly certificationHost: string;
  readonly id: string;
}) => Promise<ProviderNativeObservation>;

export declare const providerNativeObservationManifest: (input: {
  readonly providerRuntimeCell: string;
  readonly certificationHost: string;
  readonly operationIds: readonly string[];
  readonly atomIds: readonly string[];
}) => {
  readonly observations: readonly ProviderNativeObservation[];
  readonly bytes: Uint8Array;
  readonly sha256: string;
};

export declare const readProviderNativeObservationDirectory: (input: {
  readonly directory: string;
  readonly providerRuntimeCell: string;
  readonly certificationHost: string;
  readonly operationIds: readonly string[];
  readonly atomIds: readonly string[];
}) => Promise<{
  readonly observations: readonly ProviderNativeObservation[];
  readonly bytes: Uint8Array;
  readonly sha256: string;
}>;

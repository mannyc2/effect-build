import { writeProviderNativeObservation } from "../../scripts/provider-native-observation.mjs";

export const observeProviderNativeEvidence = async (...ids: readonly string[]): Promise<void> => {
  const directory = process.env.EFFECT_BUILD_PROVIDER_EVIDENCE_DIRECTORY;
  if (directory === undefined) return;
  const providerRuntimeCell = process.env.EFFECT_BUILD_PROVIDER_RUNTIME_CELL;
  const certificationHost = process.env.EFFECT_BUILD_CERTIFICATION_HOST;
  if (providerRuntimeCell === undefined || certificationHost === undefined) {
    throw new Error("provider-native evidence output requires the exact runtime cell and certification host");
  }
  for (const id of [...new Set(ids)].sort()) {
    await writeProviderNativeObservation({ directory, providerRuntimeCell, certificationHost, id });
  }
};

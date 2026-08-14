import { Schema } from "effect";

export const ProviderContracts = Object.freeze({
  bun: Object.freeze(
    [
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ] as const,
  ),
  deno: Object.freeze(
    [
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-aarch64-gnu",
      "windows-x64",
      "windows-aarch64",
    ] as const,
  ),
  "node-sea": Object.freeze(["linux-x64-gnu"] as const),
});

export type ProviderName = keyof typeof ProviderContracts;
export type ProviderTargets = {
  readonly [Name in ProviderName]: (typeof ProviderContracts)[Name][number];
};
export type TargetFor<Name extends ProviderName> = ProviderTargets[Name];

const providerNames = Object.freeze(Object.keys(ProviderContracts)) as readonly [
  ProviderName,
  ...ProviderName[],
];

export const ProviderName = Schema.Literals(providerNames);

export const targetsFor = <Name extends ProviderName>(
  name: Name,
): (typeof ProviderContracts)[Name] => ProviderContracts[name];

export const targetSchemaFor = <Name extends ProviderName>(
  name: Name,
): Schema.Literals<(typeof ProviderContracts)[Name]> => Schema.Literals(targetsFor(name));

const disallowedSpecifier = /^(?:workspace:|catalog:|file:|link:|portal:)/u;

const dependencyRecord = (value, field) => {
  if (value === undefined) return {};
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${field} must be an object when present`);
  }
  for (const [name, specifier] of Object.entries(value)) {
    if (typeof specifier !== "string" || specifier.length === 0 || disallowedSpecifier.test(specifier)) {
      throw new Error(`${field}.${name} is not a resolved package specifier`);
    }
  }
  return value;
};

/** Enforces D10 on exact packed bytes, not only on workspace source manifests. */
export const assertLockstepPackageManifest = ({
  manifest,
  name,
  version,
  firstPartyPackages,
  prerequisites,
}) => {
  if (manifest === null || Array.isArray(manifest) || typeof manifest !== "object") {
    throw new Error(`${name} packed manifest must be an object`);
  }
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`${name} packed identity must be exact ${version}`);
  }
  const dependencies = dependencyRecord(manifest.dependencies, `${name}.dependencies`);
  const optionalDependencies = dependencyRecord(manifest.optionalDependencies, `${name}.optionalDependencies`);
  const devDependencies = dependencyRecord(manifest.devDependencies, `${name}.devDependencies`);
  const peers = dependencyRecord(manifest.peerDependencies, `${name}.peerDependencies`);
  const expected = new Set(prerequisites);
  for (const packageName of firstPartyPackages) {
    if (
      dependencies[packageName] !== undefined
      || optionalDependencies[packageName] !== undefined
      || devDependencies[packageName] !== undefined
    ) {
      throw new Error(`${name} must declare first-party package ${packageName} only as an exact peer`);
    }
    const peer = peers[packageName];
    if (expected.has(packageName)) {
      if (peer !== version) throw new Error(`${name} must pin exact same-version peer ${packageName}@${version}`);
    } else if (peer !== undefined) {
      throw new Error(`${name} declares unexpected first-party peer ${packageName}`);
    }
  }
  for (const prerequisite of prerequisites) {
    if (!firstPartyPackages.includes(prerequisite)) {
      throw new Error(`${name} prerequisite ${prerequisite} is outside the first-party train`);
    }
  }
  return manifest;
};

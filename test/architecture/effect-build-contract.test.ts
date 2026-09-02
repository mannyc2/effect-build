import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sorted = (values: ReadonlyArray<string>) => [...values].sort();

interface PublicSubpath {
  readonly runtime: ReadonlyArray<string>;
  readonly declarations: ReadonlyArray<string>;
}

interface PublicPackage {
  readonly namespaces: ReadonlyArray<string>;
  readonly subpaths: Readonly<Record<string, PublicSubpath>>;
}

interface PublicApi {
  readonly schema: string;
  readonly packages: Readonly<Record<string, PublicPackage>>;
}

interface OwnerSurface {
  readonly ownerIds: ReadonlyArray<string>;
  readonly operationNamespaces: ReadonlyArray<string>;
  readonly supportExports: {
    readonly runtime: ReadonlyArray<string>;
    readonly declarations: ReadonlyArray<string>;
  };
}

interface ProjectedPackage {
  readonly rootNamespaces: ReadonlyArray<string>;
  readonly rootOwners: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly subpaths: Readonly<Record<string, ReadonlyArray<string> | OwnerSurface>>;
}

interface CombinedContract {
  readonly schema: string;
  readonly providerOperationRegister: {
    readonly count: number;
    readonly operations: ReadonlyArray<{
      readonly operationId: string;
      readonly accounting: { readonly surface: string };
    }>;
  };
  readonly nonOperationRegister: { readonly count: number };
  readonly publicApiProjection: {
    readonly authority: string;
    readonly packages: Readonly<Record<string, ProjectedPackage>>;
    readonly privatePackages: ReadonlyArray<string>;
  };
  readonly npmRegistryBoundary: {
    readonly purpose: string;
    readonly productReleaseOwnership: string;
    readonly candidateHandoff: {
      readonly identity: ReadonlyArray<string>;
      readonly repositoryCodeInOidcJob: string;
    };
    readonly bootstrap: {
      readonly architectureEvidence: boolean;
      readonly placeholderAtHandoffPackages: ReadonlyArray<string>;
    };
    readonly publicationAdmission: {
      readonly packages: ReadonlyArray<string>;
      readonly target: {
        readonly version: string;
        readonly expectedLatestBeforePublication: ReadonlyArray<{ readonly name: string; readonly version: string }>;
        readonly expectedDistTagsBeforePublication: ReadonlyArray<{
          readonly name: string;
          readonly tags: Readonly<Record<string, string>>;
        }>;
      };
    };
    readonly reservation: {
      readonly packages: ReadonlyArray<string>;
    };
  };
}

const isOwnerSurface = (surface: ReadonlyArray<string> | OwnerSurface): surface is OwnerSurface =>
  "ownerIds" in surface;

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await readFile(resolve(root, path), "utf8")) as A;

describe("authoritative combined contract", () => {
  it("projects every public package and provider lane from admitted contract owners", async () => {
    const [contract, publicApi] = await Promise.all([
      readJson<CombinedContract>("tooling/effect-build-contract.json"),
      readJson<PublicApi>("tooling/public-api.json"),
    ]);
    expect(contract.schema).toBe("effect-build/combined-contract@1");
    expect(contract.providerOperationRegister.count).toBe(67);
    expect(contract.nonOperationRegister.count).toBe(46);
    expect(contract.publicApiProjection.authority).toBe("derived-projection-only");
    expect(sorted(Object.keys(publicApi.packages))).toEqual(sorted(Object.keys(contract.publicApiProjection.packages)));

    for (const [packageName, expected] of Object.entries(contract.publicApiProjection.packages)) {
      const actual = publicApi.packages[packageName];
      expect(actual, packageName).toBeDefined();
      expect(sorted(actual?.namespaces ?? []), `${packageName} root`).toEqual(sorted(expected.rootNamespaces));
      expect(sorted(Object.keys(actual?.subpaths ?? {})), `${packageName} subpaths`).toEqual(
        sorted(Object.keys(expected.subpaths)),
      );
      for (const [subpath, expectedSubpath] of Object.entries(expected.subpaths)) {
        if (!isOwnerSurface(expectedSubpath)) {
          expect(expectedSubpath.length, `${packageName}${subpath} owners`).toBeGreaterThan(0);
          continue;
        }
        const actualSubpath = actual?.subpaths[subpath];
        expect(sorted(actualSubpath?.runtime ?? []), `${packageName}${subpath} runtime`).toEqual(
          sorted([...expectedSubpath.operationNamespaces, ...expectedSubpath.supportExports.runtime]),
        );
        expect(sorted(actualSubpath?.declarations ?? []), `${packageName}${subpath} declarations`).toEqual(
          sorted([...expectedSubpath.operationNamespaces, ...expectedSubpath.supportExports.declarations]),
        );
      }
    }

    for (const packageName of contract.publicApiProjection.privatePackages) {
      expect(publicApi.packages).not.toHaveProperty(packageName);
    }
    const nonPublicOperationIds = new Set(
      contract.providerOperationRegister.operations
        .filter((operation) => operation.accounting.surface !== "public")
        .map((operation) => operation.operationId),
    );
    for (const projectedPackage of Object.values(contract.publicApiProjection.packages)) {
      for (const ownerIds of Object.values(projectedPackage.rootOwners)) {
        expect(ownerIds.some((ownerId) => nonPublicOperationIds.has(ownerId))).toBe(false);
      }
      for (const projectedSubpath of Object.values(projectedPackage.subpaths)) {
        const ownerIds = isOwnerSurface(projectedSubpath) ? projectedSubpath.ownerIds : projectedSubpath;
        expect(ownerIds.some((ownerId) => nonPublicOperationIds.has(ownerId))).toBe(false);
      }
    }
  });

  it("does not let registry placeholders widen the admitted package surface", async () => {
    const contract = await readJson<CombinedContract>("tooling/effect-build-contract.json");
    const admitted = sorted(Object.keys(contract.publicApiProjection.packages));
    const reservedOnly = sorted(contract.publicApiProjection.privatePackages);

    expect(contract.npmRegistryBoundary.purpose).toBe("repository-package-distribution-only");
    expect(contract.npmRegistryBoundary.productReleaseOwnership).toBe("unchanged-ts-release-boundary");
    expect(contract.npmRegistryBoundary.candidateHandoff.identity).toEqual(["logicalName", "digest"]);
    expect(contract.npmRegistryBoundary.candidateHandoff.repositoryCodeInOidcJob).toBe("forbidden");
    expect(contract.npmRegistryBoundary.bootstrap.architectureEvidence).toBe(false);
    expect(sorted(contract.npmRegistryBoundary.bootstrap.placeholderAtHandoffPackages)).toEqual([
      "effect-build-apple",
      "effect-build-archives",
      "effect-build-nfpm",
      "effect-build-python",
      "effect-build-rolldown",
      "effect-build-sbom",
      "effect-build-windows",
    ]);
    expect(sorted(contract.npmRegistryBoundary.publicationAdmission.packages)).toEqual(admitted);
    expect(contract.npmRegistryBoundary.publicationAdmission.target.version).toBe("0.6.0");
    expect(sorted(
      contract.npmRegistryBoundary.publicationAdmission.target.expectedLatestBeforePublication.map(({ name }) => name),
    )).toEqual(admitted);
    expect(sorted(
      contract.npmRegistryBoundary.publicationAdmission.target.expectedDistTagsBeforePublication.map(({ name }) =>
        name
      ),
    )).toEqual(admitted);
    expect(
      contract.npmRegistryBoundary.publicationAdmission.target.expectedDistTagsBeforePublication
        .find(({ name }) => name === "effect-build-bun")?.tags,
    ).toEqual({ latest: "0.3.0", reserved: "0.0.0-reserved.0" });
    expect(sorted(contract.npmRegistryBoundary.reservation.packages)).toEqual(reservedOnly);
    expect(contract.npmRegistryBoundary.publicationAdmission.packages).not.toContain("effect-build-rolldown");
  });
});

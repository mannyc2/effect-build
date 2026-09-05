import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

// @ts-expect-error The release boundary fixture is an intentionally untyped Node script module.
import * as releaseState from "../fixtures/release/release-state.mjs";

const { createReleaseState, placeholderNames, placeholderVersion, reservedOnlyName } = releaseState;

it("seeds every public baseline tag while retaining historical placeholder bytes and the Rolldown reservation", () => {
  const directory = mkdtempSync(join(tmpdir(), "effect-build-release-baseline-"));
  try {
    const contract = JSON.parse(
      readFileSync(new URL("../../tooling/effect-build-contract.json", import.meta.url), "utf8"),
    );
    const placeholderPackages = Object.fromEntries((placeholderNames as Array<string>).map((name) => [name, {
      bytes: 123,
      file: `${name}-historical-placeholder.tgz`,
      integrity: `historical-integrity-${name}`,
      sha256: `historical-sha256-${name}`,
    }]));
    const state = createReleaseState({
      candidate: { digest: "candidate-digest", packages: {} },
      contractPath: "unused-contract-path",
      placeholderPackages,
      readiness: { digest: "readiness-digest" },
      scenario: "full-convergence",
      statePath: join(directory, "state.json"),
    });
    for (
      const { name, tags } of contract.npmRegistryBoundary.publicationAdmission.target.expectedDistTagsBeforePublication
    ) {
      const observed = state.registry.packages[name];
      expect(observed.tags, name).toEqual(tags);
      for (const version of Object.values(tags)) {
        expect(Object.hasOwn(observed.versions, version as string), `${name} dist-tag resolves to ${version}`).toBe(
          true,
        );
      }
    }
    for (const name of placeholderNames as Array<string>) {
      expect(state.registry.packages[name].versions[placeholderVersion], name).toEqual({
        ...placeholderPackages[name],
        provenance: null,
      });
    }
    const reservation = state.registry.packages[reservedOnlyName];
    expect(Object.keys(reservation.versions)).toEqual([placeholderVersion]);
    expect(reservation.tags).toEqual({ latest: placeholderVersion, reserved: placeholderVersion });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

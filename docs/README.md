# effect-build documentation

Start with [your first executable](../README.md#compile-your-first-executable), then use the [getting started guide](getting-started.md) to understand layers, build options, and the returned artifact. The [examples](../examples/README.md) include their own inputs and run commands.

To learn through a complete workflow, build the [bundle-budget CLI](../examples/cli/README.md), follow the
[artifact pipeline](../examples/artifact-pipeline/README.md), or explore [esbuild plugins and rebuilds](../examples/esbuild/README.md).

| You want to…                                        | Read                                    |
| --------------------------------------------------- | --------------------------------------- |
| Install a provider and run a build                  | [Getting started](getting-started.md)   |
| Choose Bun, Deno, esbuild, or Node SEA              | [Provider guide](drivers.md)            |
| Find a public operation or understand its result    | [API reference](api.md)                 |
| Diagnose selection, compilation, or output failures | [Errors and troubleshooting](errors.md) |
| Understand scopes, tool identity, and atomic output | [Architecture](architecture.md)         |
| Hand a finished artifact to a release system        | [Release boundary](release-security.md) |
| Work on this repository                             | [Contributing](../CONTRIBUTING.md)      |

## Package guides

For bundling and executable compilation: [Bun](../packages/effect-build-bun/README.md), [Deno](../packages/effect-build-deno/README.md), [esbuild](../packages/effect-build-esbuild/README.md), and [Node SEA](../packages/effect-build-node-sea/README.md).

For distribution artifacts: [archives](../packages/effect-build-archives/README.md), [Python](../packages/effect-build-python/README.md), [nFPM](../packages/effect-build-nfpm/README.md), [Apple](../packages/effect-build-apple/README.md), [Windows](../packages/effect-build-windows/README.md), and [SBOM](../packages/effect-build-sbom/README.md).

For shared artifact identities and custom producers, see [the core package](../packages/effect-build/README.md) and its `Author` modules.

## Maintainer references

The [combined contract](../tooling/effect-build-contract.json) records provider operations, producer capabilities, and their public or private status. [The public API projection](../tooling/public-api.json) is generated from that contract and built declarations. Historical plans and research provide context; the current contract and exported source define the implemented API.

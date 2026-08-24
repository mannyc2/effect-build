import { Context, Crypto, Effect, FileSystem, Path } from "effect";
import * as BorrowedContent from "../Author/BorrowedContent.js";
import * as Generation from "../Author/Generation.js";
import type { DirectoryGeneration } from "../Author/Generation.js";
import type { ProviderIdentity } from "../Author/NodeMain.js";
import * as TreeSnapshot from "../Author/TreeSnapshot.js";
import {
  ArtifactInvalid,
  type GenerationConflict,
  PortableRejected,
  type PortableUnsupported,
  type ProviderFailed,
} from "../BuildError.js";

export const protocol = "effect-build/profile/static-browser-application@1" as const;
export const hostProtocol = "effect-build/generated-module-host@1" as const;
export const producedProtocol = "effect-build/produced-static-browser-application@1" as const;

export interface Resource {
  readonly source: string;
  readonly destination: string;
  readonly mediaType: string;
}

export interface Request {
  readonly protocol: typeof protocol;
  readonly entrypoint: string;
  readonly resources: readonly Resource[];
}

export interface ProducedFile {
  readonly path: string;
  readonly mediaType: string;
  readonly imports: readonly string[];
}

export interface ProducedApplication {
  readonly protocol: typeof producedProtocol;
  readonly entryModule: string;
  readonly files: readonly ProducedFile[];
}

export type ProduceError = ProviderFailed | PortableUnsupported;

interface Service {
  readonly identity: ProviderIdentity;
  readonly produce: (
    request: Request,
    staging: string,
  ) => Effect.Effect<ProducedApplication, ProduceError>;
}

export class Provider extends Context.Service<Provider, Service>()(
  "effect-build/Profile/StaticBrowserApplication/Provider",
) {}

export interface Subject {
  readonly profile: typeof protocol;
  readonly entry: "index.html";
  readonly mount: "relative-same-origin";
  readonly host: typeof hostProtocol;
}

export type StaticBrowserApplication = DirectoryGeneration<Subject>;

export interface BuildInput {
  readonly request: Request;
  readonly generationRoot: string;
}

export type BuildError = ArtifactInvalid | GenerationConflict | PortableRejected | ProduceError;

const canonicalMediaType = /^[a-z0-9][a-z0-9!#$%&*+.^_~-]*\/[a-z0-9][a-z0-9!#$%&*+.^_~-]*(?:; charset=utf-8)?$/u;

const reject = (phase: "request" | "analysis", reason: string): PortableRejected =>
  new PortableRejected({ profile: protocol, phase, reason });

const validateRequest = (
  request: Request,
): Effect.Effect<
  readonly { readonly resource: Resource; readonly borrowed: BorrowedContent.BorrowedFile }[],
  PortableRejected | ArtifactInvalid,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    if ((request as { readonly protocol?: unknown }).protocol !== protocol) {
      return yield* reject("request", "unknown protocol major");
    }
    if (request.entrypoint.length === 0) return yield* reject("request", "entrypoint is empty");
    const seen = new Set<string>(["index.html"]);
    const resources: { readonly resource: Resource; readonly borrowed: BorrowedContent.BorrowedFile }[] = [];
    for (const resource of request.resources) {
      const pathProblem = TreeSnapshot.validatePortablePath(resource.destination);
      if (pathProblem !== undefined) return yield* reject("request", `invalid resource destination: ${pathProblem}`);
      if (!canonicalMediaType.test(resource.mediaType)) {
        return yield* reject("request", `invalid resource media type for ${resource.destination}`);
      }
      const folded = resource.destination.toLowerCase();
      if (seen.has(folded)) return yield* reject("request", `resource destination collision: ${resource.destination}`);
      seen.add(folded);
      const borrowed = yield* BorrowedContent.observeFile(resource.source);
      resources.push(Object.freeze({ resource, borrowed }));
    }
    return Object.freeze(resources);
  });

const validateProduced = (
  produced: ProducedApplication,
  snapshot: TreeSnapshot.TreeSnapshot,
): Effect.Effect<Readonly<Record<string, string>>, PortableRejected> =>
  Effect.gen(function*() {
    if (produced.protocol !== producedProtocol) return yield* reject("analysis", "unknown provider protocol major");
    const entryProblem = TreeSnapshot.validatePortablePath(produced.entryModule);
    if (entryProblem !== undefined) return yield* reject("analysis", `invalid entry module: ${entryProblem}`);
    const actual = snapshot.files.map(({ relativePath }) => relativePath);
    const declared = produced.files.map(({ path }) => path).sort(TreeSnapshot.comparePortablePaths);
    if (actual.length !== declared.length || actual.some((path, index) => path !== declared[index])) {
      return yield* reject("analysis", "provider metadata does not exactly cover the output tree");
    }
    if (!declared.includes(produced.entryModule)) {
      return yield* reject("analysis", "entry module is not a declared output");
    }
    const mediaTypes: Record<string, string> = {};
    const declaredSet = new Set(declared);
    for (const file of produced.files) {
      const problem = TreeSnapshot.validatePortablePath(file.path);
      if (problem !== undefined) {
        return yield* reject("analysis", `invalid provider output path: ${problem}`);
      }
      if (!canonicalMediaType.test(file.mediaType)) {
        return yield* reject("analysis", `invalid provider media type for ${file.path}`);
      }
      for (const imported of file.imports) {
        if (TreeSnapshot.validatePortablePath(imported) !== undefined || !declaredSet.has(imported)) {
          return yield* reject("analysis", `unknown output graph edge ${file.path} -> ${imported}`);
        }
      }
      mediaTypes[file.path] = file.mediaType;
    }
    return Object.freeze(mediaTypes);
  });

const html = (entryModule: string, stylesheets: readonly string[]): Uint8Array =>
  new TextEncoder().encode(
    `<!doctype html>\n<html><head><meta charset="utf-8">${
      stylesheets.map((stylesheet) => `<link rel="stylesheet" href="./${stylesheet}">`).join("")
    }</head><body><script type="module" src="./${entryModule}"></script></body></html>\n`,
  );

export const build = (
  input: BuildInput,
): Effect.Effect<
  StaticBrowserApplication,
  BuildError,
  Provider | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const resources = yield* validateRequest(input.request);
      const provider = yield* Provider;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tree = yield* fileSystem.makeTempDirectoryScoped({ prefix: "effect-build-browser-profile-" }).pipe(
        Effect.mapError(() =>
          new ArtifactInvalid({ path: input.generationRoot, reason: "unable to allocate staging" })
        ),
      );
      const produced = yield* provider.produce(input.request, tree);
      const providerSnapshot = yield* TreeSnapshot.observe(tree);
      const mediaTypes = { ...(yield* validateProduced(produced, providerSnapshot)) };
      const providerPaths = new Set(Object.keys(mediaTypes).map((relativePath) => relativePath.toLowerCase()));
      for (const { resource, borrowed } of resources) {
        if (providerPaths.has(resource.destination.toLowerCase())) {
          return yield* reject("analysis", `resource collides with provider output: ${resource.destination}`);
        }
        const contents = yield* fileSystem.readFile(borrowed.path).pipe(
          Effect.mapError(() => new ArtifactInvalid({ path: borrowed.path, reason: "unable to read resource" })),
        );
        yield* BorrowedContent.revalidate(borrowed);
        const destination = path.join(tree, resource.destination);
        yield* fileSystem.makeDirectory(path.dirname(destination), { recursive: true }).pipe(
          Effect.mapError(() =>
            new ArtifactInvalid({ path: destination, reason: "unable to stage resource directory" })
          ),
        );
        yield* fileSystem.writeFile(destination, contents, { flag: "wx" }).pipe(
          Effect.mapError(() => new ArtifactInvalid({ path: destination, reason: "unable to stage resource" })),
        );
        mediaTypes[resource.destination] = resource.mediaType;
      }
      const indexPath = path.join(tree, "index.html");
      const stylesheets = Object.entries(mediaTypes)
        .filter(([, mediaType]) => mediaType === "text/css; charset=utf-8")
        .map(([relativePath]) => relativePath)
        .sort(TreeSnapshot.comparePortablePaths);
      yield* fileSystem.writeFile(indexPath, html(produced.entryModule, stylesheets), { flag: "wx" }).pipe(
        Effect.mapError(() => new ArtifactInvalid({ path: indexPath, reason: "unable to stage generated host" })),
      );
      mediaTypes["index.html"] = "text/html; charset=utf-8";
      const snapshot = yield* TreeSnapshot.observe(tree);
      const subject: Subject = Object.freeze({
        profile: protocol,
        entry: "index.html",
        mount: "relative-same-origin",
        host: hostProtocol,
      });
      return yield* Generation.publish({
        generationRoot: input.generationRoot,
        snapshot,
        subject,
        mediaTypes,
      });
    }),
  );

import type { DirectoryGeneration } from "../Author/Generation.js";

export const protocol = "effect-build/profile/static-browser-application@1" as const;
export const hostProtocol = "effect-build/generated-module-host@1" as const;

export interface Resource {
  readonly source: string;
  readonly destination: string;
  readonly mediaType: string;
}

export interface Request {
  readonly entrypoint: string;
  readonly resources: readonly Resource[];
}

export interface Subject {
  readonly profile: typeof protocol;
  readonly entry: "index.html";
  readonly mount: "relative-same-origin";
  readonly host: typeof hostProtocol;
}

export type StaticBrowserApplication = DirectoryGeneration<Subject>;

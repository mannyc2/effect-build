declare module "postject" {
  export function inject(
    filename: string,
    resourceName: string,
    resourceData: import("node:buffer").Buffer,
    options?: { readonly sentinelFuse?: string; readonly machoSegmentName?: string; readonly overwrite?: boolean },
  ): Promise<void>;
}

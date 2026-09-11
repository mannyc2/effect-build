/** Apple plist dictionaries use one document envelope and XML text encoding. */
const xml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
    "'",
    "&apos;",
  );
export const plist = (fields: Readonly<Record<string, string | true>>): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    ...Object.entries(fields).map(([key, value]) =>
      `<key>${xml(key)}</key>${value === true ? "<true/>" : `<string>${xml(value)}</string>`}`
    ),
    "</dict></plist>",
    "",
  ].join("\n");

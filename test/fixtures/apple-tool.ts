export interface Config {
  readonly log: string;
  readonly fail?: string;
  /** Each invocation records whether this path existed when the tool ran: signing happens in staging, never at an existing destination. */
  readonly watchPath?: string;
  readonly mutateDuringVerify?: string;
  readonly corruptTarget?: boolean;
  readonly submit?: unknown;
  readonly wait?: unknown;
  readonly waitForAbort?: boolean;
  readonly info?: unknown;
  readonly logResponse?: unknown;
  readonly rawResponse?: string;
}
export interface Invocation {
  readonly tool: string;
  readonly args: readonly string[];
  readonly watchPathExisted: boolean;
  readonly payloadSha?: string;
  readonly plist?: string;
}
export interface PackedEntry {
  readonly path: string;
  readonly kind: string;
  readonly contents?: string;
  readonly target?: string;
  readonly mode: number;
}

import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
const [configPath, name, ...args] = process.argv.slice(2);
if (configPath === undefined) throw new Error("missing fixture configuration");
const config: Config = JSON.parse(readFileSync(configPath, "utf8"));
if (name === "--version" && args.length === 0) {
  process.stdout.write("xcrun version 70.\n");
  process.exit(0);
}
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
appendFileSync(
  config.log,
  JSON.stringify({
    tool: name,
    args,
    watchPathExisted: config.watchPath ? existsSync(config.watchPath) : false,
    ...(name === "notarytool" && args[0] === "submit" ? { payloadSha: sha(args[1]!) } : {}),
    ...(name === "plutil" ? { plist: readFileSync(args.at(-1)!, "utf8") } : {}),
  }) + "\n",
);
const fail = (phase: string) => {
  if (config.fail === phase) {
    process.stderr.write(phase + " failed private-notary:$42");
    process.exit(37);
  }
};
const write = (path: string, contents: string | Uint8Array) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};
const collect = (directory: string, prefix = ""): PackedEntry[] =>
  readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name), relative = prefix + name, info = lstatSync(path);
    if (info.isSymbolicLink()) {
      return [{ path: relative, kind: "symlink", mode: info.mode & 0o777, target: readlinkSync(path) }];
    }
    if (info.isDirectory()) {
      return [{ path: relative, kind: "directory", mode: info.mode & 0o777 }, ...collect(path, relative + "/")];
    }
    return [{ path: relative, kind: "file", mode: info.mode & 0o777, contents: readFileSync(path).toString("base64") }];
  });
const signature = (target: string) =>
  join(target, target.endsWith(".app") ? "Contents/_CodeSignature" : "_CodeSignature", "CodeResources");
const verifySignature = (target: string) => {
  if (lstatSync(target).isDirectory()) { if (!existsSync(signature(target))) throw new Error("missing app signature"); }
  else if (!readFileSync(target, "utf8").includes(":signed")) throw new Error("missing file signature");
};
const target = args.at(-1)!;
switch (name) {
  case "plutil":
    if (args[0] !== "-lint" || !readFileSync(target, "utf8").includes("<plist")) throw new Error("invalid plist");
    fail("plutil");
    break;
  case "ditto":
    if (args[0] === "-c") {
      const src = args.at(-2)!;
      write(
        target,
        JSON.stringify({
          entries: lstatSync(src).isDirectory()
            ? collect(src)
            : [{
              path: basename(src),
              kind: "file",
              mode: lstatSync(src).mode & 0o777,
              contents: readFileSync(src).toString("base64"),
            }],
          bundle: basename(src),
        }),
      );
    } else {
      cpSync(args[0]!, args[1]!, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
      chmodSync(args[1]!, lstatSync(args[0]!).mode & 0o777);
    }
    fail("ditto");
    break;
  case "codesign":
    if (args[0] === "--force") {
      if (!args.includes("--sign") || !args.includes("--timestamp")) throw new Error("missing signing options");
      if (lstatSync(target).isDirectory()) write(signature(target), "signed resources");
      else appendFileSync(target, ":signed");
      if (config.corruptTarget && !lstatSync(target).isDirectory()) {
        const bytes = readFileSync(target);
        bytes.writeUInt32LE(0x01000007, 4);
        writeFileSync(target, bytes);
      }
      fail("codesign.sign");
    } else if (args[0] === "--verify") {
      verifySignature(target);
      if (config.mutateDuringVerify) write(config.mutateDuringVerify, "changed original");
      fail("codesign.verify");
    } else throw new Error("unsupported codesign command");
    break;
  case "hdiutil":
    if (args[0] === "create") {
      write(target, JSON.stringify({ entries: collect(args[args.indexOf("-srcfolder") + 1]!) }));
      fail("hdiutil.create");
    } else if (args[0] === "verify") {
      JSON.parse(readFileSync(target, "utf8"));
      fail("hdiutil.verify");
    } else throw new Error("unsupported hdiutil command");
    break;
  case "pkgbuild":
    if (args[0] !== "--component" && args[0] !== "--root") throw new Error("missing installer component or root");
    write(
      target,
      JSON.stringify({
        entries: collect(args[1]!),
        bundle: args[0] === "--component" ? basename(args[1]!) : "",
        location: args[args.indexOf("--install-location") + 1]!,
      }),
    );
    fail("pkgbuild");
    break;
  case "productbuild":
    if (args[0] !== "--package") throw new Error("missing component package");
    write(target, readFileSync(args[1]!));
    fail("productbuild");
    break;
  case "productsign":
    write(target, readFileSync(args.at(-2)!, "utf8") + ":signed");
    fail("productsign");
    break;
  case "pkgutil":
    if (args[0] === "--check-signature") verifySignature(target);
    else if (args[0] === "--payload-files") {
      const packed: { entries: PackedEntry[]; bundle: string } = JSON.parse(readFileSync(target, "utf8"));
      process.stdout.write(
        packed.entries.map((entry) => (packed.bundle ? packed.bundle + "/" : "") + entry.path).join("\n") + "\n",
      );
    } else throw new Error("unsupported pkgutil command");
    fail("pkgutil");
    break;
  case "notarytool": {
    if (
      !["submit", "wait", "info", "log"].includes(args[0] ?? "") || !args.includes("--output-format")
      || !args.includes("json")
    ) throw new Error("unsupported notary command");
    if (args[0] === "submit" && args.includes("--wait")) throw new Error("submission must return before waiting");
    fail("notarytool." + args[0]);
    if (args[0] === "wait" && config.waitForAbort) {
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
    const operation = args[0] as "submit" | "wait" | "info" | "log";
    const defaults = operation === "log"
      ? { jobId: "3f33f890-0cbf-4c1e-bb39-6fba74a594f0", status: "Accepted", issues: null }
      : { id: "3f33f890-0cbf-4c1e-bb39-6fba74a594f0", status: "Accepted" };
    process.stdout.write(
      config.rawResponse
        ?? JSON.stringify(
          config[operation === "log" ? "logResponse" : operation] ?? (args[0] === "wait" ? config.submit : undefined)
            ?? defaults,
        ),
    );
    break;
  }
  case "stapler":
    if (args[0] === "staple") {
      if (lstatSync(target).isDirectory()) write(join(target, "Contents/_CodeSignature/NotaryTicket"), "ticket");
      else appendFileSync(target, ":ticket");
      fail("stapler.staple");
    } else if (args[0] === "validate") {
      const ticket = lstatSync(target).isDirectory()
        ? existsSync(join(target, "Contents/_CodeSignature/NotaryTicket"))
        : readFileSync(target, "utf8").includes(":ticket");
      if (!ticket) throw new Error("missing notarization ticket");
      fail("stapler.validate");
    } else throw new Error("unsupported stapler command");
    break;
  case "spctl":
    if (args[0] !== "--assess" || !args.includes("--type")) throw new Error("invalid assessment command");
    fail("spctl");
    break;
  default:
    throw new Error("unsupported native tool " + name);
}

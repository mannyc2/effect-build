"use strict";

// Node's permission model does not restrict network access. Sigstore verification
// therefore runs behind this preload in addition to using a dependency closure
// with no TUF or networking client. The preload seals the standard Node network
// entry points before the verifier module graph is evaluated.
const Module = require("node:module");
const dgram = require("node:dgram");
const dns = require("node:dns");
const http = require("node:http");
const http2 = require("node:http2");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

// Materialize the standard streams before module acquisition is sealed. Node
// lazily constructs them through node:net; the verifier still needs stdin for
// its public bundle/root input and stdout for its public signer projection.
void process.stdin;
void process.stdout;
void process.stderr;

const forbidden = new Set([
  "dgram",
  "dns",
  "dns/promises",
  "http",
  "http2",
  "https",
  "net",
  "tls",
  "undici",
]);
const canonicalModuleName = (name) => name.startsWith("node:") ? name.slice(5) : name;
function deny() {
  throw new Error("network access is forbidden in the Sigstore verifier child");
}
const replace = (target, name) => {
  if (target !== undefined && typeof target[name] === "function") {
    Object.defineProperty(target, name, {
      configurable: false,
      enumerable: true,
      value: deny,
      writable: false,
    });
  }
};
const resolverMethods = [
  "cancel",
  "getDefaultResultOrder",
  "getServers",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTxt",
  "reverse",
  "setLocalAddress",
  "setServers",
];

for (const [target, names] of [
  [dgram, ["createSocket", "Socket"]],
  [dgram.Socket?.prototype, ["bind", "connect", "send"]],
  [dns, [
    "Resolver",
    "getDefaultResultOrder",
    "getServers",
    "lookup",
    "lookupService",
    "resolve",
    "resolve4",
    "resolve6",
    "resolveAny",
    "resolveCaa",
    "resolveCname",
    "resolveMx",
    "resolveNaptr",
    "resolveNs",
    "resolvePtr",
    "resolveSoa",
    "resolveSrv",
    "resolveTxt",
    "reverse",
    "setDefaultResultOrder",
    "setServers",
  ]],
  [dns.Resolver?.prototype, resolverMethods],
  [dns.promises, [
    "Resolver",
    "getDefaultResultOrder",
    "getServers",
    "lookup",
    "lookupService",
    "resolve",
    "resolve4",
    "resolve6",
    "resolveAny",
    "resolveCaa",
    "resolveCname",
    "resolveMx",
    "resolveNaptr",
    "resolveNs",
    "resolvePtr",
    "resolveSoa",
    "resolveSrv",
    "resolveTxt",
    "reverse",
    "setDefaultResultOrder",
    "setServers",
  ]],
  [dns.promises?.Resolver?.prototype, resolverMethods],
  [http, ["Agent", "ClientRequest", "Server", "createServer", "get", "request"]],
  [http.Agent?.prototype, ["createConnection"]],
  [http.ClientRequest?.prototype, ["end", "write"]],
  [http2, ["connect", "createSecureServer", "createServer"]],
  [https, ["Agent", "Server", "createServer", "get", "request"]],
  [https.Agent?.prototype, ["createConnection"]],
  [net, ["Server", "Socket", "connect", "createConnection", "createServer"]],
  [net.Socket?.prototype, ["connect"]],
  [net.Server?.prototype, ["listen"]],
  [tls, ["Server", "TLSSocket", "connect", "createServer"]],
  [tls.TLSSocket?.prototype, ["connect"]],
]) {
  for (const name of names) replace(target, name);
}

for (const name of ["EventSource", "WebSocket", "fetch"]) replace(globalThis, name);

const originalLoad = Module._load;
Object.defineProperty(Module, "_load", {
  configurable: false,
  value(request, parent, isMain) {
    if (typeof request === "string" && forbidden.has(canonicalModuleName(request))) deny();
    return originalLoad.call(this, request, parent, isMain);
  },
  writable: false,
});

if (typeof process.getBuiltinModule === "function") {
  const originalGetBuiltinModule = process.getBuiltinModule.bind(process);
  Object.defineProperty(process, "getBuiltinModule", {
    configurable: false,
    value(name) {
      if (typeof name === "string" && forbidden.has(canonicalModuleName(name))) deny();
      return originalGetBuiltinModule(name);
    },
    writable: false,
  });
}

Module.syncBuiltinESMExports();

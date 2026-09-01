"use strict";

// Test-only: retain the standard module and prototype objects before the
// production guard is preloaded. The guard must revoke the surfaces on these
// already-issued objects as well as deny later imports.
const dgram = require("node:dgram");
const dns = require("node:dns");
const http = require("node:http");
const http2 = require("node:http2");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

globalThis.__effectBuildNetworkSurfaces = Object.freeze({
  dgram,
  dns,
  http,
  http2,
  https,
  net,
  tls,
  prototypes: Object.freeze({
    dgramSocket: dgram.Socket.prototype,
    dnsPromisesResolver: dns.promises.Resolver.prototype,
    dnsResolver: dns.Resolver.prototype,
    httpAgent: http.Agent.prototype,
    httpClientRequest: http.ClientRequest.prototype,
    httpsAgent: https.Agent.prototype,
    netServer: net.Server.prototype,
    netSocket: net.Socket.prototype,
    tlsSocket: tls.TLSSocket.prototype,
  }),
});

/**
 * bun-types 1.3.14 uses these names without importing them in its Node module
 * declarations. Complete those declarations using Node's own types; the Bun API
 * still exposes the unmodified native BuildConfig, BuildOutput and Transpiler.
 * This file is deliberately ambient, with no top-level import/export.
 */
declare module "node:util" {
  type TextEncoderEncodeIntoResult = import("util").EncodeIntoResult;
}
declare module "node:tls" {
  type ConnectionOptions = import("tls").ConnectionOptions;
  type TLSSocket = import("tls").TLSSocket;
  type KeyObject = import("node:crypto").KeyObject;
}

type Value =
  | { readonly _tag: "Array"; readonly values: readonly Value[] }
  | { readonly _tag: "Boolean"; readonly value: boolean }
  | { readonly _tag: "Data"; readonly value: string }
  | { readonly _tag: "Date"; readonly value: string }
  | { readonly _tag: "Dictionary"; readonly entries: readonly (readonly [string, Value])[] }
  | { readonly _tag: "Integer"; readonly value: string }
  | { readonly _tag: "Real"; readonly value: string }
  | { readonly _tag: "String"; readonly value: string };

const whitespace = /\s/u;
const integer = /^-?(?:0|[1-9]\d*)$/u;
const real = /^-?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const data = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

const decodeEntity = (entity: string): string => {
  switch (entity) {
    case "amp":
      return "&";
    case "apos":
      return "'";
    case "gt":
      return ">";
    case "lt":
      return "<";
    case "quot":
      return '"';
    default: {
      const hexadecimal = /^#x([0-9A-Fa-f]+)$/u.exec(entity)?.[1];
      const decimal = /^#(\d+)$/u.exec(entity)?.[1];
      const point = hexadecimal === undefined
        ? decimal === undefined ? undefined : Number.parseInt(decimal, 10)
        : Number.parseInt(hexadecimal, 16);
      if (
        point === undefined || !Number.isSafeInteger(point) || point <= 0 || point > 0x10ffff
        || (point >= 0xd800 && point <= 0xdfff)
      ) {
        throw new TypeError(`unsupported XML entity &${entity};`);
      }
      return String.fromCodePoint(point);
    }
  }
};

const decodeText = (text: string): string =>
  text.replaceAll(/&([^;]+);/gu, (_match, entity: string) => decodeEntity(entity));

class Parser {
  private readonly source: string;
  private offset = 0;

  constructor(source: string) {
    this.source = source.startsWith("\uFEFF") ? source.slice(1) : source;
  }

  document(): Value {
    this.skipMisc(true);
    this.openPlist();
    this.skipMisc(false);
    const value = this.value();
    this.skipMisc(false);
    this.close("plist");
    this.skipMisc(false);
    if (this.offset !== this.source.length) this.fail("unexpected content after plist");
    return value;
  }

  private value(): Value {
    this.skipMisc(false);
    if (this.startsWith("<dict")) return this.dictionary();
    if (this.startsWith("<array")) return this.array();
    if (this.startsWith("<string")) return { _tag: "String", value: this.text("string") };
    if (this.startsWith("<integer")) {
      const value = this.text("integer").trim();
      if (!integer.test(value)) this.fail("invalid integer value");
      return { _tag: "Integer", value: BigInt(value).toString() };
    }
    if (this.startsWith("<real")) {
      const supplied = this.text("real").trim();
      if (!real.test(supplied)) this.fail("invalid real value");
      const parsed = Number(supplied);
      if (!Number.isFinite(parsed)) this.fail("non-finite real value");
      return { _tag: "Real", value: Object.is(parsed, -0) ? "-0" : parsed.toString() };
    }
    if (this.startsWith("<data")) {
      const value = this.text("data").replaceAll(/\s/gu, "");
      if (!data.test(value)) this.fail("invalid base64 data value");
      return { _tag: "Data", value };
    }
    if (this.startsWith("<date")) {
      const value = this.text("date").trim();
      if (!date.test(value) || Number.isNaN(Date.parse(value))) this.fail("invalid date value");
      return { _tag: "Date", value };
    }
    if (this.empty("true")) return { _tag: "Boolean", value: true };
    if (this.empty("false")) return { _tag: "Boolean", value: false };
    this.fail("unsupported plist value");
  }

  private dictionary(): Value {
    const selfClosing = this.open("dict");
    if (selfClosing) return { _tag: "Dictionary", entries: [] };
    const entries: Array<readonly [string, Value]> = [];
    const keys = new Set<string>();
    while (true) {
      this.skipMisc(false);
      if (this.consume("</dict>")) break;
      if (!this.startsWith("<key")) this.fail("dictionary entry is missing a key");
      const key = this.text("key");
      if (keys.has(key)) this.fail(`duplicate dictionary key ${JSON.stringify(key)}`);
      keys.add(key);
      entries.push([key, this.value()]);
    }
    return { _tag: "Dictionary", entries };
  }

  private array(): Value {
    const selfClosing = this.open("array");
    if (selfClosing) return { _tag: "Array", values: [] };
    const values: Value[] = [];
    while (true) {
      this.skipMisc(false);
      if (this.consume("</array>")) break;
      values.push(this.value());
    }
    return { _tag: "Array", values };
  }

  private text(name: string): string {
    if (this.open(name)) return "";
    const close = `</${name}>`;
    const end = this.source.indexOf(close, this.offset);
    if (end === -1) this.fail(`missing ${close}`);
    const value = this.source.slice(this.offset, end);
    if (value.includes("<")) this.fail(`nested markup in ${name}`);
    this.offset = end + close.length;
    return decodeText(value);
  }

  private empty(name: string): boolean {
    if (!this.startsWith(`<${name}`)) return false;
    if (this.open(name)) return true;
    this.skipSpace();
    this.close(name);
    return true;
  }

  private open(name: string): boolean {
    const match = new RegExp(`^<${name}\\s*(/?)>`, "u").exec(this.source.slice(this.offset));
    if (match === null) this.fail(`expected <${name}>`);
    this.offset += match[0].length;
    return match[1] === "/";
  }

  private openPlist(): void {
    const match = /^<plist\s+version=(?:"1\.0"|'1\.0')\s*>/u.exec(this.source.slice(this.offset));
    if (match === null) this.fail("expected a version 1.0 plist root");
    this.offset += match[0].length;
  }

  private close(name: string): void {
    if (!this.consume(`</${name}>`)) this.fail(`expected </${name}>`);
  }

  private skipMisc(initial: boolean): void {
    let changed = true;
    while (changed) {
      const before = this.offset;
      this.skipSpace();
      if (this.startsWith("<!--")) {
        const end = this.source.indexOf("-->", this.offset + 4);
        if (end === -1) this.fail("unterminated XML comment");
        this.offset = end + 3;
      } else if (initial && this.startsWith("<?xml")) {
        const end = this.source.indexOf("?>", this.offset + 5);
        if (end === -1) this.fail("unterminated XML declaration");
        this.offset = end + 2;
      } else if (initial && this.startsWith("<!DOCTYPE")) {
        const end = this.source.indexOf(">", this.offset + 9);
        if (end === -1) this.fail("unterminated plist doctype");
        const declaration = this.source.slice(this.offset, end + 1);
        if (!/^<!DOCTYPE\s+plist\s+PUBLIC\s+.+>$/u.test(declaration) || declaration.includes("[")) {
          this.fail("unsupported plist doctype");
        }
        this.offset = end + 1;
      }
      changed = this.offset !== before;
    }
  }

  private skipSpace(): void {
    while (this.offset < this.source.length && whitespace.test(this.source[this.offset]!)) this.offset += 1;
  }

  private startsWith(value: string): boolean {
    return this.source.startsWith(value, this.offset);
  }

  private consume(value: string): boolean {
    if (!this.startsWith(value)) return false;
    this.offset += value.length;
    return true;
  }

  private fail(reason: string): never {
    throw new TypeError(`${reason} at XML offset ${this.offset}`);
  }
}

const canonical = (value: Value): unknown => {
  switch (value._tag) {
    case "Array":
      return ["array", value.values.map(canonical)];
    case "Boolean":
      return ["boolean", value.value];
    case "Data":
      return ["data", value.value];
    case "Date":
      return ["date", value.value];
    case "Dictionary":
      return [
        "dictionary",
        [...value.entries]
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, entry]) => [key, canonical(entry)]),
      ];
    case "Integer":
      return ["integer", value.value];
    case "Real":
      return ["real", value.value];
    case "String":
      return ["string", value.value];
  }
};

export const canonicalXml = (source: string): string => JSON.stringify(canonical(new Parser(source).document()));

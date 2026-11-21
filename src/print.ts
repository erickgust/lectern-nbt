import { plain, type Codec } from "./codec.js";

const LEAVES: readonly string[] = [
  "",
  "byte",
  "short",
  "int",
  "long",
  "float",
  "double",
  "byteArray",
  "string",
  "",
  "",
  "intArray",
  "longArray",
];
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

function property(key: string): string {
  if (key === "__proto__") return '["__proto__"]';
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

function source(codec: Codec, indent: string): string {
  if (codec.tag === 9) {
    if ("item" in codec) return `list(${source(codec.item, indent)})`;
    return `{ tag: 9, items: [${codec.items.map((item) => source(item, indent)).join(", ")}] }`;
  }
  if (codec.tag !== 10) return LEAVES[codec.tag] ?? "";
  const inner = `${indent}  `;
  const fields = codec.codecs.map((field, i) => {
    const value = source(field, inner);
    const key = codec.keys[i] ?? "";
    return `${inner}${property(key)}: ${codec.optionals[i] === true ? `optional(${value})` : value},\n`;
  });
  const body = fields.length === 0 ? "compound({})" : `compound({\n${fields.join("")}${indent}})`;
  return codec.strict ? `strict(${body})` : body;
}

export function print(codec: Codec): string {
  return source(plain(codec), "");
}

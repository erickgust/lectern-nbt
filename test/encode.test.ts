import { fc, test } from "@fast-check/vitest";
import { MUtf8Encoder } from "mutf-8";
import { Float32, Int16, Int32, Int8, type RootTagLike, type Tag } from "nbtify";
import { expect, it } from "vitest";
import {
  byte,
  byteArray,
  compound,
  encode,
  float,
  int,
  intArray,
  list,
  long,
  longArray,
  optional,
  string,
  type Codec,
  type EncodeError,
  type NbtDocument,
  type NbtValue,
} from "../src/index.js";
import {
  decoded,
  decodedWith,
  firstDifference,
  fixture,
  fixtures,
  int32,
  named,
  nbtify,
  root,
  utf,
} from "./nbt.js";

function encoded<C extends Codec>(doc: NbtDocument<C>): Uint8Array {
  const result = encode(doc);
  if (!result.ok) throw new Error(`${result.error.kind} at ${result.error.path.join(".")}`);
  return result.value;
}

const unchecked = (_value: unknown): _value is NbtValue => true;

function document(codec: Codec, value: unknown): NbtDocument {
  if (!unchecked(value)) throw new Error("unreachable");
  return { name: "", root: value, codec, endian: "big" };
}

const errorOf = (codec: Codec, value: unknown): EncodeError | undefined => {
  const result = encode(document(codec, value));
  return result.ok ? undefined : result.error;
};

it.each(fixtures)("writes the %s fixture back byte for byte", (name) => {
  const bytes = fixture(name);
  expect(Buffer.from(encoded(decoded(bytes))).equals(Buffer.from(bytes))).toBe(true);
});

it.each(fixtures)("converts the %s fixture to little-endian and back", (name) => {
  const doc = decoded(fixture(name));
  const little = decoded(encoded({ ...doc, endian: "little" }), "little");
  expect(firstDifference(little.root, doc.root)).toBeUndefined();
  expect(little.codec).toEqual(doc.codec);
});

it("writes keys in codec order, integer-like keys included", () => {
  const bytes = root(...named(1, "1", 1), ...named(1, "0", 0), ...named(1, "a", 2));
  expect(encoded(decoded(bytes))).toEqual(bytes);
});

it("writes an own __proto__ key back", () => {
  const bytes = root(...named(8, "__proto__", ...utf("x")));
  expect(encoded(decoded(bytes))).toEqual(bytes);
});

it("writes empty lists with element type End", () => {
  const bytes = encoded(document(compound({ L: list(int) }), { L: [] }));
  expect(bytes).toEqual(root(...named(9, "L", 0, ...int32(0))));
});

it("skips absent and undefined optional keys", () => {
  const codec = compound({ a: optional(byte), b: optional(byte), c: byte });
  expect(encoded(document(codec, { b: undefined, c: byte(1) }))).toEqual(root(...named(1, "c", 1)));
});

it("writes typed array views at their own offset", () => {
  const codec = compound({ a: { tag: 11 }, b: { tag: 12 }, c: { tag: 7 } });
  const value = {
    a: new Int32Array([9, 1, -2]).subarray(1),
    b: new BigInt64Array([9n, -3n]).subarray(1),
    c: new Int8Array([9, -4]).subarray(1),
  };
  const doc = decoded(encoded(document(codec, value)));
  expect(firstDifference(doc.root, value)).toBeUndefined();
});

const detached = <T extends ArrayBufferView>(array: T): T => {
  structuredClone(array.buffer, { transfer: [array.buffer] });
  return array;
};

it.each(["big", "little"] as const)(
  "writes detached typed arrays as empty (%s-endian)",
  (endian) => {
    const codec = compound({ a: byteArray, b: intArray, c: longArray });
    const value = {
      a: detached(new Int8Array(4)),
      b: detached(new Int32Array(4)),
      c: detached(new BigInt64Array(4)),
    };
    const doc = decoded(encoded({ ...document(codec, value), endian }), endian);
    const empty = { a: new Int8Array(0), b: new Int32Array(0), c: new BigInt64Array(0) };
    expect(firstDifference(doc.root, empty)).toBeUndefined();
  },
);

it("reports an unknown key next to a non-enumerable codec key", () => {
  const value = { x: 5 };
  Object.defineProperty(value, "a", { value: 1 });
  expect(errorOf(compound({ a: byte }), value)).toEqual({ kind: "UnknownKey", path: ["x"] });
});

it("encodes a decoded document with a user codec", async () => {
  const Item = compound({ id: string, Count: byte });
  const Player = compound({ Health: float, Inventory: list(Item) });
  const bytes = await nbtify({
    Health: new Float32(20),
    Inventory: [{ id: "a", Count: new Int8(1), extra: new Int16(2) }],
    UUID: new Int32Array([1, 2]),
  });
  expect(encoded(decodedWith(bytes, Player))).toEqual(bytes);
});

const cyclic = (): Codec => {
  const codecs: Codec[] = [];
  const codec: Codec = { tag: 10, keys: ["self"], codecs, optionals: [false], strict: false };
  codecs.push(codec);
  return codec;
};
const loop: Record<string, unknown> = {};
loop["self"] = loop;

it.each<[string, Codec, unknown, EncodeError]>([
  [
    "a byte out of range",
    compound({ a: byte }),
    { a: 300 },
    { kind: "OutOfRange", expected: "byte", value: 300, path: ["a"] },
  ],
  [
    "a fractional int",
    compound({ a: int }),
    { a: 7.5 },
    { kind: "OutOfRange", expected: "int", value: 7.5, path: ["a"] },
  ],
  [
    "a float overflow",
    compound({ a: float }),
    { a: 1e39 },
    { kind: "OutOfRange", expected: "float", value: 1e39, path: ["a"] },
  ],
  [
    "a long out of range",
    compound({ a: long }),
    { a: 2n ** 63n },
    { kind: "OutOfRange", expected: "long", value: 2n ** 63n, path: ["a"] },
  ],
  [
    "a number where a long belongs",
    compound({ a: long }),
    { a: 5 },
    { kind: "TagMismatch", expected: "long", found: "double", path: ["a"] },
  ],
  [
    "a null value",
    compound({ a: list(string) }),
    { a: ["x", null] },
    { kind: "TagMismatch", expected: "string", found: "end", path: ["a", 1] },
  ],
  ["a missing key", compound({ a: byte }), {}, { kind: "MissingKey", path: ["a"] }],
  [
    "an unknown key deep inside",
    compound({ L: list(compound({ id: string })) }),
    { L: [{ id: "a" }, { id: "b", x: 1 }] },
    { kind: "UnknownKey", path: ["L", 1, "x"] },
  ],
  [
    "a string too long",
    compound({ s: string }),
    { s: "한".repeat(21_846) },
    { kind: "StringTooLong", path: ["s"] },
  ],
  [
    "a mixed list with an extra element",
    compound({ L: { tag: 9, items: [list(byte)] } }),
    { L: [[], []] },
    { kind: "UnknownKey", path: ["L", 1] },
  ],
  ["a cycle", cyclic(), loop, { kind: "TooDeep", path: Array.from({ length: 512 }, () => "self") }],
])("reports %s", (_name, codec, value, error) => {
  expect(errorOf(codec, value)).toEqual(error);
});

const mutf8 = new MUtf8Encoder();
test.prop([
  fc.string({ unit: fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCodePoint(n)) }),
])("writes strings as MUTF-8", (text) => {
  const bytes = mutf8.encode(text);
  const header = [8, 0, 0, bytes.length >> 8, bytes.length & 0xff];
  expect(encoded(document(string, text))).toEqual(new Uint8Array([...header, ...bytes]));
});

const long64 = fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n });
const leaves: fc.Arbitrary<Tag>[] = [
  fc.integer({ min: -128, max: 127 }).map((n) => new Int8(n)),
  fc.integer({ min: -32_768, max: 32_767 }).map((n) => new Int16(n)),
  fc.integer().map((n) => new Int32(n)),
  long64,
  fc.float({ noNaN: true }).map((n) => new Float32(n)),
  fc.double({ noNaN: true }),
  fc.string(),
  fc.array(fc.integer({ min: -128, max: 127 })).map((n) => Int8Array.from(n)),
  fc.array(fc.integer()).map((n) => Int32Array.from(n)),
  fc.array(long64).map((n) => BigInt64Array.from(n)),
];
const lists = (items: readonly fc.Arbitrary<Tag>[]): fc.Arbitrary<Tag>[] =>
  items.map((item) => fc.array(item, { maxLength: 4 }));

function tree(depth: number): fc.Arbitrary<Tag> {
  if (depth === 0) return fc.oneof(...leaves, ...lists(leaves));
  const record: fc.Arbitrary<Tag> = fc.dictionary(fc.string(), tree(depth - 1), { maxKeys: 4 });
  const items = [...leaves, record, ...lists(leaves)];
  return fc.oneof(...items, ...lists(items));
}

const rootTag: fc.Arbitrary<RootTagLike> = fc.dictionary(fc.string(), tree(2), { maxKeys: 6 });

test.prop([rootTag])("round-trips random trees", async (value) => {
  const doc = decoded(await nbtify(value));
  const bytes = encoded(doc);
  const again = decoded(bytes);
  expect(again.root).toEqual(doc.root);
  expect(Buffer.from(encoded(again)).equals(Buffer.from(bytes))).toBe(true);
});

const entities = decoded(fixture("entities")).codec;
test.prop([fc.anything()])("never throws on any value", (value) => {
  expect(typeof encode(document(entities, value)).ok).toBe("boolean");
});

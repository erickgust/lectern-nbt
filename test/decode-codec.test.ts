import { fc, test } from "@fast-check/vitest";
import { Float32, Int16, Int8 } from "nbtify";
import { expect, it } from "vitest";
import {
  byte,
  compound,
  decode,
  double,
  extend,
  float,
  int,
  intArray,
  list,
  optional,
  short,
  strict,
  string,
  type Codec,
  type NbtDocument,
} from "../src/index.js";
import { decoded, fixture, fixtures, int32, named, nbtify, root, utf } from "./nbt.js";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });
const Player = compound({ Name: string, Health: float, Pos: list(double), Inventory: list(Item) });
const Small = compound({ a: int, l: list(byte), s: optional(string) });

function decodedWith<C extends Codec>(bytes: Uint8Array, codec: C): NbtDocument<C> {
  const result = decode(bytes, codec);
  if (!result.ok) throw new Error(`${result.error.kind} at ${result.error.path.join(".")}`);
  return result.value;
}

const player = {
  Name: "Steve",
  Health: new Float32(20),
  Pos: [1.5, 64, -2],
  Inventory: [
    { id: "minecraft:torch", Count: new Int8(64) },
    { id: "minecraft:stone", Count: new Int8(1), Slot: new Int8(2) },
  ],
};

it("returns the given codec when the file has no extra keys", async () => {
  const doc = decodedWith(await nbtify(player), Player);
  expect(doc.codec).toBe(Player);
  expect(doc.root.Inventory[1]?.Slot).toBe(2);
  expect(doc.root.Health).toBe(20);
});

it("accepts an empty End-typed list for any list codec", async () => {
  expect(decodedWith(await nbtify({ ...player, Inventory: [] }), Player).codec).toBe(Player);
});

it("keeps extra keys in the root and appends them to the codec", async () => {
  const bytes = await nbtify({
    ...player,
    Inventory: [
      player.Inventory[0],
      { id: "x", Count: new Int8(1), tag: { Damage: new Int16(3) } },
    ],
    UUID: new Int32Array([1, 2, 3, 4]),
  });
  const doc = decodedWith(bytes, Player);
  const tagged = extend(Item, { tag: optional(compound({ Damage: short })) });
  expect(doc.codec).toEqual(extend(Player, { Inventory: list(tagged), UUID: intArray }));
  expect(doc.root).toMatchObject({ UUID: new Int32Array([1, 2, 3, 4]) });
  expect(Player.keys).toHaveLength(4);
});

it("keeps strict on a compound whose nested codec gained keys", () => {
  const codec = strict(compound({ t: compound({}) }));
  const doc = decodedWith(root(...named(10, "t", ...named(1, "x", 5), 0)), codec);
  expect(doc.codec).toEqual(strict(compound({ t: compound({ x: byte }) })));
});

it("allows a missing optional key", () => {
  const doc = decodedWith(
    root(...named(3, "a", ...int32(1)), ...named(9, "l", 1, ...int32(0))),
    Small,
  );
  expect(doc.codec).toBe(Small);
});

it("stores a leaf root codec as plain data", () => {
  const doc = decodedWith(new Uint8Array([1, 0, 0, 5]), byte);
  expect(doc.root).toBe(5);
  expect(structuredClone(doc.codec)).toEqual({ tag: 1 });
});

it.each(fixtures)("decodes the %s fixture again with its own inferred codec", (name) => {
  const bytes = fixture(name);
  const { codec } = decoded(bytes);
  expect(decodedWith(bytes, codec).codec).toBe(codec);
});

it("treats an inferred empty list codec as any list", async () => {
  const { codec } = decoded(await nbtify({ L: [] }));
  const doc = decodedWith(await nbtify({ L: [new Int8(1)] }), codec);
  expect(doc.codec).toEqual(compound({ L: list(byte) }));
});

it.each([
  [
    "a field with another tag",
    Small,
    root(...named(2, "a", 0, 1)),
    { kind: "TagMismatch", expected: "int", found: "short", offset: 3, path: ["a"] },
  ],
  [
    "a list with another item tag",
    Small,
    root(...named(3, "a", ...int32(1)), ...named(9, "l", 3, ...int32(0))),
    { kind: "TagMismatch", expected: "byte", found: "int", offset: 15, path: ["l"] },
  ],
  [
    "a root with another tag",
    Small,
    new Uint8Array([1, 0, 0, 5]),
    { kind: "TagMismatch", expected: "compound", found: "byte", offset: 0, path: [] },
  ],
  [
    "a mismatch inside a list element",
    compound({ L: list(Item) }),
    root(
      ...named(
        9,
        "L",
        10,
        ...int32(1),
        ...named(8, "id", ...utf("a")),
        ...named(2, "Count", 0, 1),
        0,
      ),
    ),
    { kind: "TagMismatch", expected: "byte", found: "short", offset: 20, path: ["L", 0, "Count"] },
  ],
  [
    "a missing key",
    Small,
    root(...named(9, "l", 1, ...int32(0))),
    { kind: "MissingKey", offset: 12, path: ["a"] },
  ],
  [
    "an extra key under strict",
    strict(Small),
    root(...named(3, "a", ...int32(1)), ...named(9, "l", 0, ...int32(0)), ...named(1, "x", 5)),
    { kind: "UnknownKey", offset: 20, path: ["x"] },
  ],
])("reports %s", (_name, codec, bytes, error) => {
  expect(decode(bytes, codec)).toEqual({ ok: false, error });
});

test.prop([fc.uint8Array({ maxLength: 64 })])("never throws with a codec", (body) => {
  expect(typeof decode(new Uint8Array([10, 0, 0, ...body]), strict(Small)).ok).toBe("boolean");
});

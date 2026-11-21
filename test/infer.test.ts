import { Int8 } from "nbtify";
import { expect, it } from "vitest";
import { decoded, fields, fixture, int32, itemOf, items, named, nbtify, root, utf } from "./nbt.js";

const compound = (...entries: (readonly [string, object, boolean])[]): object => ({
  tag: 10,
  keys: entries.map(([key]) => key),
  codecs: entries.map(([, codec]) => codec),
  optionals: entries.map(([, , optional]) => optional),
  strict: false,
});

it("infers one shared codec for the entities fixture", () => {
  const { codec } = decoded(fixture("entities"));
  const doubles = { tag: 9, item: { tag: 6 } };
  const entity = compound(
    ["id", { tag: 8 }, false],
    ["CustomName", { tag: 8 }, false],
    ["Pos", doubles, false],
    ["Motion", doubles, false],
    ["Rotation", { tag: 9, item: { tag: 5 } }, false],
    ["Health", { tag: 5 }, false],
    ["OnGround", { tag: 1 }, false],
    ["Air", { tag: 2 }, false],
    ["UUID", { tag: 11 }, false],
    ["Tags", { tag: 9, item: { tag: 8 } }, false],
    ["LastSeen", { tag: 4 }, false],
  );
  expect(codec).toEqual(compound(["Entities", { tag: 9, item: entity }, false]));
  expect(structuredClone(codec)).toEqual(codec);
});

it("merges list compounds, making missing keys optional in first-seen order", async () => {
  const doc = decoded(
    await nbtify({
      Items: [
        { id: "a", Count: new Int8(1) },
        { Slot: new Int8(0), id: "b", Count: new Int8(2), Tags: [] },
        { id: "c", Count: new Int8(3), Tags: ["x"] },
      ],
    }),
  );
  const item = compound(
    ["id", { tag: 8 }, false],
    ["Count", { tag: 1 }, false],
    ["Slot", { tag: 1 }, true],
    ["Tags", { tag: 9, item: { tag: 8 } }, true],
  );
  expect(doc.codec).toEqual(compound(["Items", { tag: 9, item }, false]));
});

it("merges nested compounds inside list elements", async () => {
  const doc = decoded(
    await nbtify({
      L: [{ tag: { a: new Int8(1) } }, { tag: { b: "x" } }, { tag: { a: new Int8(2) } }],
    }),
  );
  const tag = compound(["a", { tag: 1 }, true], ["b", { tag: 8 }, true]);
  expect(doc.codec).toEqual(
    compound(["L", { tag: 9, item: compound(["tag", tag, false]) }, false]),
  );
});

it("falls back to one codec per element when a shared key changes tag", async () => {
  const doc = decoded(await nbtify({ L: [{ a: new Int8(1) }, { a: "x" }, { a: new Int8(2) }] }));
  const elements = items(fields(doc.codec)[0]?.[1]);
  expect(elements).toEqual([
    compound(["a", { tag: 1 }, false]),
    compound(["a", { tag: 8 }, false]),
    compound(["a", { tag: 1 }, false]),
  ]);
  expect(elements[0]).toBe(elements[2]);
});

it("falls back per element for lists of lists with different item types", () => {
  const doc = decoded(
    root(...named(9, "L", 9, ...int32(2), 1, ...int32(1), 7, 8, ...int32(1), ...utf("x"))),
  );
  const lists = {
    tag: 9,
    items: [
      { tag: 9, item: { tag: 1 } },
      { tag: 9, item: { tag: 8 } },
    ],
  };
  expect(doc.codec).toEqual(compound(["L", lists, false]));
  expect(doc.root).toEqual({ L: [[7], ["x"]] });
});

it("treats empty lists as compatible with any list", () => {
  const doc = decoded(
    root(...named(9, "L", 9, ...int32(2), 0, ...int32(0), 3, ...int32(1), ...int32(5))),
  );
  expect(doc.codec).toEqual(compound(["L", { tag: 9, item: { tag: 9, item: { tag: 3 } } }, false]));
});

it("infers an empty list of any element type as an empty mixed list", () => {
  const doc = decoded(root(...named(9, "E", 10, ...int32(0))));
  expect(doc.codec).toEqual(compound(["E", { tag: 9, items: [] }, false]));
});

it("keeps lists of empty lists non-empty", () => {
  const doc = decoded(root(...named(9, "L", 9, ...int32(2), 0, ...int32(0), 0, ...int32(0))));
  expect(doc.codec).toEqual(compound(["L", { tag: 9, item: { tag: 9, items: [] } }, false]));
});

it("shares identical compound shapes within one decode", async () => {
  const doc = decoded(await nbtify({ a: { x: new Int8(1) }, b: { x: new Int8(2) } }));
  const [a, b] = fields(doc.codec);
  expect(a?.[1]).toBe(b?.[1]);
});

const wide = (count: number, wrap: (entry: number[]) => number[]): Uint8Array => {
  const head = [10, 0, 0, ...named(9, "L", 10, ...int32(count))];
  const elements = Array.from({ length: count }, (_, i) => [...wrap(named(1, `k${i}`, 1)), 0]);
  return new Uint8Array([head, ...elements, [0]].flat());
};

const nested = (entry: number[]): number[] => named(10, "tag", ...entry, 0);

it("merges many list compounds with unique keys in linear time", () => {
  const merged = fields(itemOf(fields(decoded(wide(20_000, (entry) => entry)).codec)[0]?.[1]));
  expect(merged).toHaveLength(20_000);
  expect(merged.every(([, , optional]) => optional)).toBe(true);
});

it("merges unique keys nested one compound deep in linear time", () => {
  const merged = fields(itemOf(fields(decoded(wide(20_000, nested)).codec)[0]?.[1]));
  expect(fields(merged[0]?.[1])).toHaveLength(20_000);
});

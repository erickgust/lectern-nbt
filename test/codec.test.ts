import { describe, expect, test } from "vitest";
import {
  byte,
  byteArray,
  compound,
  double,
  extend,
  float,
  int,
  list,
  long,
  optional,
  strict,
  string,
} from "../src/index.js";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });
const Player = compound({
  Name: string,
  Health: float,
  Pos: list(double),
  Inventory: list(Item),
  LastPlayed: long,
  UUID: byteArray,
});

describe("codecs", () => {
  test("are plain data that survives structuredClone", () => {
    for (const codec of [Player, strict(Player), extend(Player, { Glowing: byte })]) {
      expect(structuredClone(codec)).toEqual(codec);
      expect(JSON.parse(JSON.stringify(codec))).toEqual(codec);
    }
  });

  test("keep fields in order with leaves stored as tags", () => {
    expect(Item).toEqual({
      tag: 10,
      keys: ["id", "Count", "Slot"],
      codecs: [{ tag: 8 }, { tag: 1 }, { tag: 1 }],
      optionals: [false, false, true],
      strict: false,
    });
    expect(list(int)).toEqual({ tag: 9, item: { tag: 3 } });
  });

  test("strict marks only the compound it wraps", () => {
    const codec = strict(compound({ Item }));
    expect(codec.strict).toBe(true);
    expect(codec.codecs[0]).toBe(Item);
  });

  test("extend replaces fields in place and appends new ones", () => {
    const extended = extend(strict(Item), { Count: int, Glowing: byte });
    expect(extended.keys).toEqual(["id", "Count", "Slot", "Glowing"]);
    expect(extended.codecs.map((codec) => codec.tag)).toEqual([8, 3, 1, 1]);
    expect(extended.optionals).toEqual([false, false, true, false]);
    expect(extended.strict).toBe(true);
    expect(Item.keys).toHaveLength(3);
  });
});

import { expect, it } from "vitest";
import { errorOf, root, utf } from "./nbt.js";

it.each([
  ["empty input", [], "UnexpectedEnd", 0],
  ["End root", [0], "BadTag", 0],
  ["unknown root tag", [13, 0, 0], "BadTag", 0],
  ["truncated number", [3, 0, 0, 1, 2], "UnexpectedEnd", 3],
  ["truncated name", [10, 0, 5, 65], "UnexpectedEnd", 1],
  ["missing End", [10, 0, 0], "UnexpectedEnd", 3],
  ["unknown entry tag", [10, 0, 0, 13], "BadTag", 3],
  ["negative array", [7, 0, 0, 255, 255, 255, 255], "NegativeLength", 3],
  ["truncated array", [11, 0, 0, 0, 0, 0, 2, 1, 2, 3, 4], "UnexpectedEnd", 3],
  ["negative list", [9, 0, 0, 1, 255, 255, 255, 255], "NegativeLength", 3],
  ["non-empty End list", [9, 0, 0, 0, 0, 0, 0, 1], "BadTag", 3],
  ["unknown list tag", [9, 0, 0, 14, 0, 0, 0, 0], "BadTag", 3],
  ["oversized list", [9, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 1], "UnexpectedEnd", 3],
  ["trailing bytes", [1, 0, 0, 5, 9], "TrailingBytes", 4],
  ["invalid string", [8, 0, 0, 0, 1, 0xff], "InvalidString", 3],
  ["duplicate key", [...root(1, ...utf("a"), 1, 1, ...utf("a"), 2)], "DuplicateKey", 8],
  ["truncated byte", [1, 0, 0], "UnexpectedEnd", 3],
])("reports %s", (_name, bytes, kind, offset) => {
  expect(errorOf(bytes)).toEqual({ kind, offset, path: [] });
});

const nested = (depth: number): number[] => [
  9,
  0,
  0,
  ...Array.from({ length: depth - 1 }, () => [9, 0, 0, 0, 1]).flat(),
  0,
  0,
  0,
  0,
  0,
];

it("allows 512 levels of nesting", () => {
  expect(errorOf(nested(512))).toBeUndefined();
});

it("rejects 513 levels of nesting", () => {
  expect(errorOf(nested(513))).toMatchObject({ kind: "TooDeep" });
});

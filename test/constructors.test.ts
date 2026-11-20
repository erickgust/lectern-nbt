import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  byte,
  byteArray,
  double,
  float,
  int,
  intArray,
  long,
  longArray,
  short,
} from "../src/index.js";

const unchecked = (n: number): number => n;

describe("number constructors", () => {
  test.prop([fc.integer({ min: -(2 ** 31), max: 2 ** 31 - 1 })])("int accepts every int32", (n) => {
    expect(int(n)).toBe(n);
  });

  it("reject values outside their tag", () => {
    expect(() => byte(unchecked(300))).toThrow(RangeError);
    expect(() => byte(unchecked(-129))).toThrow(RangeError);
    expect(() => short(unchecked(32_768))).toThrow(RangeError);
    expect(() => int(unchecked(2 ** 31))).toThrow(RangeError);
    expect(() => int(unchecked(7.5))).toThrow("7.5 is not a valid int");
    expect(() => int(Number.NaN)).toThrow(RangeError);
    expect(() => int.of(1, unchecked(2.5))).toThrow(RangeError);
    expect(() => long(2n ** 63n)).toThrow(RangeError);
    expect(() => long(-(2n ** 63n) - 1n)).toThrow(RangeError);
    expect(() => float(1e40)).toThrow(RangeError);
  });

  it("accept the edges of each range", () => {
    expect(byte.of(-128, 127)).toEqual([-128, 127]);
    expect(long(2n ** 63n - 1n)).toBe(2n ** 63n - 1n);
    expect(float(Infinity)).toBe(Infinity);
    expect(float(0.1)).toBe(Math.fround(0.1));
    expect(double(0.1)).toBe(0.1);
  });
});

describe("array constructors", () => {
  it("check every element instead of wrapping", () => {
    expect(() => byteArray(1, unchecked(300))).toThrow(RangeError);
    expect(() => intArray(unchecked(7.5))).toThrow(RangeError);
    expect(() => intArray.from([1, 2 ** 31])).toThrow(RangeError);
    expect(() => longArray.from([2n ** 64n])).toThrow(RangeError);
  });

  it("return plain typed arrays", () => {
    expect(byteArray(1, -1)).toEqual(new Int8Array([1, -1]));
    expect(intArray(1, 2, 3, 4)).toEqual(new Int32Array([1, 2, 3, 4]));
    expect(longArray.from(new Set([5n]))).toEqual(new BigInt64Array([5n]));
  });
});

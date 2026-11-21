import { fc, test } from "@fast-check/vitest";
import { Int8, read } from "nbtify";
import { expect, it } from "vitest";
import { decode } from "../src/index.js";
import {
  decoded,
  firstDifference,
  fixture,
  fixtures,
  named,
  nbtify,
  root,
  unwrap,
  utf,
} from "./nbt.js";

it.each(fixtures)("matches NBTify on the %s fixture", async (name) => {
  const bytes = fixture(name);
  const theirs = await read(bytes, { rootName: true, endian: "big", compression: null });
  expect(firstDifference(decoded(bytes).root, unwrap(theirs.data))).toBeUndefined();
});

it("reads little-endian data", async () => {
  const value = {
    a: new Int8(1),
    b: new Int32Array([1, -2]),
    c: new BigInt64Array([1n, -(2n ** 63n)]),
    d: 0.5,
  };
  const doc = decoded(await nbtify(value, "little"), "little");
  expect(firstDifference(doc.root, unwrap(value))).toBeUndefined();
  expect(doc.endian).toBe("little");
});

it("copies arrays out of a Node Buffer view without touching it", async () => {
  const value = {
    a: new Int8Array([1, -2]),
    b: new Int32Array([3, -4]),
    c: new BigInt64Array([5n]),
  };
  const padded = Buffer.concat([Buffer.from([7, 7, 7]), await nbtify(value)]);
  const view = padded.subarray(3);
  const before = Buffer.from(view);
  expect(firstDifference(decoded(view).root, value)).toBeUndefined();
  expect(view.equals(before)).toBe(true);
});

it("returns the root name and defaults to big-endian", () => {
  expect(decode(new Uint8Array([10, ...utf("hi"), 0]))).toEqual({
    ok: true,
    value: { name: "hi", root: {}, codec: { tag: 10, fields: [], strict: false }, endian: "big" },
  });
});

it("keeps a __proto__ key as an own property", () => {
  const value = decoded(root(...named(8, "__proto__", ...utf("x")))).root;
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Object.getOwnPropertyDescriptor(value, "__proto__")?.value).toBe("x");
});

it.each(fixtures)("never throws on truncations of the %s fixture", (name) => {
  const bytes = fixture(name);
  for (let end = 0; end < bytes.length; end += 997) {
    expect(decode(bytes.subarray(0, end))).toMatchObject({ ok: false });
  }
});

test.prop([fc.uint8Array({ maxLength: 64 })])("never throws on random bytes", (bytes) => {
  expect(typeof decode(bytes).ok).toBe("boolean");
});

test.prop([fc.uint8Array({ maxLength: 64 })])("never throws on random compound bodies", (body) => {
  expect(typeof decode(new Uint8Array([10, 0, 0, ...body])).ok).toBe("boolean");
});

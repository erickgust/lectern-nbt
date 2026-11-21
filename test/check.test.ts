import { fc, test } from "@fast-check/vitest";
import { expect, it } from "vitest";
import { byte, check, compound, decode, strict } from "../src/index.js";
import { decoded, fixture, fixtures, named, root, utf } from "./nbt.js";

const keys = (names: readonly string[]): number[] => names.flatMap((name) => named(1, name, 0));
const many = Array.from({ length: 20 }, (_, i) => `key${i}`);

it.each(fixtures)("accepts the %s fixture with and without its codec", (name) => {
  const bytes = fixture(name);
  expect(check(bytes)).toEqual({ ok: true, value: undefined });
  expect(check(bytes, decoded(bytes).codec)).toEqual({ ok: true, value: undefined });
});

it.each([
  ["a small compound", ["a", "b", "a"]],
  ["a wide compound", [...many, "key3"]],
  ["two keys with the same hash", ["k32728", "k261234", "k32728"]],
  ["a wide compound after a hash collision", [...many, "k32728", "k261234", "key7"]],
  [
    "a hash collision found while switching to a map",
    [...many.slice(0, 15), "k32728", "k261234", "k32728"],
  ],
])("finds a duplicate key in %s, like decode", (_name, names) => {
  const bytes = root(...keys(names));
  const result = check(bytes);
  expect(result).toMatchObject({ ok: false, error: { kind: "DuplicateKey" } });
  expect(result).toEqual({ ok: false, error: errorOf(bytes) });
});

it.each([
  ["distinct keys with the same hash", ["k32728", "k261234"]],
  ["a wide compound with a hash collision", [...many, "k32728", "k261234"]],
])("accepts %s", (_name, names) => {
  expect(check(root(...keys(names)))).toEqual({ ok: true, value: undefined });
});

it("treats keys that decode to the same text as duplicates", () => {
  const fourByte = [0, 4, 0xf0, 0x9f, 0x98, 0x80];
  const surrogates = [0, 6, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80];
  const bytes = root(1, ...fourByte, 0, 1, ...surrogates, 0);
  expect(check(bytes)).toEqual({ ok: false, error: errorOf(bytes) });
  expect(errorOf(bytes)).toMatchObject({ kind: "DuplicateKey", path: ["😀"] });
});

it("reports codec errors with their paths", () => {
  const codec = strict(compound({ a: byte }));
  expect(check(root(...named(1, "b", 0)), codec)).toEqual({
    ok: false,
    error: { kind: "UnknownKey", offset: 3, path: ["b"] },
  });
});

it("reads little-endian data", () => {
  expect(check(new Uint8Array([8, 0, 0, 2, 0, 0x68, 0x69]), { endian: "little" }).ok).toBe(true);
  expect(check(new Uint8Array([8, 0, 0, ...utf("hi")])).ok).toBe(true);
});

test.prop([fc.uint8Array({ maxLength: 64 })])("agrees with decode on random bodies", (body) => {
  const bytes = new Uint8Array([10, 0, 0, ...body]);
  const result = check(bytes);
  expect(result.ok ? undefined : result.error).toEqual(errorOf(bytes));
});

function errorOf(bytes: Uint8Array): unknown {
  const result = decode(bytes);
  return result.ok ? undefined : result.error;
}

import { fc, test } from "@fast-check/vitest";
import { expect, expectTypeOf, it } from "vitest";
import {
  byte,
  compound,
  list,
  optional,
  string,
  validate,
  type Infer,
  type Result,
  type ValidateError,
} from "../src/index.js";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });

it("returns the value typed by the codec", () => {
  const value: unknown = { id: "a", Count: 1 };
  const result = validate(value, Item);
  expect(result).toEqual({ ok: true, value });
  expectTypeOf(result).toEqualTypeOf<Result<Infer<typeof Item>, ValidateError>>();
});

it.each([
  [
    "an out-of-range byte",
    { id: "a", Count: 300 },
    { kind: "OutOfRange", expected: "byte", value: 300, path: ["Count"] },
  ],
  ["a missing key", { id: "a" }, { kind: "MissingKey", path: ["Count"] }],
  ["an unknown key", { id: "a", Count: 1, x: 1 }, { kind: "UnknownKey", path: ["x"] }],
  [
    "a wrong type",
    { id: 5, Count: 1 },
    { kind: "TagMismatch", expected: "string", found: "double", path: ["id"] },
  ],
])("reports %s like encode", (_name, value, error) => {
  expect(validate(value, Item)).toEqual({ ok: false, error });
});

it("validates list elements with their index in the path", () => {
  expect(
    validate({ L: [{ id: "a", Count: 1 }, { id: "b" }] }, compound({ L: list(Item) })),
  ).toEqual({
    ok: false,
    error: { kind: "MissingKey", path: ["L", 1, "Count"] },
  });
});

test.prop([fc.anything()])("never throws", (value) => {
  expect(typeof validate(value, Item).ok).toBe("boolean");
});

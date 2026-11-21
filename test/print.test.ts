import { fc, test } from "@fast-check/vitest";
import { expect, it } from "vitest";
import {
  byte,
  byteArray,
  compound,
  double,
  float,
  int,
  intArray,
  list,
  long,
  longArray,
  optional,
  print,
  short,
  strict,
  string,
  type Codec,
} from "../src/index.js";
import { decoded, fixture, fixtures } from "./nbt.js";

const scope = {
  byte,
  short,
  int,
  long,
  float,
  double,
  string,
  byteArray,
  intArray,
  longArray,
  compound,
  list,
  optional,
  strict,
};

function evaluate(source: string): unknown {
  const run = new Function(...Object.keys(scope), `return ${source};`);
  return run(...Object.values(scope));
}

it("prints builder source", () => {
  const codec = strict(
    compound({ id: string, Pos: list(double), "a key": optional(byte), tag: compound({}) }),
  );
  expect(print(codec)).toBe(
    [
      "strict(compound({",
      "  id: string,",
      "  Pos: list(double),",
      '  "a key": optional(byte),',
      "  tag: compound({}),",
      "}))",
    ].join("\n"),
  );
});

it("prints a __proto__ key as an own property", () => {
  const codec: Codec = {
    tag: 10,
    keys: ["__proto__"],
    codecs: [{ tag: 1 }],
    optionals: [false],
    strict: false,
  };
  expect(print(codec)).toContain('["__proto__"]: byte');
  expect(evaluate(print(codec))).toEqual(codec);
});

it.each(fixtures)("prints the %s fixture's codec as source that rebuilds it", (name) => {
  const { codec } = decoded(fixture(name));
  expect(evaluate(print(codec))).toEqual(codec);
});

it("prints mixed lists as plain data", () => {
  expect(print({ tag: 9, items: [list(byte), list(string)] })).toBe(
    "{ tag: 9, items: [list(byte), list(string)] }",
  );
});

test.prop([fc.dictionary(fc.string(), fc.constantFrom<Codec>(byte, string, list(double)))])(
  "rebuilds codecs with any keys",
  (fields) => {
    const codec = compound(fields);
    expect(evaluate(print(codec))).toEqual(codec);
  },
);

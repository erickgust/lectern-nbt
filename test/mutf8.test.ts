import { fc, test } from "@fast-check/vitest";
import { MUtf8Encoder } from "mutf-8";
import { describe, expect, it } from "vitest";
import { decodeString, isValidString } from "../src/internal/mutf8.js";

const mutf8 = new MUtf8Encoder();
const decode = (bytes: Uint8Array): string | undefined => decodeString(bytes, 0, bytes.length);
const units = fc.string({
  unit: fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCodePoint(n)),
});

describe("decodeString", () => {
  test.prop([fc.string({ unit: "binary" })])("agrees with mutf-8 on any string", (text) => {
    expect(decode(mutf8.encode(text))).toBe(text);
  });

  test.prop([units])("agrees with mutf-8 on lone surrogates and nulls", (text) => {
    expect(decode(mutf8.encode(text))).toBe(text);
  });

  it("keeps a leading byte order mark", () => {
    expect(decode(mutf8.encode("﻿a".repeat(20)))).toBe("﻿a".repeat(20));
  });

  it("accepts standard UTF-8 next to MUTF-8 bytes", () => {
    const text = "한😀\0";
    const bytes = new Uint8Array([...new TextEncoder().encode("한😀"), 0xc0, 0x80]);
    expect(decode(bytes)).toBe(text);
  });

  it.each([
    [[0x80]],
    [[0xc0]],
    [[0xe0, 0x80]],
    [[0xff]],
    [[0xc3, 0x28]],
    [Array.from({ length: 40 }, () => 0xff)],
  ])("rejects malformed bytes %j", (bytes) => {
    expect(decode(new Uint8Array(bytes))).toBeUndefined();
  });
});

const utf8ish = fc
  .uint8Array({ maxLength: 48 })
  .chain((tail) =>
    fc
      .array(
        fc.constantFrom(
          0x00,
          0x41,
          0x80,
          0xbf,
          0xc0,
          0xc1,
          0xc2,
          0xdf,
          0xe0,
          0xed,
          0xef,
          0xf0,
          0xf4,
          0xf5,
          0xff,
        ),
        { maxLength: 16 },
      )
      .map((picked) => new Uint8Array([...picked, ...tail])),
  );

describe("isValidString", () => {
  test.prop([utf8ish], { numRuns: 2000 })("accepts exactly what decodeString accepts", (bytes) => {
    expect(isValidString(bytes, 0, bytes.length)).toBe(decode(bytes) !== undefined);
  });

  test.prop([fc.string({ unit: "binary" })])("accepts encoded text", (text) => {
    const bytes = mutf8.encode(text);
    expect(isValidString(bytes, 0, bytes.length)).toBe(true);
  });
});

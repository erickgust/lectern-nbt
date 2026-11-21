import { fc, test } from "@fast-check/vitest";
import { expect, it } from "vitest";
import { detect } from "../src/index.js";
import { named, nbtify } from "./nbt.js";

it.each([
  ["gzip", [0x1f, 0x8b, 8, 0], "gzip", "big"],
  ["zlib", [0x78, 0x9c, 1, 2], "zlib", "big"],
  ["a big-endian named root", [10, 0, 4, ...new TextEncoder().encode("Data"), 0], "none", "big"],
  [
    "a little-endian named root",
    [10, 4, 0, ...new TextEncoder().encode("Data"), 0],
    "none",
    "little",
  ],
  ["a tie on an empty name", [10, 0, 0, 0], "none", "big"],
  [
    "a little-endian first key",
    [10, 0, 0, ...named(1, "", 0).slice(0, 1), 5, 0, 0x61, 0x62, 0x63, 0x64, 0x65, 1, 0],
    "none",
    "little",
  ],
])("recognises %s", (_name, bytes, compression, endian) => {
  expect(detect(new Uint8Array(bytes))).toEqual({ ok: true, value: { compression, endian } });
});

it.each([
  ["empty input", []],
  ["an End root", [0, 0, 0]],
  ["a name longer than the input", [10, 0, 9, 0x61]],
  ["a Bedrock level.dat header", [10, 0, 0, 0, 5, 0, 0, 0, 10, 0, 0]],
])("rejects %s", (_name, bytes) => {
  expect(detect(new Uint8Array(bytes))).toEqual({
    ok: false,
    error: { kind: "UnknownFormat", path: [] },
  });
});

it("recognises little-endian files written by NBTify", async () => {
  const bytes = await nbtify({ format_version: 1 }, "little");
  expect(detect(bytes)).toEqual({ ok: true, value: { compression: "none", endian: "little" } });
});

test.prop([fc.uint8Array({ maxLength: 32 })])("never throws", (bytes) => {
  expect(typeof detect(bytes).ok).toBe("boolean");
});

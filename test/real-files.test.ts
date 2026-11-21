import { readFileSync } from "node:fs";
import { read as nbtifyRead } from "nbtify";
import { expect, it } from "vitest";
import { check, compound, decompress, double, list, read, write } from "../src/index.js";
import { firstDifference, ok, unwrap } from "./nbt.js";

const real = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

it.each([
  ["hello_world.nbt", "hello world", "big", "none"],
  ["bigtest.nbt", "Level", "big", "none"],
  ["bigtest.nbt.gz", "Level", "big", "gzip"],
  ["Player-nan-value.dat", "", "big", "gzip"],
  ["level.dat", "", "little", "none"],
] as const)("reads %s like NBTify", async (name, rootName, endian, compression) => {
  const bytes = real(name);
  const file = ok(await read(bytes));
  expect(file).toMatchObject({ name: rootName, endian, compression });
  const theirs = await nbtifyRead(bytes);
  expect(firstDifference(file.root, unwrap(theirs.data))).toBeUndefined();
  expect(check(ok(await decompress(bytes, compression)), { endian }).ok).toBe(true);
});

it.each(["hello_world.nbt", "bigtest.nbt", "bigtest.nbt.gz", "level.dat"])(
  "writes %s back byte for byte",
  async (name) => {
    const bytes = real(name);
    const file = ok(await read(bytes));
    const original = ok(await decompress(bytes, file.compression));
    const written = ok(await decompress(ok(await write(file)), file.compression));
    expect(Buffer.from(written).equals(Buffer.from(original))).toBe(true);
  },
);

it("decodes every tag type in bigtest.nbt", async () => {
  const file = ok(await read(real("bigtest.nbt.gz")));
  expect(file.root).toMatchObject({
    byteTest: 127,
    shortTest: 32_767,
    intTest: 2_147_483_647,
    longTest: 9_223_372_036_854_775_807n,
    floatTest: Math.fround(0.498_231_470_584_869_38),
    doubleTest: 0.493_128_713_218_231_48,
    stringTest: "HELLO WORLD THIS IS A TEST STRING ÅÄÖ!",
    "listTest (long)": [11n, 12n, 13n, 14n, 15n],
    "listTest (compound)": [
      { name: "Compound tag #0", "created-on": 1_264_099_775_885n },
      { name: "Compound tag #1", "created-on": 1_264_099_775_885n },
    ],
    "nested compound test": {
      egg: { name: "Eggbert", value: 0.5 },
      ham: { name: "Hampus", value: 0.75 },
    },
    "byteArrayTest (the first 1000 values of (n*n*255+n*7)%100, starting with n=0 (0, 62, 34, 16, 8, ...))":
      Int8Array.from({ length: 1000 }, (_, n) => (n * n * 255 + n * 7) % 100),
  });
});

it("keeps a NaN double and writes an empty Byte list back as End", async () => {
  const bytes = real("Player-nan-value.dat");
  const typed = ok(await read(bytes, compound({ Pos: list(double) })));
  expect(typed.root.Pos[1]).toBeNaN();
  const file = ok(await read(bytes));
  const original = ok(await decompress(bytes, "gzip"));
  const written = ok(await decompress(ok(await write(file)), "gzip"));
  const changed = [...original.keys()].filter((i) => original[i] !== written[i]);
  expect(changed).toEqual([213]);
  expect([original[213], written[213]]).toEqual([1, 0]);
});

it("rejects Bedrock varint NBT as an unknown format", async () => {
  expect(await read(real("biome_definitions.le.nbt"))).toEqual({
    ok: false,
    error: { kind: "UnknownFormat", path: [] },
  });
});

const withHeader = (version: number, body: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(body.length + 8);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, version, true);
  view.setUint32(4, body.length, true);
  bytes.set(body, 8);
  return bytes;
};

const headered = withHeader(10, real("level.dat"));

it("reads a Bedrock level.dat header like NBTify", async () => {
  const file = ok(await read(headered));
  expect(file).toMatchObject({ endian: "little", compression: "none", storageVersion: 10 });
  const theirs = await nbtifyRead(headered);
  expect(theirs.bedrockLevel).toBe(true);
  expect(firstDifference(file.root, unwrap(theirs.data))).toBeUndefined();
});

it("writes a Bedrock level.dat header back byte for byte", async () => {
  const written = ok(await write(ok(await read(headered))));
  expect(Buffer.from(written).equals(Buffer.from(headered))).toBe(true);
});

it("reads the header when uncompressed little-endian is forced", async () => {
  const file = ok(await read(headered, { compression: "none", endian: "little" }));
  expect(file.storageVersion).toBe(10);
});

it("doesn't look for a header when big-endian is forced", async () => {
  expect((await read(headered, { endian: "big" })).ok).toBe(false);
});

import { fc, test } from "@fast-check/vitest";
import { write as nbtifyWrite } from "nbtify";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { createGzip, deflateSync, gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import {
  byte,
  compound,
  compress,
  decompress,
  float,
  read,
  string,
  write,
  type Compression,
  type Int,
  type NbtFile,
} from "../src/index.js";
import { firstDifference, fixture, ok } from "./nbt.js";

const entities = fixture("entities");

it.each<Compression>(["gzip", "zlib", "none"])(
  "round-trips %s through compress and decompress",
  async (compression) => {
    const packed = ok(await compress(entities, compression));
    const unpacked = ok(await decompress(packed, compression));
    expect(Buffer.from(unpacked).equals(Buffer.from(entities))).toBe(true);
  },
);

it.each([
  ["gzip", gzipSync(entities)],
  ["zlib", deflateSync(entities)],
  ["none", entities],
] as const)("reads a %s file and writes it back the same way", async (compression, bytes) => {
  const file = ok(await read(new Uint8Array(bytes)));
  expect(file).toMatchObject({ compression, endian: "big" });
  const again = ok(await read(ok(await write(file))));
  expect(again.compression).toBe(compression);
  expect(firstDifference(again.root, file.root)).toBeUndefined();
});

it("reads a little-endian file and keeps its byte order", async () => {
  const bytes = await nbtifyWrite(
    { Name: "x" },
    { endian: "little", compression: null, rootName: "" },
  );
  const file = ok(await read(bytes, compound({ Name: string })));
  expect(file).toMatchObject({ endian: "little", compression: "none", root: { Name: "x" } });
  expect(ok(await write(file))).toEqual(bytes);
});

it("lets options override detection", async () => {
  const bytes = new Uint8Array([8, 0, 0, 2, 0, 0x68, 0x69]);
  expect(await read(bytes, { endian: "little", compression: "none" })).toMatchObject({
    ok: true,
    value: { root: "hi", endian: "little" },
  });
});

it("reports decode errors with paths", async () => {
  const bytes = new Uint8Array(gzipSync(new Uint8Array([10, 0, 0, 1, 0, 1, 0x61, 5, 0])));
  expect(await read(bytes, compound({ a: float }))).toEqual({
    ok: false,
    error: { kind: "TagMismatch", expected: "float", found: "byte", offset: 3, path: ["a"] },
  });
});

it("reports encode errors from write", async () => {
  const codec = compound({ a: byte });
  const file = ok(await read(new Uint8Array([10, 0, 0, 1, 0, 1, 0x61, 5, 0]), codec));
  const broken: NbtFile = { ...file, codec: compound({ a: string }) };
  const result = await write(broken);
  expect(result).toEqual({
    ok: false,
    error: { kind: "TagMismatch", expected: "string", found: "double", path: ["a"] },
  });
});

it.each([
  ["corrupt gzip", new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]), "CompressionFailed"],
  ["unknown bytes", new Uint8Array([0xff, 0, 0]), "UnknownFormat"],
])("reports %s", async (_name, bytes, kind) => {
  expect(await read(bytes)).toEqual({ ok: false, error: { kind, path: [] } });
});

const tooLarge = { ok: false, error: { kind: "TooLarge", path: [] } };

const zeros = new Uint8Array(1 << 20);
const gzippedZeros = async (mebibytes: number): Promise<Uint8Array> =>
  new Uint8Array(
    await buffer(Readable.from(Array.from({ length: mebibytes }, () => zeros)).pipe(createGzip())),
  );

it.each([
  ["gzip", gzipSync(new Uint8Array(4096))],
  ["zlib", deflateSync(new Uint8Array(4096))],
] as const)("limits %s output to maxSize", async (compression, bytes) => {
  const packed = new Uint8Array(bytes);
  expect(await decompress(packed, compression, { maxSize: 4095 })).toEqual(tooLarge);
  expect(ok(await decompress(packed, compression, { maxSize: 4096 }))).toHaveLength(4096);
});

it("rejects more than 256 MiB of output by default", async () => {
  expect(await decompress(await gzippedZeros(257), "gzip")).toEqual(tooLarge);
});

it("passes maxSize through read", async () => {
  expect(await read(new Uint8Array(gzipSync(entities)), { maxSize: 1000 })).toEqual(tooLarge);
});

const unbranded = (_value: number): _value is Int => true;

function uncheckedInt(value: number): Int {
  if (!unbranded(value)) throw new Error("unreachable");
  return value;
}

it("rejects a storageVersion outside the int range", async () => {
  const file = ok(await read(new Uint8Array([10, 0, 0, 0])));
  expect(await write({ ...file, storageVersion: uncheckedInt(2 ** 31) })).toEqual({
    ok: false,
    error: { kind: "OutOfRange", expected: "int", value: 2 ** 31, path: [] },
  });
});

test.prop([fc.uint8Array({ maxLength: 64 })])("never rejects", async (bytes) => {
  expect(typeof (await read(bytes)).ok).toBe("boolean");
  expect(typeof (await read(new Uint8Array([0x1f, 0x8b, ...bytes]))).ok).toBe("boolean");
  expect(typeof (await decompress(bytes, "zlib")).ok).toBe("boolean");
});

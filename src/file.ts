import type { Codec, Compression, Endian, NbtFile } from "./codec.js";
import { compress, decompress } from "./compression.js";
import { decodeWith } from "./decode.js";
import { detect, endianOf, headerOf } from "./detect.js";
import { encode } from "./encode.js";
import { codecOrOptions } from "./internal/overload.js";
import type { ReadError, Result, WriteError } from "./result.js";

export interface ReadOptions {
  readonly compression?: Compression;
  readonly endian?: Endian;
  readonly maxSize?: number;
}

export function read<C extends Codec>(
  bytes: Uint8Array,
  codec: C,
  options?: ReadOptions,
): Promise<Result<NbtFile<C>, ReadError>>;
export function read(bytes: Uint8Array, options?: ReadOptions): Promise<Result<NbtFile, ReadError>>;
export async function read(
  bytes: Uint8Array,
  first?: Codec | ReadOptions,
  second?: ReadOptions,
): Promise<Result<NbtFile, ReadError>> {
  const { codec, options } = codecOrOptions(first, second);
  let { compression, endian } = options;
  if (compression === undefined) {
    const format = detect(bytes);
    if (!format.ok) return format;
    compression = format.value.compression;
    if (compression === "none") endian ??= format.value.endian;
  }
  const raw = await decompress(bytes, compression, options);
  if (!raw.ok) return raw;
  const storageVersion =
    compression === "none" && endian !== "big" ? headerOf(raw.value) : undefined;
  if (storageVersion !== undefined) {
    const doc = decodeWith(raw.value.subarray(8), codec, "little");
    if (!doc.ok) return doc;
    return { ok: true, value: { ...doc.value, compression, storageVersion } };
  }
  const doc = decodeWith(raw.value, codec, endian ?? endianOf(raw.value) ?? "big");
  if (!doc.ok) return doc;
  return { ok: true, value: { ...doc.value, compression } };
}

function withHeader(storageVersion: number, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(body.length + 8);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, storageVersion, true);
  view.setUint32(4, body.length, true);
  bytes.set(body, 8);
  return bytes;
}

const isInt = (value: number): boolean =>
  Number.isInteger(value) && value >= -0x8000_0000 && value <= 0x7fff_ffff;

export async function write<C extends Codec>(
  file: NbtFile<C>,
): Promise<Result<Uint8Array, WriteError>> {
  const { storageVersion } = file;
  if (storageVersion !== undefined && !isInt(storageVersion)) {
    return {
      ok: false,
      error: { kind: "OutOfRange", expected: "int", value: storageVersion, path: [] },
    };
  }
  const bytes = encode(file);
  if (!bytes.ok) return bytes;
  const body = storageVersion === undefined ? bytes.value : withHeader(storageVersion, bytes.value);
  const compressed = await compress(body, file.compression);
  return compressed;
}

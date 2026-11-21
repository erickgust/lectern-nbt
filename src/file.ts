import type { Codec, Compression, Endian, NbtFile } from "./codec.js";
import { compress, decompress } from "./compression.js";
import { decodeWith } from "./decode.js";
import { detect, endianOf } from "./detect.js";
import { encode } from "./encode.js";
import { codecOrOptions } from "./internal/overload.js";
import type { ReadError, Result, WriteError } from "./result.js";

export interface ReadOptions {
  readonly compression?: Compression;
  readonly endian?: Endian;
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
  const raw = await decompress(bytes, compression);
  if (!raw.ok) return raw;
  const doc = decodeWith(raw.value, codec, endian ?? endianOf(raw.value) ?? "big");
  if (!doc.ok) return doc;
  return { ok: true, value: { ...doc.value, compression } };
}

export async function write<C extends Codec>(
  file: NbtFile<C>,
): Promise<Result<Uint8Array, WriteError>> {
  const bytes = encode(file);
  if (!bytes.ok) return bytes;
  const compressed = await compress(bytes.value, file.compression);
  return compressed;
}

import type { Codec, Endian, NbtDocument } from "./codec.js";
import { ReadFailure, toError } from "./internal/checks.js";
import { codecOrOptions } from "./internal/overload.js";
import { locate } from "./internal/path.js";
import { readTree } from "./internal/reader.js";
import type { DecodeError, Result } from "./result.js";

export interface DecodeOptions {
  readonly endian?: Endian;
}

export function decode<C extends Codec>(
  bytes: Uint8Array,
  codec: C,
  options?: DecodeOptions,
): Result<NbtDocument<C>, DecodeError>;
export function decode(
  bytes: Uint8Array,
  options?: DecodeOptions,
): Result<NbtDocument, DecodeError>;
export function decode(
  bytes: Uint8Array,
  first?: Codec | DecodeOptions,
  second?: DecodeOptions,
): Result<NbtDocument, DecodeError> {
  const { codec: expected, options } = codecOrOptions(first, second);
  return decodeWith(bytes, expected, options.endian ?? "big");
}

export function decodeWith(
  bytes: Uint8Array,
  expected: Codec | undefined,
  endian: Endian,
): Result<NbtDocument, DecodeError> {
  const little = endian === "little";
  try {
    const { name, root, codec } = readTree(bytes, little, expected);
    return { ok: true, value: { name, root, codec, endian } };
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    return { ok: false, error: toError(error, locate(bytes, little, expected)?.path ?? []) };
  }
}

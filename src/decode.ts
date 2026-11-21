import { plain, type Codec, type Endian, type NbtDocument } from "./codec.js";
import { locate } from "./internal/path.js";
import { ReadFailure, toError } from "./internal/checks.js";
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
  codecOrOptions: Codec | DecodeOptions = {},
  options: DecodeOptions = {},
): Result<NbtDocument, DecodeError> {
  const expected = "tag" in codecOrOptions ? plain(codecOrOptions) : undefined;
  const endian = ("tag" in codecOrOptions ? options : codecOrOptions).endian ?? "big";
  const little = endian === "little";
  try {
    const { name, root, codec } = readTree(bytes, little, expected);
    return { ok: true, value: { name, root, codec, endian } };
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    return { ok: false, error: toError(error, locate(bytes, little, expected)?.path ?? []) };
  }
}

import type { Endian, NbtDocument } from "./codec.js";
import { ReadFailure, readTree } from "./internal/reader.js";
import type { DecodeError, Result } from "./result.js";

export interface DecodeOptions {
  readonly endian?: Endian;
}

export function decode(
  bytes: Uint8Array,
  options: DecodeOptions = {},
): Result<NbtDocument, DecodeError> {
  const endian = options.endian ?? "big";
  try {
    const { name, root, codec } = readTree(bytes, endian === "little");
    return { ok: true, value: { name, root, codec, endian } };
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    return { ok: false, error: { kind: error.kind, offset: error.offset, path: [] } };
  }
}

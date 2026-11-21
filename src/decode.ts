import type { Endian, NbtDocument } from "./codec.js";
import { locate } from "./internal/path.js";
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
  const little = endian === "little";
  try {
    const { name, root, codec } = readTree(bytes, little);
    return { ok: true, value: { name, root, codec, endian } };
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    const path = locate(bytes, little)?.path ?? [];
    return { ok: false, error: { kind: error.kind, offset: error.offset, path } };
  }
}

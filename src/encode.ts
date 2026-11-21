import type { Codec, NbtDocument } from "./codec.js";
import { WriteFailure, writeTree } from "./internal/writer.js";
import type { EncodeError, Result } from "./result.js";

export function encode<C extends Codec>(doc: NbtDocument<C>): Result<Uint8Array, EncodeError> {
  try {
    return { ok: true, value: writeTree(doc.name, doc.root, doc.codec, doc.endian === "little") };
  } catch (error) {
    if (!(error instanceof WriteFailure)) throw error;
    return { ok: false, error: error.toError() };
  }
}

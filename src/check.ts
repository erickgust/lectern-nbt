import type { Codec } from "./codec.js";
import type { DecodeOptions } from "./decode.js";
import { codecOrOptions } from "./internal/overload.js";
import { locate } from "./internal/path.js";
import type { DecodeError, Result } from "./result.js";

export function check(
  bytes: Uint8Array,
  codec: Codec,
  options?: DecodeOptions,
): Result<undefined, DecodeError>;
export function check(bytes: Uint8Array, options?: DecodeOptions): Result<undefined, DecodeError>;
export function check(
  bytes: Uint8Array,
  first?: Codec | DecodeOptions,
  second?: DecodeOptions,
): Result<undefined, DecodeError> {
  const { codec, options } = codecOrOptions(first, second);
  const error = locate(bytes, options.endian === "little", codec);
  return error === undefined ? { ok: true, value: undefined } : { ok: false, error };
}

import type { Codec, Infer } from "./codec.js";
import { WriteFailure, writeTree } from "./internal/writer.js";
import type { Result, ValidateError } from "./result.js";

function assertConforms<C extends Codec>(value: unknown, codec: C): asserts value is Infer<C> {
  writeTree("", value, codec, false);
}

export function validate<C extends Codec>(
  value: unknown,
  codec: C,
): Result<Infer<C>, ValidateError> {
  try {
    assertConforms(value, codec);
    return { ok: true, value };
  } catch (error) {
    if (!(error instanceof WriteFailure)) throw error;
    return { ok: false, error: error.toError() };
  }
}

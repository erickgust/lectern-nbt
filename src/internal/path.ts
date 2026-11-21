import type { Codec, CompoundCodec } from "../codec.js";
import type { DecodeError } from "../result.js";
import {
  MAX_DEPTH,
  ReadFailure,
  arrayLength,
  entryTag,
  expectItem,
  expectTag,
  fail,
  fieldIndex,
  listHeader,
  missingKey,
  rootTag,
  stringAt,
  textAt,
  toError,
  type Indexes,
} from "./checks.js";

const FIXED_SIZE: readonly number[] = [0, 1, 2, 4, 8, 4, 8];
const ARRAY_SIZE: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 8];

export function locate(
  bytes: Uint8Array,
  little: boolean,
  expected?: Codec,
): DecodeError | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const indexes: Indexes = new Map();
  const path: (string | number)[] = [];
  let pos = 0;
  let depth = 0;

  function string(): string {
    const end = stringAt(bytes, view, pos, little);
    const text = textAt(bytes, pos, end);
    pos = end;
    return text;
  }

  function list(item: Codec | undefined): void {
    const length = listHeader(bytes, view, pos, little);
    const type = bytes[pos]!;
    if (item !== undefined) expectItem(item, type, length, pos);
    pos += 5;
    for (let i = 0; i < length; i++) {
      path.push(i);
      skip(type, item);
      path.pop();
    }
  }

  function compound(codec: CompoundCodec | undefined): void {
    const keys = new Set<string>();
    for (let type = entryTag(bytes, pos); type !== 0; type = entryTag(bytes, pos)) {
      const start = pos++;
      const key = string();
      path.push(key);
      let field: Codec | undefined;
      if (codec !== undefined) {
        const index = fieldIndex(indexes, codec, key);
        if (index === -1 && codec.strict) fail("UnknownKey", start);
        field = codec.codecs[index];
        if (field !== undefined) expectTag(field.tag, type, start);
      }
      skip(type, field);
      if (keys.has(key)) fail("DuplicateKey", start);
      keys.add(key);
      path.pop();
    }
    const end = pos++;
    const missing = codec === undefined ? -1 : missingKey(codec, (key) => keys.has(key));
    if (codec !== undefined && missing !== -1) {
      path.push(codec.keys[missing]!);
      fail("MissingKey", end);
    }
  }

  function skip(type: number, codec: Codec | undefined): void {
    if (type < 7) {
      if (pos + FIXED_SIZE[type]! > bytes.length) fail("UnexpectedEnd", pos);
      pos += FIXED_SIZE[type]!;
    } else if (type === 8) {
      string();
    } else if (type === 9 || type === 10) {
      if (++depth > MAX_DEPTH) fail("TooDeep", pos);
      if (type === 9) list(codec !== undefined && "item" in codec ? codec.item : undefined);
      else compound(codec?.tag === 10 ? codec : undefined);
      depth--;
    } else {
      const size = ARRAY_SIZE[type]!;
      pos += 4 + arrayLength(view, pos, size, little) * size;
    }
  }

  try {
    const type = rootTag(bytes);
    if (expected !== undefined) expectTag(expected.tag, type, 0);
    pos = 1;
    string();
    skip(type, expected);
    if (pos !== bytes.length) fail("TrailingBytes", pos);
    return undefined;
  } catch (error) {
    const failure = error instanceof RangeError ? new ReadFailure("UnexpectedEnd", pos) : error;
    if (!(failure instanceof ReadFailure)) throw failure;
    return toError(failure, path);
  }
}

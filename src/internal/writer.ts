import type { Codec, CompoundCodec, ListCodec, MixedListCodec } from "../codec.js";
import type { EncodeError, TagName } from "../result.js";
import { HOST_LITTLE, MAX_DEPTH, TAG_NAMES, fieldIndex, type Indexes } from "./checks.js";

type Detail<E = EncodeError> = E extends unknown ? Omit<E, "path"> : never;
type PathKind = "MissingKey" | "UnknownKey" | "TooDeep" | "StringTooLong";

export class WriteFailure extends Error {
  readonly detail: Detail;
  readonly path: (string | number)[];

  constructor(detail: Detail, path: (string | number)[] = []) {
    super(detail.kind);
    this.detail = detail;
    this.path = path;
  }

  toError(): EncodeError {
    return { ...this.detail, path: this.path.toReversed() };
  }
}

function fail(kind: PathKind, ...path: (string | number)[]): never {
  throw new WriteFailure({ kind }, path);
}

function isCompound(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

function tagOf(value: unknown): TagName {
  if (typeof value === "number") return "double";
  if (typeof value === "bigint") return "long";
  if (typeof value === "string") return "string";
  if (value instanceof Int8Array) return "byteArray";
  if (value instanceof Int32Array) return "intArray";
  if (value instanceof BigInt64Array) return "longArray";
  if (Array.isArray(value)) return "list";
  return isCompound(value) ? "compound" : "end";
}

function mismatch(expected: number, value: unknown): never {
  throw new WriteFailure({
    kind: "TagMismatch",
    expected: TAG_NAMES[expected]!,
    found: tagOf(value),
  });
}

function outOfRange(tag: number, value: number | bigint): never {
  throw new WriteFailure({ kind: "OutOfRange", expected: TAG_NAMES[tag]!, value });
}

function integer(tag: number, max: number, value: unknown): number {
  if (typeof value !== "number") mismatch(tag, value);
  if (!Number.isInteger(value) || value < -max - 1 || value > max) outOfRange(tag, value);
  return value;
}

function number(tag: number, value: unknown): number {
  if (typeof value !== "number") mismatch(tag, value);
  return value;
}

export function writeTree(
  name: unknown,
  root: unknown,
  rootCodec: Codec,
  little: boolean,
): Uint8Array {
  const swap = little !== HOST_LITTLE;
  const indexes: Indexes = new Map();
  let bytes = new Uint8Array(1024);
  let view = new DataView(bytes.buffer);
  let pos = 0;
  let depth = 0;

  function reserve(size: number): void {
    if (pos + size <= bytes.length) return;
    let length = bytes.length * 2;
    while (length < pos + size) length *= 2;
    const next = new Uint8Array(length);
    next.set(bytes.subarray(0, pos));
    bytes = next;
    view = new DataView(next.buffer);
  }

  function string(value: unknown): void {
    if (typeof value !== "string") mismatch(8, value);
    if (value.length > 0xffff) fail("StringTooLong");
    reserve(2 + value.length * 3);
    let at = pos + 2;
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit > 0 && unit < 0x80) {
        bytes[at++] = unit;
      } else if (unit < 0x800) {
        bytes[at++] = 0xc0 | (unit >> 6);
        bytes[at++] = 0x80 | (unit & 0x3f);
      } else {
        bytes[at++] = 0xe0 | (unit >> 12);
        bytes[at++] = 0x80 | ((unit >> 6) & 0x3f);
        bytes[at++] = 0x80 | (unit & 0x3f);
      }
    }
    const size = at - pos - 2;
    if (size > 0xffff) fail("StringTooLong");
    view.setUint16(pos, size, little);
    pos = at;
  }

  function words(source: Int32Array, pairs: boolean): void {
    const count = pairs ? source.length / 2 : source.length;
    reserve(4 + source.byteLength);
    view.setInt32(pos, count, little);
    pos += 4;
    if (!swap) {
      bytes.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), pos);
    } else if (pairs) {
      for (let i = 0; i < source.length; i += 2) {
        view.setInt32(pos + i * 4, source[i + 1]!, little);
        view.setInt32(pos + i * 4 + 4, source[i]!, little);
      }
    } else {
      for (let i = 0; i < source.length; i++) view.setInt32(pos + i * 4, source[i]!, little);
    }
    pos += source.byteLength;
  }

  function header(type: number, length: number): void {
    reserve(5);
    bytes[pos] = type;
    view.setInt32(pos + 1, length, little);
    pos += 5;
  }

  function list(codec: ListCodec, value: readonly unknown[]): void {
    const { item } = codec;
    header(value.length === 0 ? 0 : item.tag, value.length);
    let i = 0;
    try {
      for (; i < value.length; i++) payload(item, value[i]);
    } catch (error) {
      if (error instanceof WriteFailure) error.path.push(i);
      throw error;
    }
  }

  function items(codec: MixedListCodec, value: readonly unknown[]): void {
    const { items: codecs } = codec;
    if (value.length > codecs.length) fail("UnknownKey", codecs.length);
    if (value.length < codecs.length) fail("MissingKey", value.length);
    const type = codecs[0]?.tag ?? 0;
    header(type, value.length);
    let i = 0;
    try {
      for (; i < value.length; i++) {
        const item = codecs[i]!;
        if (item.tag !== type) {
          const expected = TAG_NAMES[type]!;
          throw new WriteFailure({ kind: "TagMismatch", expected, found: TAG_NAMES[item.tag]! });
        }
        payload(item, value[i]);
      }
    } catch (error) {
      if (error instanceof WriteFailure) error.path.push(i);
      throw error;
    }
  }

  function compound(codec: CompoundCodec, value: object): void {
    const { keys, codecs, optionals } = codec;
    let present = 0;
    let i = 0;
    try {
      for (; i < keys.length; i++) {
        const key = keys[i]!;
        const item: unknown = Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
        if (item === undefined) {
          if (optionals[i] !== true) fail("MissingKey");
          continue;
        }
        present++;
        const field = codecs[i]!;
        reserve(1);
        bytes[pos++] = field.tag;
        string(key);
        payload(field, item);
      }
    } catch (error) {
      if (error instanceof WriteFailure) error.path.push(keys[i]!);
      throw error;
    }
    if (present !== Object.keys(value).length) {
      const unknown = Object.keys(value).find((key) => fieldIndex(indexes, codec, key) === -1);
      if (unknown !== undefined) fail("UnknownKey", unknown);
    }
    reserve(1);
    bytes[pos++] = 0;
  }

  function enter(): void {
    if (++depth > MAX_DEPTH) fail("TooDeep");
  }

  function payload(codec: Codec, value: unknown): void {
    switch (codec.tag) {
      case 1:
        reserve(1);
        view.setInt8(pos, integer(1, 0x7f, value));
        pos += 1;
        return;
      case 2:
        reserve(2);
        view.setInt16(pos, integer(2, 0x7fff, value), little);
        pos += 2;
        return;
      case 3:
        reserve(4);
        view.setInt32(pos, integer(3, 0x7fffffff, value), little);
        pos += 4;
        return;
      case 4:
        if (typeof value !== "bigint") mismatch(4, value);
        if (BigInt.asIntN(64, value) !== value) outOfRange(4, value);
        reserve(8);
        view.setBigInt64(pos, value, little);
        pos += 8;
        return;
      case 5: {
        const value32 = number(5, value);
        if (Number.isFinite(value32) && !Number.isFinite(Math.fround(value32))) {
          outOfRange(5, value32);
        }
        reserve(4);
        view.setFloat32(pos, value32, little);
        pos += 4;
        return;
      }
      case 6:
        reserve(8);
        view.setFloat64(pos, number(6, value), little);
        pos += 8;
        return;
      case 7:
        if (!(value instanceof Int8Array)) mismatch(7, value);
        reserve(4 + value.length);
        view.setInt32(pos, value.length, little);
        bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.length), pos + 4);
        pos += 4 + value.length;
        return;
      case 8:
        string(value);
        return;
      case 11:
        if (!(value instanceof Int32Array)) mismatch(11, value);
        words(value, false);
        return;
      case 12:
        if (!(value instanceof BigInt64Array)) mismatch(12, value);
        words(new Int32Array(value.buffer, value.byteOffset, value.length * 2), true);
        return;
      case 9:
        if (!Array.isArray(value)) mismatch(9, value);
        enter();
        if ("item" in codec) list(codec, value);
        else items(codec, value);
        depth--;
        return;
      case 10:
        if (!isCompound(value)) mismatch(10, value);
        enter();
        compound(codec, value);
        depth--;
    }
  }

  reserve(1);
  bytes[pos++] = rootCodec.tag;
  string(name);
  payload(rootCodec, root);
  return bytes.slice(0, pos);
}

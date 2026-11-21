import type { Codec, NbtValue } from "../codec.js";
import {
  toBrand,
  type Byte,
  type Double,
  type Float,
  type Int,
  type Long,
  type Short,
} from "./brand.js";
import {
  BYTE,
  BYTE_ARRAY,
  DOUBLE,
  EMPTY_LIST,
  FLOAT,
  INT,
  INT_ARRAY,
  LONG,
  LONG_ARRAY,
  SHORT,
  STRING,
  createInference,
} from "./infer.js";
import { decodeString } from "./mutf8.js";

export type ReadKind =
  | "UnexpectedEnd"
  | "BadTag"
  | "NegativeLength"
  | "TrailingBytes"
  | "InvalidString"
  | "DuplicateKey"
  | "TooDeep";

export class ReadFailure extends Error {
  readonly kind: ReadKind;
  readonly offset: number;

  constructor(kind: ReadKind, offset: number) {
    super(`${kind} at ${offset}`);
    this.kind = kind;
    this.offset = offset;
  }
}

export const MAX_DEPTH = 512;
export const MIN_SIZE: readonly number[] = [0, 1, 2, 4, 8, 4, 8, 4, 2, 5, 1, 4, 4];
const HOST_LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function swap32(x: number): number {
  return ((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | (x >>> 24);
}

export function fail(kind: ReadKind, offset: number): never {
  throw new ReadFailure(kind, offset);
}

export function stringAt(bytes: Uint8Array, view: DataView, pos: number, little: boolean): number {
  const end = pos + 2 + view.getUint16(pos, little);
  if (end > bytes.length) fail("UnexpectedEnd", pos);
  return end;
}

export function textAt(bytes: Uint8Array, pos: number, end: number): string {
  return decodeString(bytes, pos + 2, end) ?? fail("InvalidString", pos);
}

export function arrayLength(view: DataView, pos: number, size: number, little: boolean): number {
  const length = view.getInt32(pos, little);
  if (length < 0) fail("NegativeLength", pos);
  if (pos + 4 + length * size > view.byteLength) fail("UnexpectedEnd", pos);
  return length;
}

export function listHeader(
  bytes: Uint8Array,
  view: DataView,
  pos: number,
  little: boolean,
): number {
  if (pos + 5 > bytes.length) fail("UnexpectedEnd", pos);
  const type = bytes[pos]!;
  const length = view.getInt32(pos + 1, little);
  if (length < 0) fail("NegativeLength", pos);
  if (type > 12 || (type === 0 && length > 0)) fail("BadTag", pos);
  if (pos + 5 + length * MIN_SIZE[type]! > bytes.length) fail("UnexpectedEnd", pos);
  return length;
}

export function entryTag(bytes: Uint8Array, pos: number): number {
  const type = bytes[pos];
  if (type === undefined) fail("UnexpectedEnd", pos);
  if (type > 12) fail("BadTag", pos);
  return type;
}

export function rootTag(bytes: Uint8Array): number {
  const type = entryTag(bytes, 0);
  if (type === 0) fail("BadTag", 0);
  return type;
}

export interface Tree {
  readonly name: string;
  readonly root: NbtValue;
  readonly codec: Codec;
}

export function readTree(bytes: Uint8Array, little: boolean): Tree {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const swap = little !== HOST_LITTLE;
  const inference = createInference();
  const { root: emptyShape, find, add, compoundOf, listOf, listOfEach } = inference;
  let pos = 0;
  let depth = 0;
  let codec: Codec = BYTE;

  function string(): string {
    const end = stringAt(bytes, view, pos, little);
    const text = textAt(bytes, pos, end);
    pos = end;
    return text;
  }

  function words(count: number, pairs: boolean): Int32Array<ArrayBuffer> {
    const end = pos + count * 4;
    const result = new Int32Array(bytes.slice(pos, end).buffer);
    if (swap && pairs) {
      for (let i = 0; i < result.length; i += 2) {
        const high = result[i]!;
        result[i] = swap32(result[i + 1]!);
        result[i + 1] = swap32(high);
      }
    } else if (swap) {
      for (let i = 0; i < result.length; i++) result[i] = swap32(result[i]!);
    }
    pos = end;
    return result;
  }

  function list(): NbtValue[] {
    const length = listHeader(bytes, view, pos, little);
    const type = bytes[pos]!;
    pos += 5;
    const items = new Array<NbtValue>(length);
    if (length === 0) {
      codec = EMPTY_LIST;
      return items;
    }
    if (type !== 9 && type !== 10) {
      for (let i = 0; i < length; i++) items[i] = payload(type);
      codec = listOf(codec);
      return items;
    }
    items[0] = payload(type);
    const first = codec;
    let codecs: Codec[] | undefined;
    for (let i = 1; i < length; i++) {
      items[i] = payload(type);
      if (codecs !== undefined) codecs.push(codec);
      else if (codec !== first) {
        codecs = new Array<Codec>(i).fill(first);
        codecs.push(codec);
      }
    }
    codec = codecs === undefined ? listOf(first) : listOfEach(codecs);
    return items;
  }

  function compound(): Record<string, NbtValue> {
    const result: Record<string, NbtValue> = {};
    let shape = emptyShape;
    for (let type = entryTag(bytes, pos); type !== 0; type = entryTag(bytes, pos)) {
      const start = pos++;
      const key = string();
      const value = payload(type);
      let next = find(shape, key, codec, false);
      if (next === undefined) {
        if (Object.hasOwn(result, key)) fail("DuplicateKey", start);
        next = add(shape, key, codec, false);
      }
      if (next.proto) {
        Object.defineProperty(result, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        result[key] = value;
      }
      shape = next;
    }
    pos++;
    codec = compoundOf(shape);
    return result;
  }

  function container<T>(read: () => T): T {
    if (++depth > MAX_DEPTH) fail("TooDeep", pos);
    const result = read();
    depth--;
    return result;
  }

  function payload(type: number): NbtValue {
    switch (type) {
      case 1: {
        codec = BYTE;
        const value = view.getInt8(pos);
        pos += 1;
        return toBrand<Byte>(value);
      }
      case 2: {
        codec = SHORT;
        const value = view.getInt16(pos, little);
        pos += 2;
        return toBrand<Short>(value);
      }
      case 3: {
        codec = INT;
        const value = view.getInt32(pos, little);
        pos += 4;
        return toBrand<Int>(value);
      }
      case 4: {
        codec = LONG;
        const value = view.getBigInt64(pos, little);
        pos += 8;
        return toBrand<Long>(value);
      }
      case 5: {
        codec = FLOAT;
        const value = view.getFloat32(pos, little);
        pos += 4;
        return toBrand<Float>(value);
      }
      case 6: {
        codec = DOUBLE;
        const value = view.getFloat64(pos, little);
        pos += 8;
        return toBrand<Double>(value);
      }
      case 7: {
        codec = BYTE_ARRAY;
        const length = arrayLength(view, pos, 1, little);
        pos += 4;
        const value = new Int8Array(bytes.slice(pos, pos + length).buffer);
        pos += length;
        return value;
      }
      case 8: {
        codec = STRING;
        return string();
      }
      case 9:
        return container(list);
      case 10:
        return container(compound);
      case 11: {
        codec = INT_ARRAY;
        const length = arrayLength(view, pos, 4, little);
        pos += 4;
        return words(length, false);
      }
      case 12: {
        codec = LONG_ARRAY;
        const length = arrayLength(view, pos, 8, little);
        pos += 4;
        return new BigInt64Array(words(length * 2, true).buffer);
      }
      default:
        return fail("BadTag", pos);
    }
  }

  try {
    const type = rootTag(bytes);
    pos = 1;
    const name = string();
    const root = payload(type);
    if (pos !== bytes.length) fail("TrailingBytes", pos);
    return { name, root, codec };
  } catch (error) {
    if (error instanceof RangeError) throw new ReadFailure("UnexpectedEnd", pos);
    throw error;
  }
}

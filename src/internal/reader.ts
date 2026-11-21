import type { Codec, CompoundCodec, ListCodec, MixedListCodec, NbtValue } from "../codec.js";
import {
  HOST_LITTLE,
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
  type Indexes,
} from "./checks.js";
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

export interface Tree {
  readonly name: string;
  readonly root: NbtValue;
  readonly codec: Codec;
}

function swap32(x: number): number {
  return ((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | (x >>> 24);
}

function copy(bytes: Uint8Array, start: number, end: number): ArrayBuffer {
  const result = new Uint8Array(end - start);
  result.set(bytes.subarray(start, end));
  return result.buffer;
}

function assign(result: Record<string, NbtValue>, key: string, value: NbtValue): void {
  Object.defineProperty(result, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function readTree(bytes: Uint8Array, little: boolean, expected?: Codec): Tree {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const swap = little !== HOST_LITTLE;
  const inference = createInference();
  const { root: emptyShape, find, add, compoundOf, listOf, listOfEach, resolve } = inference;
  const indexes: Indexes = new Map();
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
    const result = new Int32Array(copy(bytes, pos, end));
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
      if (next.proto) assign(result, key, value);
      else result[key] = value;
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

  function typedList(listCodec: ListCodec): NbtValue[] {
    const length = listHeader(bytes, view, pos, little);
    const type = bytes[pos]!;
    const item = listCodec.item;
    expectItem(item, type, length, pos);
    pos += 5;
    const items = new Array<NbtValue>(length);
    if (type !== 9 && type !== 10) {
      for (let i = 0; i < length; i++) items[i] = payload(type);
      codec = listCodec;
      return items;
    }
    let codecs: Codec[] | undefined;
    for (let i = 0; i < length; i++) {
      items[i] = typed(type, item);
      if (codecs !== undefined) codecs.push(codec);
      else if (codec !== item) {
        codecs = new Array<Codec>(i).fill(item);
        codecs.push(codec);
      }
    }
    codec = codecs === undefined ? listCodec : listOfEach(codecs);
    return items;
  }

  function typedItems(mixed: MixedListCodec): NbtValue[] {
    const length = listHeader(bytes, view, pos, little);
    if (length !== mixed.items.length) return list();
    const type = bytes[pos]!;
    for (const item of mixed.items) expectTag(item.tag, type, pos);
    pos += 5;
    const items = new Array<NbtValue>(length);
    let codecs: Codec[] | undefined;
    for (let i = 0; i < length; i++) {
      const item = mixed.items[i]!;
      items[i] = typed(type, item);
      if (codecs !== undefined) codecs.push(codec);
      else if (codec !== item) {
        codecs = mixed.items.slice(0, i);
        codecs.push(codec);
      }
    }
    codec = codecs === undefined ? mixed : listOfEach(codecs);
    return items;
  }

  function typedCompound(compoundCodec: CompoundCodec): Record<string, NbtValue> {
    const result: Record<string, NbtValue> = {};
    const { keys, codecs } = compoundCodec;
    let resolved: Codec[] | undefined;
    let extraKeys: string[] | undefined;
    const extraCodecs: Codec[] = [];
    let next = 0;
    let seen = 0;
    let ordered = true;
    for (let type = entryTag(bytes, pos); type !== 0; type = entryTag(bytes, pos)) {
      const start = pos++;
      const key = string();
      const inOrder = keys[next] === key;
      ordered &&= inOrder;
      const index = inOrder ? next : fieldIndex(indexes, compoundCodec, key);
      let value: NbtValue;
      if (index === -1) {
        if (compoundCodec.strict) fail("UnknownKey", start);
        value = payload(type);
        (extraKeys ??= []).push(key);
        extraCodecs.push(codec);
      } else {
        const field = codecs[index]!;
        expectTag(field.tag, type, start);
        value = typed(type, field);
        if (codec !== field) (resolved ??= [...codecs])[index] = codec;
        next = index + 1;
        seen++;
      }
      if (!ordered && Object.hasOwn(result, key)) fail("DuplicateKey", start);
      if (key === "__proto__") assign(result, key, value);
      else result[key] = value;
    }
    const end = pos++;
    if (
      seen < keys.length &&
      missingKey(compoundCodec, (key) => Object.hasOwn(result, key)) !== -1
    ) {
      fail("MissingKey", end);
    }
    codec =
      resolved === undefined && extraKeys === undefined
        ? compoundCodec
        : resolve(compoundCodec, resolved ?? codecs, extraKeys ?? [], extraCodecs);
    return result;
  }

  function typed(type: number, field: Codec): NbtValue {
    if (field.tag === 9 || field.tag === 10) {
      if (++depth > MAX_DEPTH) fail("TooDeep", pos);
      let result: NbtValue;
      if (field.tag === 10) result = typedCompound(field);
      else result = "item" in field ? typedList(field) : typedItems(field);
      depth--;
      return result;
    }
    const value = payload(type);
    codec = field;
    return value;
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
        const value = new Int8Array(copy(bytes, pos, pos + length));
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
    if (expected !== undefined) expectTag(expected.tag, type, 0);
    pos = 1;
    const name = string();
    const root = expected === undefined ? payload(type) : typed(type, expected);
    if (pos !== bytes.length) fail("TrailingBytes", pos);
    return { name, root, codec };
  } catch (error) {
    if (error instanceof RangeError) throw new ReadFailure("UnexpectedEnd", pos);
    throw error;
  }
}

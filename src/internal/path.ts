import type { Codec, CompoundCodec, ListCodec, MixedListCodec } from "../codec.js";
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
import { isValidString } from "./mutf8.js";

const FIXED_SIZE: readonly number[] = [0, 1, 2, 4, 8, 4, 8];
const ARRAY_SIZE: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 8];
const LINEAR_KEYS = 16;
const FNV_OFFSET = -0x7ee3623b;
const FNV_PRIME = 0x01000193;

interface KeySet {
  lookup: Map<number, number> | undefined;
  names: Set<string> | undefined;
}

function hashText(text: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME);
  return hash;
}

export function locate(
  bytes: Uint8Array,
  little: boolean,
  expected?: Codec,
): DecodeError | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const indexes: Indexes = new Map();
  const steps: (string | number)[] = [];
  const hashes: number[] = [];
  const starts: number[] = [];
  let pos = 0;
  let depth = 0;

  function string(): void {
    const end = stringAt(bytes, view, pos, little);
    if (!isValidString(bytes, pos + 2, end)) fail("InvalidString", pos);
    pos = end;
  }

  function keyText(at: number): string {
    return textAt(bytes, at, stringAt(bytes, view, at, little));
  }

  function key(): number {
    const end = stringAt(bytes, view, pos, little);
    let hash = FNV_OFFSET;
    let i = pos + 2;
    for (; i < end; i++) {
      const b = bytes[i]!;
      if (b >= 0x80) break;
      hash = Math.imul(hash ^ b, FNV_PRIME);
    }
    if (i < end) hash = hashText(textAt(bytes, pos, end));
    pos = end;
    return hash;
  }

  function matches(at: number, text: string): boolean {
    const length = view.getUint16(at, little);
    if (length !== text.length) return false;
    for (let i = 0; i < length; i++) {
      if (bytes[at + 2 + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  }

  function distinctKeys(base: number, at: number): Set<string> {
    return new Set([...starts.slice(base), at].map((offset) => keyText(offset)));
  }

  function remember(base: number, hash: number, at: number, start: number): KeySet | undefined {
    for (let j = base; j < hashes.length; j++) {
      if (hashes[j] === hash && keyText(starts[j]!) === keyText(at)) fail("DuplicateKey", start);
    }
    if (hashes.length - base < LINEAR_KEYS) return undefined;
    const lookup = new Map<number, number>();
    for (let j = base; j < hashes.length; j++) lookup.set(hashes[j]!, starts[j]!);
    if (lookup.size < hashes.length - base || lookup.has(hash)) {
      return { lookup: undefined, names: distinctKeys(base, at) };
    }
    lookup.set(hash, at);
    return { lookup, names: undefined };
  }

  function rememberMany(keys: KeySet, base: number, hash: number, at: number, start: number): void {
    if (keys.names !== undefined) {
      const text = keyText(at);
      if (keys.names.has(text)) fail("DuplicateKey", start);
      keys.names.add(text);
      return;
    }
    const other = keys.lookup!.get(hash);
    if (other === undefined) keys.lookup!.set(hash, at);
    else if (keyText(other) === keyText(at)) fail("DuplicateKey", start);
    else keys.names = distinctKeys(base, at);
  }

  function list(codec: ListCodec | MixedListCodec | undefined): void {
    const length = listHeader(bytes, view, pos, little);
    const type = bytes[pos]!;
    const item = codec !== undefined && "item" in codec ? codec.item : undefined;
    const items =
      codec !== undefined && "items" in codec && codec.items.length === length
        ? codec.items
        : undefined;
    if (item !== undefined) expectItem(item, type, length, pos);
    for (const each of items ?? []) expectTag(each.tag, type, pos);
    pos += 5;
    if (type < 7) {
      pos += length * FIXED_SIZE[type]!;
      return;
    }
    for (let i = 0; i < length; i++) {
      steps.push(i);
      skip(type, item ?? items?.[i]);
      steps.pop();
    }
  }

  function compound(codec: CompoundCodec | undefined): void {
    const base = hashes.length;
    let many: KeySet | undefined;
    const found = codec === undefined ? undefined : new Uint8Array(codec.keys.length);
    let next = 0;
    for (let type = entryTag(bytes, pos); type !== 0; type = entryTag(bytes, pos)) {
      const start = pos++;
      const at = pos;
      const hash = key();
      steps.push(~at);
      let field: Codec | undefined;
      if (codec !== undefined) {
        const guess = codec.keys[next];
        const index =
          guess !== undefined && matches(at, guess)
            ? next
            : fieldIndex(indexes, codec, keyText(at));
        if (index === -1 && codec.strict) fail("UnknownKey", start);
        field = codec.codecs[index];
        if (field !== undefined) {
          expectTag(field.tag, type, start);
          found![index] = 1;
          next = index + 1;
        }
      }
      skip(type, field);
      if (many === undefined) many = remember(base, hash, at, start);
      else rememberMany(many, base, hash, at, start);
      hashes.push(hash);
      starts.push(at);
      steps.pop();
    }
    const end = pos++;
    if (codec !== undefined) {
      const missing = missingKey(codec, (index) => found![index] === 1);
      if (missing !== -1) {
        steps.push(codec.keys[missing]!);
        fail("MissingKey", end);
      }
    }
    hashes.length = base;
    starts.length = base;
  }

  function skip(type: number, codec: Codec | undefined): void {
    if (type < 7) {
      if (pos + FIXED_SIZE[type]! > bytes.length) fail("UnexpectedEnd", pos);
      pos += FIXED_SIZE[type]!;
    } else if (type === 8) {
      string();
    } else if (type === 9 || type === 10) {
      if (++depth > MAX_DEPTH) fail("TooDeep", pos);
      if (type === 9) list(codec?.tag === 9 ? codec : undefined);
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
    const path = steps.map((step) =>
      typeof step === "number" && step < 0 ? keyText(~step) : step,
    );
    return toError(failure, path);
  }
}

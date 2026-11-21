import type { Codec, CompoundCodec } from "../codec.js";
import type { DecodeError, Path, TagName } from "../result.js";
import { decodeString } from "./mutf8.js";

export type ReadKind =
  | "UnexpectedEnd"
  | "BadTag"
  | "NegativeLength"
  | "TrailingBytes"
  | "InvalidString"
  | "DuplicateKey"
  | "TooDeep"
  | "TagMismatch"
  | "MissingKey"
  | "UnknownKey";

export class ReadFailure extends Error {
  readonly kind: ReadKind;
  readonly offset: number;
  readonly expected: number;
  readonly found: number;

  constructor(kind: ReadKind, offset: number, expected = 0, found = 0) {
    super(`${kind} at ${offset}`);
    this.kind = kind;
    this.offset = offset;
    this.expected = expected;
    this.found = found;
  }
}

export const HOST_LITTLE: boolean = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export const TAG_NAMES: readonly TagName[] = [
  "end",
  "byte",
  "short",
  "int",
  "long",
  "float",
  "double",
  "byteArray",
  "string",
  "list",
  "compound",
  "intArray",
  "longArray",
];

export function toError(failure: ReadFailure, path: Path): DecodeError {
  const { kind, offset } = failure;
  if (kind !== "TagMismatch") return { kind, offset, path };
  const expected = TAG_NAMES[failure.expected]!;
  return { kind, offset, path, expected, found: TAG_NAMES[failure.found]! };
}

export const MAX_DEPTH = 512;
export const MIN_SIZE: readonly number[] = [0, 1, 2, 4, 8, 4, 8, 4, 2, 5, 1, 4, 4];

export function fail(kind: ReadKind, offset: number): never {
  throw new ReadFailure(kind, offset);
}

export function expectTag(expected: number, found: number, offset: number): void {
  if (expected !== found) throw new ReadFailure("TagMismatch", offset, expected, found);
}

export function expectItem(item: Codec, type: number, length: number, offset: number): void {
  if (type !== 0 || length !== 0) expectTag(item.tag, type, offset);
}

export type Indexes = Map<CompoundCodec, Map<string, number>>;

export function fieldIndex(indexes: Indexes, codec: CompoundCodec, key: string): number {
  let index = indexes.get(codec);
  if (index === undefined) {
    index = new Map(codec.keys.map((name, i) => [name, i]));
    indexes.set(codec, index);
  }
  return index.get(key) ?? -1;
}

export function missingKey(codec: CompoundCodec, has: (index: number) => boolean): number {
  return codec.optionals.findIndex((optional, i) => !optional && !has(i));
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

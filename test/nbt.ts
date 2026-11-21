import { readFileSync } from "node:fs";
import { write, type RootTagLike } from "nbtify";
import {
  decode,
  type Codec,
  type DecodeError,
  type NbtDocument,
  type Result,
} from "../src/index.js";

export const fixtures: readonly string[] = ["entities", "chunks", "strings"];

export const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../bench/fixtures/${name}.nbt`, import.meta.url)));

export const nbtify = (root: RootTagLike, endian: "big" | "little" = "big"): Promise<Uint8Array> =>
  write(root, { rootName: "", endian, compression: null });

export function decoded(bytes: Uint8Array, endian: "big" | "little" = "big"): NbtDocument {
  const result = decode(bytes, { endian });
  if (!result.ok) throw new Error(`${result.error.kind} at ${result.error.offset ?? "?"}`);
  return result.value;
}

export function decodedWith<C extends Codec>(bytes: Uint8Array, codec: C): NbtDocument<C> {
  const result = decode(bytes, codec);
  if (!result.ok) throw new Error(`${result.error.kind} at ${result.error.path.join(".")}`);
  return result.value;
}

export function ok<T>(result: Result<T, { readonly kind: string }>): T {
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

export function errorOf(bytes: readonly number[] | Uint8Array): DecodeError | undefined {
  const result = decode(new Uint8Array(bytes));
  return result.ok ? undefined : result.error;
}

type Entry = readonly [key: string, codec: Codec, optional: boolean];

export const fields = (codec: Codec | undefined): readonly Entry[] =>
  codec?.tag === 10
    ? codec.codecs.map((item, i): Entry => [codec.keys[i] ?? "", item, codec.optionals[i] === true])
    : [];

export const items = (codec: Codec | undefined): readonly Codec[] =>
  codec !== undefined && "items" in codec ? codec.items : [];

export const itemOf = (codec: Codec | undefined): Codec | undefined =>
  codec !== undefined && "item" in codec ? codec.item : undefined;

export const utf = (text: string): number[] => [0, text.length, ...new TextEncoder().encode(text)];
export const named = (tag: number, name: string, ...payload: number[]): number[] => [
  tag,
  ...utf(name),
  ...payload,
];
export const root = (...entries: number[]): Uint8Array => new Uint8Array([10, 0, 0, ...entries, 0]);
export const int32 = (n: number): number[] => [
  (n >> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];

export function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => unwrap(item));
  if (ArrayBuffer.isView(value)) return value;
  if (typeof value === "object" && value !== null) {
    if (value.constructor !== Object) return value.valueOf();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)]));
  }
  return value;
}

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return left.every((byte, i) => byte === right[i]);
}

export function firstDifference(a: unknown, b: unknown, path = "$"): string | undefined {
  if (Object.is(a, b)) return undefined;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return sameBytes(a, b) ? undefined : path;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return path;
  const keys = Object.keys(a);
  if (keys.join() !== Object.keys(b).join()) return `${path} keys`;
  for (const key of keys) {
    const found = firstDifference(Reflect.get(a, key), Reflect.get(b, key), `${path}.${key}`);
    if (found !== undefined) return found;
  }
  return undefined;
}

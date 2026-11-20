import type { Byte, Double, Float, Int, Long, Short } from "./internal/brand.js";

declare const shape: unique symbol;

export interface ByteCodec {
  readonly tag: 1;
}
export interface ShortCodec {
  readonly tag: 2;
}
export interface IntCodec {
  readonly tag: 3;
}
export interface LongCodec {
  readonly tag: 4;
}
export interface FloatCodec {
  readonly tag: 5;
}
export interface DoubleCodec {
  readonly tag: 6;
}
export interface ByteArrayCodec {
  readonly tag: 7;
}
export interface StringCodec {
  readonly tag: 8;
}
export interface IntArrayCodec {
  readonly tag: 11;
}
export interface LongArrayCodec {
  readonly tag: 12;
}

export interface ListCodec<I extends Codec = Codec> {
  readonly tag: 9;
  readonly item: I;
}

export interface MixedListCodec {
  readonly tag: 9;
  readonly items: readonly Codec[];
}

export type Entry = readonly [key: string, codec: Codec, optional: boolean];

export interface CompoundCodec<F extends Fields = Fields> {
  readonly tag: 10;
  readonly fields: readonly Entry[];
  readonly strict: boolean;
  readonly [shape]?: F;
}

export type Codec =
  | ByteCodec
  | ShortCodec
  | IntCodec
  | LongCodec
  | FloatCodec
  | DoubleCodec
  | ByteArrayCodec
  | StringCodec
  | ListCodec
  | MixedListCodec
  | CompoundCodec
  | IntArrayCodec
  | LongArrayCodec;

export interface Optional<C extends Codec = Codec> {
  readonly optional: C;
}

export type Field = Codec | Optional;
export type Fields = { readonly [key: string]: Field };

type Plain<C> = C extends (...args: never[]) => unknown
  ? C extends Codec
    ? { readonly tag: C["tag"] }
    : never
  : C extends Optional<infer I>
    ? Optional<Plain<I>>
    : C;
type PlainFields<F extends Fields> = { [K in keyof F]: Plain<F[K]> };
type Simplify<T> = { [K in keyof T]: T[K] };

export type NbtValue =
  | Byte
  | Short
  | Int
  | Long
  | Float
  | Double
  | string
  | Int8Array
  | Int32Array
  | BigInt64Array
  | readonly NbtValue[]
  | { readonly [key: string]: NbtValue };

type InferFields<F extends Fields> = Simplify<
  { readonly [K in keyof F as F[K] extends Optional ? never : K]: InferCodec<F[K]> } & {
    readonly [K in keyof F as F[K] extends Optional ? K : never]?: F[K] extends Optional<infer C>
      ? InferCodec<C>
      : never;
  }
>;

type InferCodec<C> = C extends ByteCodec
  ? Byte
  : C extends ShortCodec
    ? Short
    : C extends IntCodec
      ? Int
      : C extends LongCodec
        ? Long
        : C extends FloatCodec
          ? Float
          : C extends DoubleCodec
            ? Double
            : C extends ByteArrayCodec
              ? Int8Array
              : C extends StringCodec
                ? string
                : C extends IntArrayCodec
                  ? Int32Array
                  : C extends LongArrayCodec
                    ? BigInt64Array
                    : C extends ListCodec<infer I>
                      ? [Codec] extends [I]
                        ? readonly NbtValue[]
                        : readonly InferCodec<I>[]
                      : C extends MixedListCodec
                        ? readonly NbtValue[]
                        : C extends CompoundCodec<infer F>
                          ? string extends keyof F
                            ? { readonly [key: string]: NbtValue }
                            : InferFields<F>
                          : never;

export type Infer<C> = [Codec] extends [C] ? NbtValue : InferCodec<C>;

export type Endian = "big" | "little";
export type Compression = "gzip" | "zlib" | "none";

export interface NbtDocument<C extends Codec = Codec> {
  readonly name: string;
  readonly root: NoInfer<Infer<C>>;
  readonly codec: C;
  readonly endian: Endian;
}

export interface NbtFile<C extends Codec = Codec> extends NbtDocument<C> {
  readonly compression: Compression;
}

type Leaf = ((...args: never[]) => unknown) & {
  readonly tag: Exclude<Codec["tag"], 9 | 10>;
};

function plain<C extends Codec>(codec: C): Plain<C>;
function plain(codec: Codec | Leaf): Codec {
  return typeof codec === "function" ? { tag: codec.tag } : codec;
}

function entries(fields: Fields): Entry[] {
  return Object.entries(fields).map(([key, field]) =>
    "optional" in field ? [key, plain(field.optional), true] : [key, plain(field), false],
  );
}

export function list<I extends Codec>(item: I): ListCodec<Plain<I>> {
  return { tag: 9, item: plain(item) };
}

export function optional<C extends Codec>(codec: C): Optional<Plain<C>> {
  return { optional: plain(codec) };
}

export function compound<F extends Fields>(fields: F): CompoundCodec<PlainFields<F>> {
  return { tag: 10, fields: entries(fields), strict: false };
}

export function strict<F extends Fields>(codec: CompoundCodec<F>): CompoundCodec<F> {
  return { ...codec, strict: true };
}

export function extend<F extends Fields, G extends Fields>(
  codec: CompoundCodec<F>,
  fields: G,
): CompoundCodec<Simplify<Omit<F, keyof G> & PlainFields<G>>> {
  const added = new Map(entries(fields).map((entry) => [entry[0], entry]));
  const kept = codec.fields.map((entry) => added.get(entry[0]) ?? entry);
  const known = new Set(codec.fields.map(([key]) => key));
  const appended = [...added.values()].filter(([key]) => !known.has(key));
  return { tag: 10, fields: [...kept, ...appended], strict: codec.strict };
}

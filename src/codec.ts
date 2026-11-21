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

export interface CompoundCodec<F extends Fields = Fields> {
  readonly tag: 10;
  readonly keys: readonly string[];
  readonly codecs: readonly Codec[];
  readonly optionals: readonly boolean[];
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

export function plain<C extends Codec>(codec: C): Plain<C>;
export function plain(codec: Codec | Leaf): Codec {
  return typeof codec === "function" ? { tag: codec.tag } : codec;
}

interface Columns {
  keys: string[];
  codecs: Codec[];
  optionals: boolean[];
}

function column(field: Field): readonly [Codec, boolean] {
  return "optional" in field ? [plain(field.optional), true] : [plain(field), false];
}

function columns(fields: Fields): Columns {
  const result: Columns = { keys: [], codecs: [], optionals: [] };
  for (const [key, field] of Object.entries(fields)) {
    const [codec, isOptional] = column(field);
    result.keys.push(key);
    result.codecs.push(codec);
    result.optionals.push(isOptional);
  }
  return result;
}

export function list<I extends Codec>(item: I): ListCodec<Plain<I>> {
  return { tag: 9, item: plain(item) };
}

export function optional<C extends Codec>(codec: C): Optional<Plain<C>> {
  return { optional: plain(codec) };
}

export function compound<F extends Fields>(fields: F): CompoundCodec<PlainFields<F>> {
  return { tag: 10, ...columns(fields), strict: false };
}

export function strict<F extends Fields>(codec: CompoundCodec<F>): CompoundCodec<F> {
  return { ...codec, strict: true };
}

export function extend<F extends Fields, G extends Fields>(
  codec: CompoundCodec<F>,
  fields: G,
): CompoundCodec<Simplify<Omit<F, keyof G> & PlainFields<G>>> {
  const keys = [...codec.keys];
  const codecs = [...codec.codecs];
  const optionals = [...codec.optionals];
  const index = new Map(keys.map((key, i) => [key, i]));
  for (const [key, field] of Object.entries(fields)) {
    const at = index.get(key) ?? keys.length;
    keys[at] = key;
    [codecs[at], optionals[at]] = column(field);
  }
  return { tag: 10, keys, codecs, optionals, strict: codec.strict };
}

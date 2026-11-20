import type {
  ByteArrayCodec,
  ByteCodec,
  DoubleCodec,
  FloatCodec,
  IntArrayCodec,
  IntCodec,
  LongArrayCodec,
  LongCodec,
  ShortCodec,
  StringCodec,
} from "./codec.js";
import {
  toBrand,
  type Branded,
  type Byte,
  type Double,
  type Float,
  type Int,
  type Long,
  type Short,
} from "./internal/brand.js";

type Literal<N extends number> = number extends N
  ? false
  : N extends Branded<string>
    ? false
    : true;
type Checked<N extends number, Name extends string> =
  Literal<N> extends false ? N : `${N}` extends `${bigint}` ? N : `${N} is not a valid ${Name}`;
type CheckedAll<T extends readonly number[], Name extends string> = {
  [K in keyof T]: Checked<T[K], Name>;
};

export interface IntegerLeaf<B extends Byte | Short | Int, Name extends string> {
  <const N extends number>(n: Checked<N, Name>): B;
  of<const T extends readonly number[]>(...n: CheckedAll<T, Name>): readonly B[];
}

export interface DecimalLeaf<B extends Float | Double> {
  (n: number): B;
  of(...n: readonly number[]): readonly B[];
}

export interface LongLeaf {
  (n: bigint): Long;
  of(...n: readonly bigint[]): readonly Long[];
}

export interface IntegerArrayLeaf<A, Name extends string> {
  <const T extends readonly number[]>(...n: CheckedAll<T, Name>): A;
  from(values: Iterable<number>): A;
}

export interface LongArrayLeaf {
  (...n: readonly bigint[]): BigInt64Array<ArrayBuffer>;
  from(values: Iterable<bigint>): BigInt64Array<ArrayBuffer>;
}

function integer(name: string, bits: number): (n: number) => number {
  const min = -(2 ** (bits - 1));
  const max = 2 ** (bits - 1) - 1;
  return (n) => {
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new RangeError(`${n} is not a valid ${name}`);
    }
    return n;
  };
}

function toFloat(n: number): Float {
  const rounded = Math.fround(n);
  if (Number.isFinite(n) && !Number.isFinite(rounded)) {
    throw new RangeError(`${n} is not a valid float`);
  }
  return toBrand<Float>(rounded);
}

function toLong(n: bigint): Long {
  if (BigInt.asIntN(64, n) !== n) throw new RangeError(`${n} is not a valid long`);
  return toBrand<Long>(n);
}

function withTag<F extends object, T extends number, P extends object>(
  fn: F,
  tag: T,
  props: P,
): F & { readonly tag: T } & P {
  return Object.assign(fn, { tag }, props);
}

function integerLeaf<T extends 1 | 2 | 3, B extends Byte | Short | Int, Name extends string>(
  tag: T,
  name: Name,
  bits: number,
): IntegerLeaf<B, Name> & { readonly tag: T } {
  const integerCheck = integer(name, bits);
  const check = (n: number): B => toBrand<B>(integerCheck(n));
  function leaf<const N extends number>(n: Checked<N, Name>): B;
  function leaf(n: number): B {
    return check(n);
  }
  function of<const L extends readonly number[]>(...n: CheckedAll<L, Name>): readonly B[];
  function of(...n: readonly number[]): readonly B[] {
    return n.map((value) => check(value));
  }
  return withTag(leaf, tag, { of });
}

function integerArrayLeaf<T extends 7 | 11, A, Name extends string>(
  tag: T,
  name: Name,
  bits: number,
  from: (values: Iterable<number>, check: (n: number) => number) => A,
): IntegerArrayLeaf<A, Name> & { readonly tag: T } {
  const check = integer(name, bits);
  const fromValues = (values: Iterable<number>): A => from(values, check);
  function leaf<const L extends readonly number[]>(...n: CheckedAll<L, Name>): A;
  function leaf(...n: readonly number[]): A {
    return fromValues(n);
  }
  return withTag(leaf, tag, { from: fromValues });
}

export const byte: IntegerLeaf<Byte, "byte"> & ByteCodec = integerLeaf(1, "byte", 8);
export const short: IntegerLeaf<Short, "short"> & ShortCodec = integerLeaf(2, "short", 16);
export const int: IntegerLeaf<Int, "int"> & IntCodec = integerLeaf(3, "int", 32);

export const long: LongLeaf & LongCodec = withTag(toLong, 4, {
  of: (...n: readonly bigint[]): readonly Long[] => n.map((value) => toLong(value)),
});

export const float: DecimalLeaf<Float> & FloatCodec = withTag(toFloat, 5, {
  of: (...n: readonly number[]): readonly Float[] => n.map((value) => toFloat(value)),
});

const toDouble = (n: number): Double => toBrand<Double>(n);
export const double: DecimalLeaf<Double> & DoubleCodec = withTag(toDouble, 6, {
  of: (...n: readonly number[]): readonly Double[] => n.map((value) => toDouble(value)),
});

export const string: StringCodec = { tag: 8 };

export const byteArray: IntegerArrayLeaf<Int8Array<ArrayBuffer>, "byte"> & ByteArrayCodec =
  integerArrayLeaf(7, "byte", 8, (values, check) =>
    Int8Array.from(values, (value) => check(value)),
  );
export const intArray: IntegerArrayLeaf<Int32Array<ArrayBuffer>, "int"> & IntArrayCodec =
  integerArrayLeaf(11, "int", 32, (values, check) =>
    Int32Array.from(values, (value) => check(value)),
  );

const longArrayFrom = (values: Iterable<bigint>): BigInt64Array<ArrayBuffer> =>
  BigInt64Array.from(values, (value) => toLong(value));
export const longArray: LongArrayLeaf & LongArrayCodec = withTag(
  (...n: readonly bigint[]) => longArrayFrom(n),
  12,
  { from: longArrayFrom },
);

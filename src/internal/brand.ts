declare const brand: unique symbol;

export type Branded<Name extends string> = { readonly [brand]: Name };
export type Brand<T extends number | bigint, Name extends string> = T & Branded<Name>;

export type Byte = Brand<number, "byte">;
export type Short = Brand<number, "short">;
export type Int = Brand<number, "int">;
export type Long = Brand<bigint, "long">;
export type Float = Brand<number, "float">;
export type Double = Brand<number, "double">;

export function toBrand<B extends Brand<number, string>>(value: number): B;
export function toBrand<B extends Brand<bigint, string>>(value: bigint): B;
export function toBrand(value: number | bigint): Brand<number | bigint, string> {
  return value as Brand<number | bigint, string>;
}

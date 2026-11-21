import { expectTypeOf, test } from "vitest";
import {
  byte,
  byteArray,
  compound,
  decode,
  double,
  encode,
  extend,
  float,
  int,
  intArray,
  list,
  long,
  longArray,
  optional,
  short,
  strict,
  string,
  type Byte,
  type Codec,
  type DecodeError,
  type EncodeError,
  type Double,
  type Float,
  type Infer,
  type Int,
  type Long,
  type NbtDocument,
  type NbtValue,
  type Result,
  type Short,
} from "../../src/index.js";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });
const Player = compound({
  Name: string,
  Health: float,
  XpLevel: int,
  Pos: list(double),
  Inventory: list(Item),
  LastPlayed: long,
});

declare const v: Infer<typeof Player>;
declare const doc: NbtDocument<typeof Player>;
declare const level: Int;
declare const plain: number;
declare const mixed: 1 | 2.5;
declare const many: number[];

test("Infer gives deep readonly plain data", () => {
  expectTypeOf<Infer<typeof Item>>().toEqualTypeOf<{
    readonly id: string;
    readonly Count: Byte;
    readonly Slot?: Byte;
  }>();
  expectTypeOf(v.Pos).toEqualTypeOf<readonly Double[]>();
  expectTypeOf(v.LastPlayed).toEqualTypeOf<Long>();
  expectTypeOf<Infer<Codec>>().toEqualTypeOf<NbtValue>();
});

test("optional keys are absent, not undefined", () => {
  // @ts-expect-error
  const item: Infer<typeof Item> = { id: "a", Count: byte(1), Slot: undefined };
  expectTypeOf(item).not.toBeNever();
});

test("brand table", () => {
  // @ts-expect-error
  expectTypeOf({ ...v, XpLevel: float(7.5) }).toExtend<Infer<typeof Player>>();
  // @ts-expect-error
  expectTypeOf({ ...v, Health: 20 }).toExtend<Infer<typeof Player>>();
  expectTypeOf({ ...v, Health: float(20) }).toExtend<Infer<typeof Player>>();
  expectTypeOf({ ...v, XpLevel: int(v.XpLevel + 1) }).toExtend<Infer<typeof Player>>();
  // @ts-expect-error
  expectTypeOf({ ...v, LastPlayed: 5n }).toExtend<Infer<typeof Player>>();
  expectTypeOf({ ...v, LastPlayed: long(v.LastPlayed + 1n) }).toExtend<Infer<typeof Player>>();
});

test("encode(doc) takes its type from the codec", () => {
  expectTypeOf(encode({ ...doc, root: { ...doc.root, Health: float(20) } })).toEqualTypeOf<
    Result<Uint8Array, EncodeError>
  >();
  // @ts-expect-error
  encode({ ...doc, root: { ...doc.root, Health: 20 } });
  // @ts-expect-error
  encode({ ...doc, root: { ...doc.root, Glowing: byte(1) } });
  // @ts-expect-error
  encode({ ...doc, codec: extend(doc.codec, { Glowing: byte }) });
  encode({
    ...doc,
    root: { ...doc.root, Glowing: byte(1) },
    codec: extend(doc.codec, { Glowing: byte }),
  });
  encode({ ...doc, codec: strict(doc.codec) });
});

test("constructor return types", () => {
  expectTypeOf(byte(1)).toEqualTypeOf<Byte>();
  expectTypeOf(short(1)).toEqualTypeOf<Short>();
  expectTypeOf(int(1)).toEqualTypeOf<Int>();
  expectTypeOf(long(5n)).toEqualTypeOf<Long>();
  expectTypeOf(float(20)).toEqualTypeOf<Float>();
  expectTypeOf(double(20)).toEqualTypeOf<Double>();
  expectTypeOf(double.of(0, 70, 0)).toEqualTypeOf<readonly Double[]>();
  expectTypeOf(byteArray(1, 2)).toEqualTypeOf<Int8Array<ArrayBuffer>>();
  expectTypeOf(intArray(1, 2, 3, 4)).toEqualTypeOf<Int32Array<ArrayBuffer>>();
  expectTypeOf(intArray.from(new Set([1]))).toEqualTypeOf<Int32Array<ArrayBuffer>>();
  expectTypeOf(longArray(1n)).toEqualTypeOf<BigInt64Array<ArrayBuffer>>();
});

test("non-integer literals fail at compile time", () => {
  // @ts-expect-error
  int(7.5);
  // @ts-expect-error
  byte(0.5);
  // @ts-expect-error
  short(-1.25);
  // @ts-expect-error
  int(mixed);
  // @ts-expect-error
  int.of(1, 2.5, 3);
  // @ts-expect-error
  intArray(1, 7.5);
  // @ts-expect-error
  byteArray(0.5);
  expectTypeOf(int(7)).toEqualTypeOf<Int>();
  expectTypeOf(int(level)).toEqualTypeOf<Int>();
  expectTypeOf(int(level + 1)).toEqualTypeOf<Int>();
  expectTypeOf(int(plain)).toEqualTypeOf<Int>();
  expectTypeOf(int.of(1, 2, level, plain)).toEqualTypeOf<readonly Int[]>();
  expectTypeOf(int.of(...many)).toEqualTypeOf<readonly Int[]>();
  expectTypeOf(intArray(...many)).toEqualTypeOf<Int32Array<ArrayBuffer>>();
  expectTypeOf(float(7.5)).toEqualTypeOf<Float>();
});

test("list and optional reject misuse", () => {
  // @ts-expect-error
  list(optional(byte));
  expectTypeOf(list(byte)).not.toHaveProperty("of");
  expectTypeOf(list(byte).item).toEqualTypeOf<{ readonly tag: 1 }>();
});

test("decode takes its document type from the codec", () => {
  const bytes = new Uint8Array();
  expectTypeOf(decode(bytes, Player)).toEqualTypeOf<
    Result<NbtDocument<typeof Player>, DecodeError>
  >();
  expectTypeOf(decode(bytes, { endian: "little" })).toEqualTypeOf<
    Result<NbtDocument, DecodeError>
  >();
  // @ts-expect-error
  decode(bytes, { endain: "little" });
});

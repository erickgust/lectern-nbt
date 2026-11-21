import type { Codec, CompoundCodec, ListCodec, MixedListCodec } from "../codec.js";

export const BYTE: Codec = Object.freeze({ tag: 1 });
export const SHORT: Codec = Object.freeze({ tag: 2 });
export const INT: Codec = Object.freeze({ tag: 3 });
export const LONG: Codec = Object.freeze({ tag: 4 });
export const FLOAT: Codec = Object.freeze({ tag: 5 });
export const DOUBLE: Codec = Object.freeze({ tag: 6 });
export const BYTE_ARRAY: Codec = Object.freeze({ tag: 7 });
export const STRING: Codec = Object.freeze({ tag: 8 });
export const INT_ARRAY: Codec = Object.freeze({ tag: 11 });
export const LONG_ARRAY: Codec = Object.freeze({ tag: 12 });
export const EMPTY_LIST: MixedListCodec = Object.freeze({ tag: 9, items: Object.freeze([]) });

export interface Shape {
  readonly key: string;
  readonly codec: Codec;
  readonly optional: boolean;
  readonly parent: Shape | undefined;
  readonly proto: boolean;
  sibling: Shape | undefined;
  children: Shape | Map<string, Shape> | undefined;
  compound: CompoundCodec | undefined;
}

export interface Inference {
  readonly root: Shape;
  readonly find: (shape: Shape, key: string, codec: Codec, optional: boolean) => Shape | undefined;
  readonly add: (shape: Shape, key: string, codec: Codec, optional: boolean) => Shape;
  readonly compoundOf: (shape: Shape) => CompoundCodec;
  readonly listOf: (item: Codec) => ListCodec;
  readonly listOfEach: (codecs: readonly Codec[]) => Codec;
  readonly resolve: (
    base: CompoundCodec,
    codecs: readonly Codec[],
    extraKeys: readonly string[],
    extraCodecs: readonly Codec[],
  ) => CompoundCodec;
}

function node(key: string, codec: Codec, optional: boolean, parent?: Shape): Shape {
  return {
    key,
    codec,
    optional,
    parent,
    proto: key === "__proto__",
    sibling: undefined,
    children: undefined,
    compound: undefined,
  };
}

function find(shape: Shape, key: string, codec: Codec, optional: boolean): Shape | undefined {
  const children = shape.children;
  let next =
    children instanceof Map ? children.get(key) : children?.key === key ? children : undefined;
  while (next !== undefined && (next.codec !== codec || next.optional !== optional)) {
    next = next.sibling;
  }
  return next;
}

function add(shape: Shape, key: string, codec: Codec, optional: boolean): Shape {
  const next = node(key, codec, optional, shape);
  const children = shape.children;
  if (children instanceof Map) {
    next.sibling = children.get(key);
    children.set(key, next);
  } else if (children === undefined || children.key === key) {
    next.sibling = children;
    shape.children = next;
  } else {
    shape.children = new Map([
      [children.key, children],
      [key, next],
    ]);
  }
  return next;
}

function compoundOf(shape: Shape): CompoundCodec {
  if (shape.compound !== undefined) return shape.compound;
  let size = 0;
  for (let s: Shape = shape; s.parent !== undefined; s = s.parent) size++;
  const keys = new Array<string>(size);
  const codecs = new Array<Codec>(size);
  const optionals = new Array<boolean>(size);
  for (let s: Shape = shape; s.parent !== undefined; s = s.parent) {
    size--;
    keys[size] = s.key;
    codecs[size] = s.codec;
    optionals[size] = s.optional;
  }
  shape.compound = { tag: 10, keys, codecs, optionals, strict: false };
  return shape.compound;
}

function strictIf(strict: boolean, codec: CompoundCodec): CompoundCodec {
  return strict ? { ...codec, strict } : codec;
}

export function createInference(): Inference {
  const root = node("", EMPTY_LIST, false);
  const lists = new Map<Codec, ListCodec>();

  const listOf = (item: Codec): ListCodec => {
    let codec = lists.get(item);
    if (codec === undefined) {
      codec = { tag: 9, item };
      lists.set(item, codec);
    }
    return codec;
  };

  const child = (shape: Shape, key: string, codec: Codec, optional: boolean): Shape =>
    find(shape, key, codec, optional) ?? add(shape, key, codec, optional);

  const mergeCompounds = (compounds: readonly CompoundCodec[]): Codec | undefined => {
    const keys = new Map<string, { codecs: Codec[]; optional: boolean }>();
    for (const { keys: names, codecs, optionals } of compounds) {
      for (const [i, key] of names.entries()) {
        const codec = codecs[i]!;
        const optional = optionals[i]!;
        const seen = keys.get(key);
        if (seen === undefined) {
          keys.set(key, { codecs: [codec], optional });
        } else {
          seen.codecs.push(codec);
          seen.optional ||= optional;
        }
      }
    }
    let shape = root;
    for (const [key, { codecs, optional }] of keys) {
      const codec = mergeAll(codecs);
      if (codec === undefined) return undefined;
      shape = child(shape, key, codec, optional || codecs.length < compounds.length);
    }
    return strictIf(
      compounds.every((compound) => compound.strict),
      compoundOf(shape),
    );
  };

  const mergeAll = (codecs: readonly Codec[]): Codec | undefined => {
    let distinct = [...new Set(codecs)];
    if (distinct.every((codec) => codec.tag === 9)) {
      const filled = distinct.filter((codec) => codec !== EMPTY_LIST);
      if (filled.length > 0) distinct = filled;
    }
    if (distinct.length <= 1) return distinct[0];
    const listCodecs = distinct.filter((codec): codec is ListCodec => "item" in codec);
    if (listCodecs.length === distinct.length) {
      const item = mergeAll(listCodecs.map((list) => list.item));
      return item === undefined ? undefined : listOf(item);
    }
    const compounds = distinct.filter((codec): codec is CompoundCodec => codec.tag === 10);
    return compounds.length === distinct.length ? mergeCompounds(compounds) : undefined;
  };

  const listOfEach = (codecs: readonly Codec[]): Codec => {
    const merged = mergeAll(codecs);
    return merged === undefined ? { tag: 9, items: codecs } : listOf(merged);
  };

  const resolve = (
    base: CompoundCodec,
    codecs: readonly Codec[],
    extraKeys: readonly string[],
    extraCodecs: readonly Codec[],
  ): CompoundCodec => {
    let shape = root;
    for (const [i, key] of base.keys.entries()) {
      shape = child(shape, key, codecs[i]!, base.optionals[i]!);
    }
    for (const [i, key] of extraKeys.entries()) shape = child(shape, key, extraCodecs[i]!, false);
    return strictIf(base.strict, compoundOf(shape));
  };

  return { root, find, add, compoundOf, listOf, listOfEach, resolve };
}

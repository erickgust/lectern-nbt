import type { Codec, CompoundCodec, Entry, ListCodec, MixedListCodec } from "../codec.js";

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
  const fields: Entry[] = [];
  for (let s: Shape = shape; s.parent !== undefined; s = s.parent) {
    fields.push([s.key, s.codec, s.optional]);
  }
  fields.reverse();
  shape.compound = { tag: 10, fields, strict: false };
  return shape.compound;
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

  const mergeCompounds = (a: CompoundCodec, b: CompoundCodec): Codec | undefined => {
    const other = new Map(b.fields.map((entry) => [entry[0], entry]));
    let shape = root;
    for (const [key, codec, optional] of a.fields) {
      const entry = other.get(key);
      if (entry === undefined) {
        shape = child(shape, key, codec, true);
      } else {
        const merged = merge(codec, entry[1]);
        if (merged === undefined) return undefined;
        shape = child(shape, key, merged, optional || entry[2]);
        other.delete(key);
      }
    }
    for (const [key, codec] of other.values()) shape = child(shape, key, codec, true);
    return compoundOf(shape);
  };

  const merge = (a: Codec, b: Codec): Codec | undefined => {
    if (a === b) return a;
    if (a === EMPTY_LIST && b.tag === 9) return b;
    if (b === EMPTY_LIST && a.tag === 9) return a;
    if (a.tag === 9 && b.tag === 9 && "item" in a && "item" in b) {
      const item = merge(a.item, b.item);
      return item === undefined ? undefined : listOf(item);
    }
    if (a.tag === 10 && b.tag === 10) return mergeCompounds(a, b);
    return undefined;
  };

  const listOfEach = (codecs: readonly Codec[]): Codec => {
    let merged: Codec | undefined;
    for (const codec of new Set(codecs)) {
      merged = merged === undefined ? codec : merge(merged, codec);
      if (merged === undefined) return { tag: 9, items: codecs };
    }
    return merged === undefined || merged === EMPTY_LIST ? EMPTY_LIST : listOf(merged);
  };

  return { root, find, add, compoundOf, listOf, listOfEach };
}

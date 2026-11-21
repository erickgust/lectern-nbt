import type { Path } from "../result.js";
import {
  MAX_DEPTH,
  ReadFailure,
  arrayLength,
  entryTag,
  fail,
  listHeader,
  rootTag,
  stringAt,
  textAt,
  type ReadKind,
} from "./reader.js";

const FIXED_SIZE: readonly number[] = [0, 1, 2, 4, 8, 4, 8];
const ARRAY_SIZE: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 8];

export interface Located {
  readonly kind: ReadKind;
  readonly offset: number;
  readonly path: Path;
}

export function locate(bytes: Uint8Array, little: boolean): Located | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const path: (string | number)[] = [];
  let pos = 0;
  let depth = 0;

  function string(): string {
    const end = stringAt(bytes, view, pos, little);
    const text = textAt(bytes, pos, end);
    pos = end;
    return text;
  }

  function list(): void {
    const length = listHeader(bytes, view, pos, little);
    const type = bytes[pos]!;
    pos += 5;
    for (let i = 0; i < length; i++) {
      path.push(i);
      skip(type);
      path.pop();
    }
  }

  function compound(): void {
    const keys = new Set<string>();
    for (let type = entryTag(bytes, pos); type !== 0; type = entryTag(bytes, pos)) {
      const start = pos++;
      const key = string();
      path.push(key);
      skip(type);
      if (keys.has(key)) fail("DuplicateKey", start);
      keys.add(key);
      path.pop();
    }
    pos++;
  }

  function skip(type: number): void {
    if (type < 7) {
      if (pos + FIXED_SIZE[type]! > bytes.length) fail("UnexpectedEnd", pos);
      pos += FIXED_SIZE[type]!;
    } else if (type === 8) {
      string();
    } else if (type === 9 || type === 10) {
      if (++depth > MAX_DEPTH) fail("TooDeep", pos);
      if (type === 9) list();
      else compound();
      depth--;
    } else {
      const size = ARRAY_SIZE[type]!;
      pos += 4 + arrayLength(view, pos, size, little) * size;
    }
  }

  try {
    const type = rootTag(bytes);
    pos = 1;
    string();
    skip(type);
    if (pos !== bytes.length) fail("TrailingBytes", pos);
    return undefined;
  } catch (error) {
    const failure = error instanceof RangeError ? new ReadFailure("UnexpectedEnd", pos) : error;
    if (!(failure instanceof ReadFailure)) throw failure;
    return { kind: failure.kind, offset: failure.offset, path };
  }
}

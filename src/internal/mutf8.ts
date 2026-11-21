const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const CHUNK = 4096;

function continuation(bytes: Uint8Array, i: number): number {
  const b = bytes[i]!;
  return (b & 0xc0) === 0x80 ? b & 0x3f : -1;
}

function codeUnits(bytes: Uint8Array, start: number, end: number): number[] | undefined {
  const units = new Array<number>(end - start);
  let length = 0;
  let i = start;
  while (i < end) {
    const a = bytes[i]!;
    if (a < 0x80) {
      units[length++] = a;
      i += 1;
    } else if ((a & 0xe0) === 0xc0) {
      if (i + 2 > end) return undefined;
      const b = continuation(bytes, i + 1);
      if (b < 0) return undefined;
      units[length++] = ((a & 0x1f) << 6) | b;
      i += 2;
    } else if ((a & 0xf0) === 0xe0) {
      if (i + 3 > end) return undefined;
      const b = continuation(bytes, i + 1);
      const c = continuation(bytes, i + 2);
      if (b < 0 || c < 0) return undefined;
      units[length++] = ((a & 0x0f) << 12) | (b << 6) | c;
      i += 3;
    } else if ((a & 0xf8) === 0xf0) {
      if (i + 4 > end) return undefined;
      const b = continuation(bytes, i + 1);
      const c = continuation(bytes, i + 2);
      const d = continuation(bytes, i + 3);
      if (b < 0 || c < 0 || d < 0) return undefined;
      const point = (((a & 0x07) << 18) | (b << 12) | (c << 6) | d) - 0x10000;
      if (point < 0 || point > 0xfffff) return undefined;
      units[length++] = 0xd800 | (point >> 10);
      units[length++] = 0xdc00 | (point & 0x3ff);
      i += 4;
    } else {
      return undefined;
    }
  }
  units.length = length;
  return units;
}

export function decodeMutf8(bytes: Uint8Array, start: number, end: number): string | undefined {
  const units = codeUnits(bytes, start, end);
  if (units === undefined) return undefined;
  if (units.length <= CHUNK) return String.fromCharCode.apply(null, units);
  const parts: string[] = [];
  for (let i = 0; i < units.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, units.slice(i, i + CHUNK)));
  }
  return parts.join("");
}

function ascii(bytes: Uint8Array, start: number, end: number): string | undefined {
  const codes = new Array<number>(end - start);
  for (let i = start; i < end; i++) {
    const b = bytes[i]!;
    if (b >= 0x80) return undefined;
    codes[i - start] = b;
  }
  return String.fromCharCode.apply(null, codes);
}

export function decodeString(bytes: Uint8Array, start: number, end: number): string | undefined {
  if (end - start < 32) {
    const text = ascii(bytes, start, end);
    if (text !== undefined) return text;
  }
  for (let i = start; i < end; i++) {
    const b = bytes[i]!;
    if (b === 0xc0 || b === 0xed) return decodeMutf8(bytes, start, end);
  }
  try {
    return utf8.decode(bytes.subarray(start, end));
  } catch {
    return undefined;
  }
}

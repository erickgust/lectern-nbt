import type { Compression, Endian } from "./codec.js";
import { isValidString } from "./internal/mutf8.js";
import type { DetectError, Result } from "./result.js";

export interface Format {
  readonly compression: Compression;
  readonly endian: Endian;
}

function u16(bytes: Uint8Array, at: number, little: boolean): number {
  const a = bytes[at] ?? 0;
  const b = bytes[at + 1] ?? 0;
  return little ? a | (b << 8) : (a << 8) | b;
}

function plausibleString(bytes: Uint8Array, at: number, little: boolean): number | undefined {
  if (at + 2 > bytes.length) return undefined;
  const end = at + 2 + u16(bytes, at, little);
  return end <= bytes.length && isValidString(bytes, at + 2, end) ? end : undefined;
}

function plausible(bytes: Uint8Array, little: boolean): boolean {
  const type = bytes[0] ?? 0;
  if (type < 1 || type > 12) return false;
  const end = plausibleString(bytes, 1, little);
  if (end === undefined) return false;
  if (type !== 10) return true;
  const first = bytes[end];
  if (first === undefined || first > 12) return false;
  if (first === 0) return end + 1 === bytes.length;
  return plausibleString(bytes, end + 1, little) !== undefined;
}

export function endianOf(bytes: Uint8Array): Endian | undefined {
  if (plausible(bytes, false)) return "big";
  return plausible(bytes, true) ? "little" : undefined;
}

export function detect(bytes: Uint8Array): Result<Format, DetectError> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { ok: true, value: { compression: "gzip", endian: "big" } };
  }
  const flags = bytes[1];
  if (bytes[0] === 0x78 && flags !== undefined && (0x7800 + flags) % 31 === 0) {
    return { ok: true, value: { compression: "zlib", endian: "big" } };
  }
  const endian = endianOf(bytes);
  if (endian === undefined) return { ok: false, error: { kind: "UnknownFormat", path: [] } };
  return { ok: true, value: { compression: "none", endian } };
}

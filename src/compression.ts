import type { Compression } from "./codec.js";
import type { CompressionError, DecompressError, Result } from "./result.js";

export interface DecompressOptions {
  readonly maxSize?: number;
}

const MAX_SIZE = 256 * 1024 * 1024;

const FORMATS: Readonly<Record<Compression, "gzip" | "deflate" | undefined>> = {
  gzip: "gzip",
  zlib: "deflate",
  none: undefined,
};

const failed: Result<never, CompressionError> = {
  ok: false,
  error: { kind: "CompressionFailed", path: [] },
};

const tooLarge: Result<never, DecompressError> = {
  ok: false,
  error: { kind: "TooLarge", path: [] },
};

async function pipe(
  bytes: Uint8Array,
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  maxSize: number,
): Promise<Uint8Array | undefined> {
  const writer = stream.writable.getWriter();
  const written = Promise.all([writer.write(new Uint8Array(bytes)), writer.close()]);
  written.catch(() => false);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream.readable) {
    size += chunk.byteLength;
    if (size > maxSize) return undefined;
    chunks.push(chunk);
  }
  await written;
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function decompress(
  bytes: Uint8Array,
  compression: Compression,
  options: DecompressOptions = {},
): Promise<Result<Uint8Array, DecompressError>> {
  if (compression === "none") return { ok: true, value: bytes };
  try {
    const format = FORMATS[compression];
    if (format === undefined) return failed;
    const value = await pipe(bytes, new DecompressionStream(format), options.maxSize ?? MAX_SIZE);
    return value === undefined ? tooLarge : { ok: true, value };
  } catch {
    return failed;
  }
}

export async function compress(
  bytes: Uint8Array,
  compression: Compression,
): Promise<Result<Uint8Array, CompressionError>> {
  if (compression === "none") return { ok: true, value: bytes };
  try {
    const format = FORMATS[compression];
    if (format === undefined) return failed;
    const value = await pipe(bytes, new CompressionStream(format), Number.POSITIVE_INFINITY);
    return value === undefined ? failed : { ok: true, value };
  } catch {
    return failed;
  }
}

import type { Compression } from "./codec.js";
import type { CompressionError, Result } from "./result.js";

const FORMATS: Readonly<Record<Compression, "gzip" | "deflate" | undefined>> = {
  gzip: "gzip",
  zlib: "deflate",
  none: undefined,
};

const failed: Result<never, CompressionError> = {
  ok: false,
  error: { kind: "CompressionFailed", path: [] },
};

async function pipe(
  bytes: Uint8Array,
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const written = Promise.all([writer.write(new Uint8Array(bytes)), writer.close()]);
  const [, buffer] = await Promise.all([written, new Response(stream.readable).arrayBuffer()]);
  return new Uint8Array(buffer);
}

async function transform(
  bytes: Uint8Array,
  compression: Compression,
  create: (
    format: "gzip" | "deflate",
  ) => TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
): Promise<Result<Uint8Array, CompressionError>> {
  if (compression === "none") return { ok: true, value: bytes };
  try {
    const format = FORMATS[compression];
    if (format === undefined) return failed;
    return { ok: true, value: await pipe(bytes, create(format)) };
  } catch {
    return failed;
  }
}

export function decompress(
  bytes: Uint8Array,
  compression: Compression,
): Promise<Result<Uint8Array, CompressionError>> {
  return transform(bytes, compression, (format) => new DecompressionStream(format));
}

export function compress(
  bytes: Uint8Array,
  compression: Compression,
): Promise<Result<Uint8Array, CompressionError>> {
  return transform(bytes, compression, (format) => new CompressionStream(format));
}

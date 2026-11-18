import { expect, test } from "vitest";

test("platform APIs round-trip", async () => {
  const bytes = new TextEncoder().encode("lectern");
  const packed = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  const unpacked = await new Response(
    new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  expect(new TextDecoder().decode(unpacked)).toBe("lectern");
  expect(new BigInt64Array([-1n])[0]).toBe(-1n);
});

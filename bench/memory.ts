import { readFileSync } from "node:fs";
import { read } from "nbtify";
import { parseUncompressed } from "prismarine-nbt";
import { decode } from "../src/index.js";

declare global {
  var kept: unknown;
}

type Parse = (bytes: Buffer) => unknown;

const parsers: Record<string, Parse> = {
  "lectern-nbt": (bytes) => decode(bytes),
  nbtify: (bytes) => read(bytes, { rootName: true, endian: "big", compression: null }),
  "prismarine-nbt": (bytes) => parseUncompressed(bytes, "big"),
};

globalThis.kept = null;

async function keep(parse: Parse, bytes: Buffer): Promise<void> {
  globalThis.kept = await parse(bytes);
}

function settle(): void {
  globalThis.gc?.();
  globalThis.gc?.();
  globalThis.gc?.();
}

function used(): number {
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  return heapUsed + arrayBuffers;
}

async function retained(parse: Parse, bytes: Buffer): Promise<number> {
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    globalThis.kept = null;
    settle();
    const before = used();
    await keep(parse, bytes);
    settle();
    runs.push(used() - before);
  }
  return runs.toSorted((a, b) => a - b)[2] ?? 0;
}

const fixtures = ["entities", "chunks", "strings"].map(
  (name) => [name, readFileSync(new URL(`fixtures/${name}.nbt`, import.meta.url))] as const,
);

for (const [, bytes] of fixtures) {
  for (const parse of Object.values(parsers)) await keep(parse, bytes);
}

for (const [name, bytes] of fixtures) {
  for (const [parser, parse] of Object.entries(parsers)) {
    const delta = await retained(parse, bytes);
    const kb = (delta / 1024).toFixed(0).padStart(5);
    console.log(
      `${name.padEnd(9)} ${parser.padEnd(15)} ${kb} KB  ${(delta / bytes.length).toFixed(1)}×`,
    );
  }
}

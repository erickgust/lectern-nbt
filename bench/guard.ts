import { readFileSync } from "node:fs";
import { read, write } from "nbtify";
import { decode, encode } from "../src/index.js";

const MINIMUM_SPEEDUP: Readonly<Record<string, number>> = {
  "decode entities": 1.2,
  "decode chunks": 10,
  "decode strings": 0.7,
  "encode entities": 2,
  "encode chunks": 2,
  "encode strings": 1.5,
};
async function batch(run: () => unknown, count: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < count; i++) await run();
  return (performance.now() - start) / count;
}

async function median(run: () => unknown): Promise<number> {
  const count = Math.max(1, Math.ceil(5 / (await batch(run, 20))));
  const times: number[] = [];
  for (let i = 0; i < 31; i++) times.push(await batch(run, count));
  return times.toSorted((a, b) => a - b)[15] ?? Number.NaN;
}

const options = { rootName: true, endian: "big", compression: null } as const;
const failures: string[] = [];
for (const name of ["entities", "chunks", "strings"]) {
  const bytes = readFileSync(new URL(`fixtures/${name}.nbt`, import.meta.url));
  const ours = decode(bytes);
  if (!ours.ok) throw new Error(ours.error.kind);
  const theirs = await read(bytes, options);
  const pairs: [string, () => unknown, () => unknown][] = [
    [`decode ${name}`, () => decode(bytes), () => read(bytes, options)],
    [`encode ${name}`, () => encode(ours.value), () => write(theirs)],
  ];
  for (const [label, lectern, nbtify] of pairs) {
    const speedup = (await median(nbtify)) / (await median(lectern));
    const minimum = MINIMUM_SPEEDUP[label] ?? Number.POSITIVE_INFINITY;
    console.log(`${label.padEnd(16)} ${speedup.toFixed(2)}× NBTify (minimum ${minimum}×)`);
    if (speedup < minimum) failures.push(label);
  }
}
if (failures.length > 0) throw new Error(`slower than allowed: ${failures.join(", ")}`);

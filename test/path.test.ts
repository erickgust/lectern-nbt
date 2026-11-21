import { fc, test } from "@fast-check/vitest";
import { Float32, Int16, Int8 } from "nbtify";
import { expect } from "vitest";
import { decode, strict } from "../src/index.js";
import { locate } from "../src/internal/path.js";
import { decoded, nbtify } from "./nbt.js";

const sample = await nbtify({
  Name: "Steve ✓",
  Pos: [1.5, 64, -2],
  Inventory: [
    { id: "minecraft:torch", Count: new Int8(64), tag: { Damage: new Int16(3) } },
    { id: "minecraft:stone", Count: new Int8(1), Slot: new Int8(2) },
  ],
  Rotation: [new Float32(90), new Float32(0)],
  UUID: new Int32Array([1, 2, 3, 4]),
  Seen: new BigInt64Array([5n]),
  Nested: [[new Int8(1)], [], [new Int8(2), new Int8(3)]],
});

const inferred = decoded(sample).codec;
const codecs = [undefined, inferred, ...(inferred.tag === 10 ? [strict(inferred)] : [])];

const mutation = fc.record({
  codec: fc.constantFrom(...codecs),
  writes: fc.array(fc.tuple(fc.nat({ max: sample.length - 1 }), fc.nat({ max: 255 })), {
    maxLength: 4,
  }),
  end: fc.nat({ max: sample.length }),
});

test.prop([mutation])("decode errors match the path walker", ({ codec, writes, end }) => {
  const bytes = sample.slice(0, end);
  for (const [at, value] of writes) bytes[at] = value;
  const result = codec === undefined ? decode(bytes) : decode(bytes, codec);
  const located = locate(bytes, false, codec);
  expect(result.ok ? undefined : result.error).toEqual(located);
});

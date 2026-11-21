import { writeFile } from "node:fs/promises";
import { Float32, Int16, Int32, Int8, write, type RootTag } from "nbtify";

const files: Record<string, RootTag> = {
  entities: {
    Entities: Array.from({ length: 2_000 }, (_, i) => ({
      id: i % 3 === 0 ? "minecraft:item_frame" : "minecraft:zombie",
      CustomName: `Entity #${i} – ñandú`,
      Pos: [i * 0.5, 64, -i * 0.25],
      Motion: [0, -0.0784, 0],
      Rotation: [new Float32(i % 360), new Float32(0)],
      Health: new Float32(20),
      OnGround: new Int8(1),
      Air: new Int16(300),
      UUID: new Int32Array([i, -i, i * 7, 42]),
      Tags: ["spawned", "tracked"],
      LastSeen: BigInt(i) * 1_000_003n,
    })),
  },
  chunks: {
    DataVersion: new Int32(4189),
    sections: Array.from({ length: 8 }, (_, i) => ({
      Y: new Int8(i),
      block_states: {
        data: BigInt64Array.from(
          { length: 4096 },
          (_value, j) => BigInt(j * i) * 0x9e_37_79_b9_7f_4a_7c_15n,
        ),
      },
      biomes: new Int32Array(1024).map((_value, j) => j ^ i),
      SkyLight: new Int8Array(2048).map((_value, j) => j),
    })),
  },
  strings: Object.fromEntries(
    Array.from({ length: 5_000 }, (_, i) => [
      `key_${i}`,
      i % 4 === 0 ? `ünïcødé ✓ ${i} 😀` : `value number ${i}`,
    ]),
  ),
};

await Promise.all(
  Object.entries(files).map(async ([name, root]) => {
    const bytes = await write(root, { rootName: "", endian: "big", compression: null });
    await writeFile(new URL(`fixtures/${name}.nbt`, import.meta.url), bytes);
  }),
);

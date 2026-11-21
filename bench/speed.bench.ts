import { readFileSync } from "node:fs";
import { bench, do_not_optimize, group, run, summary } from "mitata";
import { read, write } from "nbtify";
import { parseUncompressed, writeUncompressed } from "prismarine-nbt";
import { check, decode, encode } from "../src/index.js";

const fixture = (name: string): Buffer =>
  readFileSync(new URL(`fixtures/${name}.nbt`, import.meta.url));

for (const name of ["entities", "chunks", "strings"]) {
  const bytes = fixture(name);
  const inferred = decode(bytes);
  if (!inferred.ok) throw new Error(inferred.error.kind);
  const { codec } = inferred.value;
  summary(() => {
    group(`${name} ${(bytes.length / 1024).toFixed(0)} KB`, () => {
      bench("lectern-nbt", () => {
        do_not_optimize(decode(bytes));
      });
      bench("lectern-nbt with its codec", () => {
        do_not_optimize(decode(bytes, codec));
      });
      bench("nbtify", async () => {
        do_not_optimize(await read(bytes, { rootName: true, endian: "big", compression: null }));
      });
      bench("prismarine-nbt", () => {
        do_not_optimize(parseUncompressed(bytes, "big"));
      });
    });
  });
}

for (const name of ["entities", "chunks", "strings"]) {
  const bytes = fixture(name);
  const ours = decode(bytes);
  if (!ours.ok) throw new Error(ours.error.kind);
  const doc = ours.value;
  const theirs = await read(bytes, { rootName: true, endian: "big", compression: null });
  const prismarine = parseUncompressed(bytes, "big");
  summary(() => {
    group(`encode ${name}`, () => {
      bench("lectern-nbt", () => {
        do_not_optimize(encode(doc));
      });
      bench("nbtify", async () => {
        do_not_optimize(await write(theirs));
      });
      bench("prismarine-nbt", () => {
        do_not_optimize(writeUncompressed(prismarine, "big"));
      });
    });
  });
}

for (const name of ["entities", "chunks", "strings"]) {
  const bytes = fixture(name);
  const inferred = decode(bytes);
  if (!inferred.ok) throw new Error(inferred.error.kind);
  const { codec } = inferred.value;
  summary(() => {
    group(`check ${name}`, () => {
      bench("check", () => {
        do_not_optimize(check(bytes));
      });
      bench("check with its codec", () => {
        do_not_optimize(check(bytes, codec));
      });
      bench("decode", () => {
        do_not_optimize(decode(bytes));
      });
    });
  });
}

const entities = fixture("entities");
const truncated = entities.subarray(0, Math.floor(entities.length * 0.9));
summary(() => {
  group("entities, failure path", () => {
    bench("decode", () => {
      do_not_optimize(decode(entities));
    });
    bench("decode truncated at 90%", () => {
      do_not_optimize(decode(truncated));
    });
  });
});

await run();

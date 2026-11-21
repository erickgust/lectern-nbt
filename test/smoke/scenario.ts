import {
  byte,
  check,
  compound,
  compress,
  decode,
  decompress,
  detect,
  encode,
  float,
  list,
  long,
  longArray,
  read,
  string,
  write,
} from "../../src/index.js";

const Player = compound({
  Name: string,
  Health: float,
  Tags: list(string),
  Seen: long,
  Data: longArray,
  Flag: byte,
});

const root = {
  Name: "Steve ✓ 😀\0",
  Health: float(20),
  Tags: ["a", "b"],
  Seen: long(-(2n ** 63n)),
  Data: longArray(1n, -2n),
  Flag: byte(1),
};

export async function scenario(): Promise<string[]> {
  const failures: string[] = [];
  const expect = (label: string, condition: boolean): void => {
    if (!condition) failures.push(label);
  };
  for (const endian of ["big", "little"] as const) {
    const bytes = encode({ name: "", root, codec: Player, endian });
    if (!bytes.ok) {
      failures.push(`encode ${endian}: ${bytes.error.kind}`);
      continue;
    }
    expect(`check ${endian}`, check(bytes.value, Player, { endian }).ok);
    const format = detect(bytes.value);
    expect(`detect ${endian}`, format.ok && format.value.endian === endian);
    const doc = decode(bytes.value, Player, { endian });
    expect(`decode ${endian}`, doc.ok && doc.value.root.Name === root.Name);
    expect(`longArray ${endian}`, doc.ok && doc.value.root.Data[1] === -2n);
  }
  const packed = await write({ name: "", root, codec: Player, endian: "big", compression: "gzip" });
  if (!packed.ok) return [...failures, `write: ${packed.error.kind}`];
  const file = await read(packed.value, Player);
  expect("read gzip", file.ok && file.value.compression === "gzip");
  expect("read value", file.ok && file.value.root.Seen === root.Seen);
  const bomb = await compress(new Uint8Array(1 << 20), "gzip");
  if (!bomb.ok) return [...failures, `compress: ${bomb.error.kind}`];
  const limited = await decompress(bomb.value, "gzip", { maxSize: 1000 });
  expect("decompress maxSize", !limited.ok && limited.error.kind === "TooLarge");
  return failures;
}

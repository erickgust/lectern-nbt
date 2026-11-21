import {
  byte,
  compound,
  decode,
  encode,
  extend,
  float,
  int,
  list,
  optional,
  print,
  string,
  type Infer,
} from "lectern-nbt";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });
const Player = compound({ Name: string, Health: float, XpLevel: int, Inventory: list(Item) });
type Player = Infer<typeof Player>;

const player: Player = {
  Name: "Steve",
  Health: float(20),
  XpLevel: int(3),
  Inventory: [{ id: "minecraft:torch", Count: byte(64) }],
};

const bytes = encode({ name: "", root: player, codec: Player, endian: "big" });
if (!bytes.ok) throw new Error(bytes.error.kind);
const doc = decode(bytes.value, Player);
if (!doc.ok) throw new Error(doc.error.kind);
const level: number = doc.value.root.XpLevel + 1;
const updated = {
  ...doc.value,
  root: { ...doc.value.root, XpLevel: int(level), Glowing: byte(1) },
  codec: extend(doc.value.codec, { Glowing: byte }),
};
const again = encode(updated);
if (!again.ok) throw new Error(again.error.kind);

// @ts-expect-error
const wrong: Player = { ...player, Health: 20 };
void wrong;

console.log(print(Player).split("\n")[0]);

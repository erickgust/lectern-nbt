# lectern-nbt

A TypeScript library for reading and writing Minecraft's NBT format. **Schemas are values; data is plain.**

- **Codecs are plain data.** A codec describes the tags of a file. It survives `structuredClone` and `JSON.stringify`, so it can cross a worker boundary with the data.
- **Data is plain JS.** Compounds are objects, lists are arrays, and arrays are typed arrays. Numbers are branded (`Byte`, `Int`, `Float`, …), so TypeScript catches a plain `20` where a `Float` belongs.
- **Errors are values.** Every operation that can fail on data returns a `Result` with a `kind` and a `path`, such as `{ kind: "UnexpectedEnd", offset: 14, path: ["Pos", 0] }`. Only the number constructors throw, and only on values your code chose.
- **No dependencies.** It runs on Node 22+, Bun, Deno and browsers, using `DataView`, `TextDecoder` and `DecompressionStream`.

This is not a drop-in replacement for NBTify.

## Install

```sh
npm install lectern-nbt
```

## Example

```ts
import {
  byte,
  compound,
  double,
  extend,
  float,
  int,
  list,
  long,
  optional,
  read,
  string,
  write,
  type Infer,
} from "lectern-nbt";

const Item = compound({ id: string, Count: byte, Slot: optional(byte) });
const Player = compound({
  Name: string,
  Health: float,
  XpLevel: int,
  Pos: list(double),
  Inventory: list(Item),
  LastPlayed: long,
});
type Player = Infer<typeof Player>;

const file = await read(bytes, Player);
if (!file.ok) throw new Error(file.error.kind);
const { root, codec } = file.value;

const updated = {
  ...root,
  Health: float(20),
  XpLevel: int(root.XpLevel + 1),
  Pos: double.of(0, 70, 0),
  Glowing: byte(1),
};

const saved = await write({
  ...file.value,
  root: updated,
  codec: extend(codec, { Glowing: byte }),
});
```

`read` detects gzip, zlib or no compression, and big- or little-endian byte order. `write` puts the file back the same way. Keys the codec doesn't mention (here, perhaps `UUID`) are kept in `root` and added to the returned `codec`, so writing back loses nothing. Without `extend`, `write` returns an `UnknownKey` error for `Glowing`, and `Health: 20` is a compile error.

Without a codec, `read` and `decode` infer one from the data. `print` turns it into source you can paste:

```ts
const doc = decode(bytes);
if (doc.ok) console.log(print(doc.value.codec));
```

## API

| Function                                                          | What it does                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `read(bytes, codec?, { compression?, endian? })`                  | Detect, decompress and decode a whole file. Async.                                |
| `write(file)`                                                     | Encode and compress a file with its own codec, byte order and compression. Async. |
| `decode(bytes, codec?, { endian? })`                              | Decode uncompressed bytes. Without a codec, infers one.                           |
| `encode(doc)`                                                     | Encode a document with `doc.codec` and `doc.endian`.                              |
| `check(bytes, codec?, { endian? })`                               | Check the structure without building values. Returns the same error as `decode`.  |
| `validate(value, codec)`                                          | Check a value you don't control against a codec, with `encode`'s rules.           |
| `detect(bytes)`                                                   | Find the compression and byte order from the first bytes.                         |
| `compress(bytes, compression)` / `decompress(bytes, compression)` | gzip, zlib or `"none"`. Async.                                                    |
| `print(codec)`                                                    | Print a codec as TypeScript source.                                               |

Codec builders: `compound`, `list`, `optional`, `strict` (extra keys become an error), `extend`, and the leaves `byte`, `short`, `int`, `long`, `float`, `double`, `string`, `byteArray`, `intArray` and `longArray`. Each number leaf is also a checked constructor: `int(5)`, `float(20)`, `long(5n)`, `double.of(0, 70, 0)`. `int(7.5)` is a compile error, and `byte(300)` throws a `RangeError`. The array leaves build typed arrays with every element checked: `intArray(1, 2, 3)` and `intArray.from(iterable)`.

### Errors

`decode`, `check`, `encode`, `validate`, `detect` and `print` never throw, and `read`, `write`, `compress` and `decompress` never reject. Each function's error type holds exactly the kinds it can return, so an exhaustive `switch` lists only cases that can happen:

| kind                                                                          | When                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `UnexpectedEnd`, `BadTag`, `NegativeLength`, `TrailingBytes`, `InvalidString` | The bytes aren't valid NBT.                                                           |
| `DuplicateKey`                                                                | A compound repeats a key.                                                             |
| `TagMismatch`                                                                 | The data disagrees with the codec. Includes `expected` and `found`.                   |
| `MissingKey`, `UnknownKey`                                                    | A required key is absent, or a key isn't in the codec (on encode, or under `strict`). |
| `TooDeep`                                                                     | Nesting goes past 512 levels.                                                         |
| `OutOfRange`, `StringTooLong`                                                 | A number or string can't be written.                                                  |
| `UnknownFormat`, `CompressionFailed`                                          | The file isn't recognised, or decompression failed.                                   |

### Limitations

- Writing directly into a decoded typed array wraps out-of-range values silently, because TypeScript has no read-only typed arrays.
- A float or double `NaN` may lose its payload bits in a round trip.
- Round trips are byte-exact when the compounds in a list share key order and empty lists are End-typed, which is how Minecraft writes files. The data is always equal, but a list element whose keys were in another order comes back in the merged codec's order.
- `print` can't keep the order of integer-like keys (`"0"`, `"12"`), because JavaScript orders them numerically in object literals.
- `decompress` and `read` don't limit the decompressed size.
- Bedrock `level.dat` files, which have an 8-byte header, and Bedrock network NBT, which uses varints, aren't supported yet.

## Benchmarks

Node 26, uncompressed synthetic fixtures (`bench/fixtures`), median time per call measured with mitata. Run them with `bun run bench` and `bun run bench:memory`.

| Decode           | lectern-nbt | with a codec | NBTify 2.2 | prismarine-nbt 2.8 |
| ---------------- | ----------- | ------------ | ---------- | ------------------ |
| entities, 527 KB | 3.6 ms      | 3.6 ms       | 5.8 ms     | 4.9 ms             |
| chunks, 305 KB   | 0.11 ms     | 0.10–0.20 ms | 1.6 ms     | 1.15 ms            |
| strings, 157 KB  | 1.3 ms      | 1.1 ms       | 1.1 ms     | 1.2 ms             |

On a real 9.7 MB server save (not in the repository), lectern-nbt decodes in 87 ms and NBTify in 98 ms.

| Encode   | lectern-nbt | NBTify 2.2 | prismarine-nbt 2.8 |
| -------- | ----------- | ---------- | ------------------ |
| entities | 1.3 ms      | 3.3 ms     | 3.6 ms             |
| chunks   | 0.14 ms     | 0.38 ms    | 0.48 ms            |
| strings  | 0.60 ms     | 1.3 ms     | 1.5 ms             |

| `check`  | no codec | with a codec |
| -------- | -------- | ------------ |
| entities | 0.63 ms  | 1.1 ms       |
| chunks   | 1.6 µs   | 2.6 µs       |
| strings  | 0.34 ms  | 0.41 ms      |

Retained memory after decoding, as a multiple of the file size, codec included:

|          | lectern-nbt | NBTify 2.2 | prismarine-nbt 2.8 |
| -------- | ----------- | ---------- | ------------------ |
| entities | 3.1×        | 6.2×       | 7.1×               |
| chunks   | 1.1×        | 1.1×       | 8.5×               |
| strings  | 4.2×        | 3.3×       | 4.6×               |

The strings fixture is one compound with 5,000 keys. lectern-nbt's extra memory there is the inferred codec, whose three arrays hold an entry per key. Decoding it with a codec avoids building one.

## Support

### v1

- [x] Java edition big-endian decode/encode
- [x] Little-endian (Bedrock) decode/encode
- [x] gzip / zlib via DecompressionStream / CompressionStream
- [x] detect (compression + endianness)
- [x] read / write (whole files, compression and endianness kept)
- [x] Structure-only fast path (check)
- [x] Codec builders, Infer, validate, extend, strict, optional
- [x] Number/array constructors with range checks
- [x] Codec inference
- [x] Paths on every error
- [x] print (codec → TypeScript source)

### v2

- [ ] pick: schema-guided read that skips unrequested fields (fast, lossy, not writable back)
- [ ] oneOf codec (fields whose tag changed across Minecraft versions)
- [ ] compile(codec): generated decoders, opt-in, only if benchmarks justify
- [ ] CLI: `lectern-nbt infer level.dat > level.ts`
- [ ] SNBT parse / stringify
- [ ] Varint (network) NBT
- [ ] Bedrock level.dat header
- [ ] Columnar (FlatNbt-style) reader, only if nbt-editor profiling shows flattening is the bottleneck
- [ ] Region files (.mca); quansync becomes a candidate here, and only here
- [ ] Opt-in brands for specific fields, if ever needed

### Not planned

- [ ] Node `Buffer` APIs
- [ ] CommonJS build
- [ ] Runtime FP library (Effect, fp-ts, neverthrow)

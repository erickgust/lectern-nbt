# lectern-nbt

A TypeScript library for reading and writing Minecraft's NBT format. **Schemas are values; data is plain.**

- **Codecs are plain data.** A codec describes the tags of a file. It survives `structuredClone` and `JSON.stringify`, so it can cross a worker boundary with the data.
- **Data is plain JS.** Compounds are objects, lists are arrays, and arrays are typed arrays. Numbers are branded (`Byte`, `Int`, `Float`, …), so TypeScript catches a plain `20` where a `Float` belongs.
- **Errors are values.** Every operation that can fail on data returns a `Result` with a `kind` and a `path`, such as `{ kind: "UnexpectedEnd", offset: 14, path: ["Pos", 0] }`. Only the number constructors throw, and only on values your code chose.
- **No dependencies.** It runs on Node 22+, Bun, Deno and browsers, using `DataView`, `TextDecoder` and `DecompressionStream`.

This is not a drop-in replacement for NBTify or prismarine-nbt. See [Compared with other libraries](#compared-with-other-libraries).

## Install

```sh
npm install lectern-nbt
```

ESM only. TypeScript types are included.

## Usage

### Read a file

`read` takes the raw bytes of a file. It detects gzip, zlib or no compression, big- or little-endian byte order, and the 8-byte header of a Bedrock `level.dat`.

```ts
import { readFile } from "node:fs/promises";
import { read } from "lectern-nbt";

const file = await read(await readFile("level.dat"));
if (!file.ok) throw new Error(`${file.error.kind} at ${file.error.path.join(".")}`);

const { name, root, codec, endian, compression } = file.value;
```

In a browser, the bytes come from `fetch` or a `File`:

```ts
const bytes = new Uint8Array(await (await fetch("level.dat")).arrayBuffer());
const file = await read(bytes);
```

`root` holds the data, `name` the root tag's name, and `codec` the shape of the data. `endian` and `compression` record how the file was stored, so `write` can put it back the same way.

### Describe the shape with a codec

Without a codec, `root` is a loose `NbtValue`. With one, `read` checks the data against it and `root` is fully typed:

```ts
import {
  byte,
  compound,
  double,
  float,
  int,
  list,
  long,
  optional,
  read,
  string,
} from "lectern-nbt";
import type { Infer } from "lectern-nbt";

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
if (file.ok) console.log(file.value.root.Inventory[0]?.id);
```

Builders: `compound`, `list`, `optional`, `strict` (extra keys become an error), `extend`, and the leaves `byte`, `short`, `int`, `long`, `float`, `double`, `string`, `byteArray`, `intArray` and `longArray`. Keys the codec doesn't mention are kept in `root` and added to the returned `codec`, so writing back loses nothing. Wrap a compound in `strict` to reject them instead.

`long` values are `bigint`. Byte, int and long arrays are `Int8Array`, `Int32Array` and `BigInt64Array`.

### Generate a codec from a file

Writing a codec by hand for a large file is tedious. Decode a sample without one and print the codec that was inferred:

```ts
import { decode, print } from "lectern-nbt";

const doc = decode(bytes);
if (doc.ok) console.log(print(doc.value.codec));
```

`print` returns TypeScript source you can paste into your project and edit, for example to mark keys `optional`.

### Edit and write back

Number leaves double as checked constructors: `int(5)`, `float(20)`, `long(5n)`, `double.of(0, 70, 0)`. `int(7.5)` is a compile error and `byte(300)` throws a `RangeError`. The array leaves build typed arrays with every element checked: `intArray(1, 2, 3)` and `intArray.from(iterable)`.

```ts
import { byte, double, extend, float, int, write } from "lectern-nbt";

const file = await read(bytes, Player);
if (!file.ok) throw new Error(file.error.kind);
const { root, codec } = file.value;

const saved = await write({
  ...file.value,
  root: {
    ...root,
    Health: float(20),
    XpLevel: int(root.XpLevel + 1),
    Pos: double.of(0, 70, 0),
    Glowing: byte(1),
  },
  codec: extend(codec, { Glowing: byte }),
});
if (saved.ok) await writeFile("level.dat", saved.value);
```

`write` encodes with the file's own codec, byte order and compression, and puts back the Bedrock header if the file had one. A new key needs `extend`: without it, `write` returns an `UnknownKey` error for `Glowing`. `Health: 20` is a compile error, because a plain number isn't a `Float`.

### Handle errors

Each function's error type holds exactly the kinds it can return, so an exhaustive `switch` lists only cases that can happen. Every error has a `path` to the tag that failed:

```ts
const file = await read(bytes, Player);
if (!file.ok) {
  const { error } = file;
  const at = error.path.join(".");
  switch (error.kind) {
    case "TagMismatch":
      console.error(`${at}: expected ${error.expected}, found ${error.found}`);
      break;
    case "MissingKey":
      console.error(`${at} is missing`);
      break;
    default:
      console.error(`${error.kind} at ${at}`);
  }
}
```

### Validate values from elsewhere

Data that arrives from a worker, a form or a plugin is `unknown`. `validate` checks it against a codec with the same rules `encode` uses, and narrows the type:

```ts
import { validate } from "lectern-nbt";

const player = validate(event.data, Player);
if (player.ok) console.log(player.value.Name);
```

### Check bytes without decoding

`check` walks the bytes and reports the same error `decode` would, without building any values. It is 4× to 60× faster than `decode`, depending on the file:

```ts
import { check, decompress } from "lectern-nbt";

const raw = await decompress(bytes, "gzip");
if (raw.ok && check(raw.value, Player).ok) console.log("valid player file");
```

### Lower-level functions

`read` and `write` cover whole files. The pieces are exported too:

```ts
import { compress, decode, decompress, detect, encode } from "lectern-nbt";

const format = detect(bytes);
const raw = await decompress(bytes, "gzip", { maxSize: 64 * 1024 * 1024 });
const doc = decode(raw.ok ? raw.value : bytes, Player, { endian: "little" });
const out = doc.ok ? encode({ ...doc.value, endian: "big" }) : undefined;
```

`decode` and `encode` work on uncompressed NBT. Changing `endian` on a document converts it between Java (big-endian) and Bedrock (little-endian) byte order.

## API

| Function                                                                        | What it does                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `read(bytes, codec?, { compression?, endian?, maxSize? })`                      | Detect, decompress and decode a whole file. Async.                                |
| `write(file)`                                                                   | Encode and compress a file with its own codec, byte order and compression. Async. |
| `decode(bytes, codec?, { endian? })`                                            | Decode uncompressed bytes. Without a codec, infers one.                           |
| `encode(doc)`                                                                   | Encode a document with `doc.codec` and `doc.endian`.                              |
| `check(bytes, codec?, { endian? })`                                             | Check the structure without building values. Returns the same error as `decode`.  |
| `validate(value, codec)`                                                        | Check a value you don't control against a codec, with `encode`'s rules.           |
| `detect(bytes)`                                                                 | Find the compression and byte order from the first bytes.                         |
| `compress(bytes, compression)` / `decompress(bytes, compression, { maxSize? })` | gzip, zlib or `"none"`. Async.                                                    |
| `print(codec)`                                                                  | Print a codec as TypeScript source.                                               |

### Errors

`decode`, `check`, `encode`, `validate`, `detect` and `print` never throw, and `read`, `write`, `compress` and `decompress` never reject.

| kind                                                                          | When                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `UnexpectedEnd`, `BadTag`, `NegativeLength`, `TrailingBytes`, `InvalidString` | The bytes aren't valid NBT.                                                                                    |
| `DuplicateKey`                                                                | A compound repeats a key.                                                                                      |
| `TagMismatch`                                                                 | The data disagrees with the codec. Includes `expected` and `found`.                                            |
| `MissingKey`, `UnknownKey`                                                    | A required key is absent, or a key isn't in the codec (on encode, or under `strict`).                          |
| `TooDeep`                                                                     | Nesting goes past 512 levels.                                                                                  |
| `OutOfRange`, `StringTooLong`                                                 | A number or string can't be written.                                                                           |
| `UnknownFormat`, `CompressionFailed`                                          | The file isn't recognised, or decompression failed.                                                            |
| `TooLarge`                                                                    | Decompressing would produce more than `maxSize` bytes: 256 MiB unless set, and `Infinity` turns the limit off. |

### Limitations

- Writing directly into a decoded typed array wraps out-of-range values silently, because TypeScript has no read-only typed arrays.
- A float or double `NaN` may lose its payload bits in a round trip.
- Round trips are byte-exact when the compounds in a list share key order and empty lists are End-typed, which is how Minecraft writes files. The data is always equal, but a list element whose keys were in another order comes back in the merged codec's order.
- `print` can't keep the order of integer-like keys (`"0"`, `"12"`), because JavaScript orders them numerically in object literals.

## Benchmarks

Node 26.13, uncompressed synthetic fixtures from `bench/fixtures`, average time per call measured with mitata. NBTify 2.2.0 and prismarine-nbt 2.8.0 decode the same bytes. Run them with `bun run bench` and `bun run bench:memory`.

### Decode

| File             | lectern-nbt | with a codec | NBTify  | prismarine-nbt |
| ---------------- | ----------- | ------------ | ------- | -------------- |
| entities, 527 KB | 3.5 ms      | 3.6 ms       | 6.1 ms  | 4.8 ms         |
| chunks, 305 KB   | 0.10 ms     | 0.10–0.20 ms | 1.6 ms  | 1.1 ms         |
| strings, 157 KB  | 1.1 ms      | 1.0 ms       | 0.99 ms | 1.2 ms         |

lectern-nbt decodes the entities file 1.8× faster than NBTify and 1.4× faster than prismarine-nbt. The chunks file is mostly long arrays, which lectern-nbt reads as typed arrays straight from the bytes: 17× faster than NBTify. The strings file, one compound with 5,000 keys, is a tie.

### Encode

| File     | lectern-nbt | NBTify  | prismarine-nbt |
| -------- | ----------- | ------- | -------------- |
| entities | 1.2 ms      | 3.3 ms  | 3.6 ms         |
| chunks   | 0.13 ms     | 0.38 ms | 0.48 ms        |
| strings  | 0.57 ms     | 1.3 ms  | 1.4 ms         |

lectern-nbt encodes 2.3× to 3.7× faster than either.

### Check

| File     | `check` | `check` with a codec | `decode` |
| -------- | ------- | -------------------- | -------- |
| entities | 0.62 ms | 0.99 ms              | 3.5 ms   |
| chunks   | 1.6 µs  | 2.5 µs               | 0.10 ms  |
| strings  | 0.35 ms | 0.46 ms              | 1.1 ms   |

### Memory

Heap and array buffer memory retained by the decoded result, as a multiple of the file size, codec included:

| File     | lectern-nbt    | NBTify         | prismarine-nbt |
| -------- | -------------- | -------------- | -------------- |
| entities | 1.6 MB (3.1×)  | 3.2 MB (6.1×)  | 3.7 MB (7.1×)  |
| chunks   | 0.32 MB (1.1×) | 0.33 MB (1.1×) | 2.5 MB (8.5×)  |
| strings  | 0.63 MB (4.1×) | 0.50 MB (3.3×) | 0.70 MB (4.6×) |

lectern-nbt keeps half the memory of the others on the entities file. On the strings file it keeps more than NBTify, because the inferred codec holds an entry per key. Decoding with a codec avoids building one.

## Compared with other libraries

lectern-nbt is built around codecs, typed results and plain values. NBTify and prismarine-nbt cover more of the wire formats Minecraft uses.

| Feature                                       | lectern-nbt | NBTify 2.2 | prismarine-nbt 2.8 |
| --------------------------------------------- | ----------- | ---------- | ------------------ |
| Java big-endian and Bedrock little-endian NBT | ✓           | ✓          | ✓                  |
| Detect compression and byte order             | ✓           | ✓          | ✓                  |
| gzip and zlib                                 | ✓           | ✓          | ✓                  |
| Raw deflate                                   | ✗           | ✓          | ✗                  |
| Bedrock `level.dat` header                    | ✓           | ✓          | read only          |
| Bedrock network NBT (varints)                 | ✗           | ✓          | ✓                  |
| Nameless root (Java network NBT, 1.20.2+)     | ✗           | ✓          | ✓                  |
| SNBT parse and stringify                      | ✗           | ✓          | ✗                  |
| Ignore trailing bytes after the root          | ✗           | ✓          | ✓                  |
| ProtoDef types for packet parsers             | ✗           | ✗          | ✓                  |
| Deep equality helper                          | ✗           | ✗          | ✓                  |
| Browsers without a bundler setup              | ✓           | ✓          | ✗                  |
| CommonJS                                      | ✗           | ✗          | ✓                  |
| Typed schemas (codecs)                        | ✓           | ✗          | ✗                  |
| Errors as values, with a path                 | ✓           | ✗          | ✗                  |
| Structure check without decoding              | ✓           | ✗          | ✗                  |
| Validate values before writing                | ✓           | ✗          | ✗                  |
| Generate TypeScript from a file               | ✓           | ✗          | ✗                  |
| Limit on decompressed size                    | ✓           | ✗          | ✗                  |

Pick NBTify if you need SNBT, raw deflate or network NBT today. Pick prismarine-nbt for packet parsing in a ProtoDef-based protocol stack.

## Roadmap

### Done

- [x] Java edition big-endian decode/encode
- [x] Little-endian (Bedrock) decode/encode
- [x] gzip / zlib via DecompressionStream / CompressionStream
- [x] detect (compression + endianness)
- [x] read / write (whole files, compression and endianness kept)
- [x] Bedrock level.dat header
- [x] Structure-only fast path (check)
- [x] Codec builders, Infer, validate, extend, strict, optional
- [x] Number/array constructors with range checks
- [x] Codec inference
- [x] Paths on every error
- [x] print (codec → TypeScript source)

### Next

- [ ] SNBT parse / stringify
- [ ] Varint (network) NBT
- [ ] Nameless root (Java network NBT, 1.20.2+)
- [ ] LevelDB values: several roots back to back (Bedrock chunk data)
- [ ] Region files (.mca); quansync becomes a candidate here, and only here
- [ ] pick: schema-guided read that skips unrequested fields (fast, lossy, not writable back)
- [ ] oneOf codec (fields whose tag changed across Minecraft versions)
- [ ] compile(codec): generated decoders, opt-in, only if benchmarks justify
- [ ] CLI: `lectern-nbt infer level.dat > level.ts`
- [ ] Columnar (FlatNbt-style) reader, only if nbt-editor profiling shows flattening is the bottleneck
- [ ] Opt-in brands for specific fields, if ever needed

### Not planned

- Node `Buffer` APIs
- CommonJS build
- Runtime FP library (Effect, fp-ts, neverthrow)

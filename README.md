# lectern-nbt

A TypeScript library for reading and writing Minecraft's NBT format. **Schemas are values; data is plain.**

This is not a drop-in replacement for NBTify.

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

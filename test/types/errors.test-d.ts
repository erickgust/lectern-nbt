import { expectTypeOf, test } from "vitest";
import type {
  CompressionError,
  DecodeError,
  DecompressError,
  DetectError,
  EncodeError,
  NbtError,
  ReadError,
  ValidateError,
  WriteError,
} from "../../src/index.js";

type Data = "TagMismatch" | "MissingKey" | "UnknownKey" | "TooDeep";
type Decode =
  | Data
  | "UnexpectedEnd"
  | "BadTag"
  | "NegativeLength"
  | "TrailingBytes"
  | "InvalidString"
  | "DuplicateKey";
type Encode = Data | "OutOfRange" | "StringTooLong";

test("each error alias holds exactly its kinds", () => {
  expectTypeOf<DecodeError["kind"]>().toEqualTypeOf<Decode>();
  expectTypeOf<ReadError["kind"]>().toEqualTypeOf<
    Decode | "UnknownFormat" | "CompressionFailed" | "TooLarge"
  >();
  expectTypeOf<EncodeError["kind"]>().toEqualTypeOf<Encode>();
  expectTypeOf<WriteError["kind"]>().toEqualTypeOf<Encode | "CompressionFailed">();
  expectTypeOf<ValidateError["kind"]>().toEqualTypeOf<Encode>();
  expectTypeOf<DetectError["kind"]>().toEqualTypeOf<"UnknownFormat">();
  expectTypeOf<CompressionError["kind"]>().toEqualTypeOf<"CompressionFailed">();
  expectTypeOf<DecompressError["kind"]>().toEqualTypeOf<"CompressionFailed" | "TooLarge">();
  expectTypeOf<NbtError["kind"]>().toEqualTypeOf<
    Decode | Encode | "UnknownFormat" | "CompressionFailed" | "TooLarge"
  >();
});

test("every error has a path", () => {
  expectTypeOf<NbtError["path"]>().toEqualTypeOf<readonly (string | number)[]>();
  expectTypeOf<Extract<NbtError, { kind: "TagMismatch" }>>().toHaveProperty("expected");
});

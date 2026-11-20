export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type Path = readonly (string | number)[];

export type TagName =
  | "end"
  | "byte"
  | "short"
  | "int"
  | "long"
  | "float"
  | "double"
  | "byteArray"
  | "string"
  | "list"
  | "compound"
  | "intArray"
  | "longArray";

type Located = { readonly path: Path; readonly offset?: number };

export type NbtError = Located &
  (
    | { readonly kind: "UnexpectedEnd" }
    | { readonly kind: "BadTag" }
    | { readonly kind: "NegativeLength" }
    | { readonly kind: "TrailingBytes" }
    | { readonly kind: "InvalidString" }
    | { readonly kind: "DuplicateKey" }
    | { readonly kind: "TagMismatch"; readonly expected: TagName; readonly found: TagName }
    | { readonly kind: "MissingKey" }
    | { readonly kind: "UnknownKey" }
    | { readonly kind: "TooDeep" }
    | { readonly kind: "OutOfRange"; readonly expected: TagName; readonly value: number | bigint }
    | { readonly kind: "StringTooLong" }
    | { readonly kind: "UnknownFormat" }
    | { readonly kind: "CompressionFailed" }
  );

type Kinds<K extends NbtError["kind"]> = Extract<NbtError, { readonly kind: K }>;

type DataKind = "TagMismatch" | "MissingKey" | "UnknownKey" | "TooDeep";
type DecodeKind =
  | DataKind
  | "UnexpectedEnd"
  | "BadTag"
  | "NegativeLength"
  | "TrailingBytes"
  | "InvalidString"
  | "DuplicateKey";
type EncodeKind = DataKind | "OutOfRange" | "StringTooLong";

export type DecodeError = Kinds<DecodeKind>;
export type ReadError = Kinds<DecodeKind | "UnknownFormat" | "CompressionFailed">;
export type EncodeError = Kinds<EncodeKind>;
export type WriteError = Kinds<EncodeKind | "CompressionFailed">;
export type ValidateError = Kinds<EncodeKind>;
export type DetectError = Kinds<"UnknownFormat">;
export type CompressionError = Kinds<"CompressionFailed">;

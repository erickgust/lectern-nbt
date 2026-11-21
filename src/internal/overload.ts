import { plain, type Codec } from "../codec.js";

export interface Arguments<O> {
  readonly codec: Codec | undefined;
  readonly options: O;
}

export function codecOrOptions<O extends object>(
  first: Codec | O | undefined,
  second: O | undefined,
): Arguments<Partial<O>> {
  if (first !== undefined && "tag" in first) return { codec: plain(first), options: second ?? {} };
  return { codec: undefined, options: first ?? {} };
}

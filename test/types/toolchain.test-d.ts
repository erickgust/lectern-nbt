import { expectTypeOf, test } from "vitest";

const pair = (a: number, b: string): [number, string] => [a, b];

test("typecheck mode runs", () => {
  expectTypeOf(pair).returns.toEqualTypeOf<[number, string]>();
  // @ts-expect-error
  pair("1", 2);
});

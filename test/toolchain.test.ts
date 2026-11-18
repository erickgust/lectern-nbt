import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";

test.prop([fc.string()])("fast-check runs under vitest", (s) => {
  expect(JSON.parse(JSON.stringify(s))).toBe(s);
});

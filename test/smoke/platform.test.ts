import { expect, test } from "vitest";
import { scenario } from "./scenario.js";

test("the library works in this runtime", async () => {
  expect(await scenario()).toEqual([]);
});

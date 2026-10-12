import { expect, test } from "bun:test";

import { sortByOrder } from "@/shared/sortByOrder.ts";

test("items go in their order's order, those it doesn't name after them as given", () => {
  const order = ["strength", "dexterity", "constitution"];
  const items = ["luck", "constitution", "force points", "strength"];
  expect(sortByOrder(items, order, (item) => item)).toEqual(["strength", "constitution", "luck", "force points"]);
  expect(items[0]).toBe("luck");
});

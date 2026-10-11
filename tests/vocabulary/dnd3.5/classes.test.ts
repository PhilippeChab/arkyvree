import { describe, expect, test } from "bun:test";

import { DEFAULT_HIT_DIE, HIT_DIE_VALUES } from "@/vocabulary/dnd3.5/classes.ts";

describe("A class's hit die", () => {
  test("is one of the books' dice, a new class's too", () => {
    expect(HIT_DIE_VALUES).toEqual([4, 6, 8, 10, 12]);
    expect(HIT_DIE_VALUES).toContain(DEFAULT_HIT_DIE);
  });
});

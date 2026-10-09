import { describe, expect, test } from "bun:test";

import { formatHitDie, HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";

describe("formatHitDie", () => {
  test("names each hit die as the books write it", () => {
    expect(HIT_DIE_VALUES.map(formatHitDie)).toEqual(["d4", "d6", "d8", "d10", "d12"]);
  });
});

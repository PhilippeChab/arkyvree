import { describe, expect, test } from "bun:test";

import RaceFields from "@/engine/rulesets/dnd3.5/entities/races/RaceFields.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

describe("A race's fields", () => {
  test("are each true when its property says so, and false without it", () => {
    expect(RaceFields.read([])).toEqual({ quadruped: false, speedIgnoresEncumbrance: false });
    expect(
      RaceFields.read([
        { type: RACE_QUADRUPED, value: "true" },
        { type: RACE_SPEED_IGNORES_ENCUMBRANCE, value: "false" },
        { type: "SOMETHING_ELSE", value: "true" },
      ]),
    ).toEqual({ quadruped: true, speedIgnoresEncumbrance: false });
  });
});

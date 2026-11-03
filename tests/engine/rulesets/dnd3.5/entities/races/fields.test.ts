import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import { heldValues } from "@/tests/support/ownerValues.ts";
import {
  RACE_BASE_SPEED,
  RACE_QUADRUPED,
  RACE_SIZE,
  RACE_SPEED_IGNORES_ENCUMBRANCE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A race's fields", () => {
  test("are its size and speed as stored (Medium and 30 without them), and each flag true when its value says so", () => {
    expect(RACE_FIELDS.read(OwnerValues.NONE)).toEqual({
      baseSpeed: 30,
      quadruped: false,
      size: "Medium",
      speedIgnoresEncumbrance: false,
    });
    expect(
      RACE_FIELDS.read(
        heldValues([
          [RACE_SIZE, "Small"],
          [RACE_BASE_SPEED, 20],
          [RACE_QUADRUPED, true],
          [RACE_SPEED_IGNORES_ENCUMBRANCE, false],
          ["SOMETHING_ELSE", true],
        ]),
      ),
    ).toEqual({ baseSpeed: 20, quadruped: true, size: "Small", speedIgnoresEncumbrance: false });
  });
});

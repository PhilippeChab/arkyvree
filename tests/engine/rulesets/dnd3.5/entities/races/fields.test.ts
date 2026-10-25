import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("A race's fields", () => {
  test("are each true when its value says so, and false without it", () => {
    expect(RACE_FIELDS.read(OwnerValues.NONE)).toEqual({ quadruped: false, speedIgnoresEncumbrance: false });
    expect(
      RACE_FIELDS.read(
        storedValues([
          [RACE_QUADRUPED, true],
          [RACE_SPEED_IGNORES_ENCUMBRANCE, false],
          ["SOMETHING_ELSE", true],
        ]),
      ),
    ).toEqual({ quadruped: true, speedIgnoresEncumbrance: false });
  });
});

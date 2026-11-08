import { describe, expect, test } from "bun:test";

import type { ClassLevel } from "@/codegen/dnd5.2/tools/types/classes.ts";
import { readClassLevels } from "@/tests/support/dnd5.2/references.ts";
import { MAX_SPELL_LEVEL, MULTICLASS_SPELL_SLOTS, PACT_MAGIC_SLOTS } from "@/vocabulary/dnd5.2/spells.ts";

/** The SRD's classes whose levels all count toward spell slots, and those whose half do, rounded up. */
const FULL_CASTERS = ["bard", "cleric", "druid", "sorcerer", "wizard"];
const HALF_CASTERS = ["paladin", "ranger"];

/** A level's slots by spell level, 1 to 9, as its class's table gives them. */
function slotsOf(level: ClassLevel): number[] {
  return Array.from({ length: MAX_SPELL_LEVEL }, (_, i) => level.spellcasting?.[`spell_slots_level_${i + 1}`] ?? 0);
}

describe("The spell slot tables", () => {
  test("give a full caster the Multiclass Spellcaster table's slots at its level, a half caster's at half its own", () => {
    for (const name of FULL_CASTERS)
      expect(readClassLevels(name).map(slotsOf)).toEqual(MULTICLASS_SPELL_SLOTS.map((slots) => [...slots]));
    for (const name of HALF_CASTERS) {
      expect(readClassLevels(name).map(slotsOf)).toEqual(
        readClassLevels(name).map((level) => [...MULTICLASS_SPELL_SLOTS[Math.ceil(level.level / 2) - 1]]),
      );
    }
  });

  test("give a warlock the Pact Magic slots its table gives, all of its highest slot level", () => {
    expect(
      readClassLevels("warlock").map((level) => {
        const slots = slotsOf(level);
        const highest = slots.findLastIndex((count) => count > 0);
        return { slots: slots[highest], level: highest + 1 };
      }),
    ).toEqual([...PACT_MAGIC_SLOTS]);
  });
});

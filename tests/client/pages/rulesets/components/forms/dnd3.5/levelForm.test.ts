import { describe, expect, test } from "bun:test";

import {
  emptyLevel,
  type LevelLists,
  levelListsOf,
  nextLevel,
  readLevel,
  withAllAmounts,
} from "@/client/src/pages/rulesets/components/forms/levelForm.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";

/** A save's base bonus, as a level's form holds it and its save sends it: its `baseBonus` link's. */
const FORTITUDE = { toId: "fortitude", amount: 2 };

/** A 3.5 class level's lists of links, as its rules describe them: its saves' bases and its granted feats. */
const LISTS: LevelLists = levelListsOf(CLASS_LEVEL_FIELDS.describe() as unknown as EntityField[]);

/** A class level as its route reads it, its saves' bases among it, by their links' role. */
function level(number: number, baseBonus: { amount: number; toId: string }[]) {
  return readLevel({ id: `l${number}`, position: number, updatedAt: "", baseBonus }, LISTS);
}

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its saves (its fields: `withEntityFields`)", () => {
    const levels = [level(2, [{ ...FORTITUDE, amount: 3 }]), level(1, [FORTITUDE])];
    expect(nextLevel(levels, LISTS)).toEqual({
      position: 3,
      links: { baseBonus: [{ ...FORTITUDE, amount: 3 }], grants: [] },
    });
  });

  test("starts from the first level's empty form for a class without one, or while its levels load", () => {
    expect([nextLevel([], LISTS), nextLevel(undefined, LISTS)]).toEqual([emptyLevel(LISTS), emptyLevel(LISTS)]);
    expect(emptyLevel(LISTS)).toEqual({ position: 1, links: { baseBonus: [], grants: [] } });
  });

  test("reads a level's grants and amounts at their links' roles", () => {
    const read = readLevel(
      {
        id: "l1",
        position: 1,
        updatedAt: "",
        baseBonus: [FORTITUDE],
        grants: [{ id: "dodge", name: "Dodge", description: null, viaId: "general", viaName: "General", free: true }],
      },
      LISTS,
    );
    expect(read.amounts).toEqual([{ entityId: "fortitude", amount: 2 }]);
    expect(read.grants).toEqual([
      { entityId: "dodge", name: "Dodge", description: null, viaId: "general", viaName: "General", free: true },
    ]);
  });

  test("sends every ruleset save, 0 when unset, and its own until they load", () => {
    const saves = [FORTITUDE];
    expect(withAllAmounts([{ id: "fortitude" }, { id: "will" }], saves)).toEqual([
      FORTITUDE,
      { toId: "will", amount: 0 },
    ]);
    expect(withAllAmounts(undefined, saves)).toBe(saves);
  });
});

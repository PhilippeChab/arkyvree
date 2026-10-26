import { describe, expect, test } from "bun:test";

import {
  emptyLevel,
  type LevelColumns,
  nextLevel,
  readLevel,
  withAllAmounts,
} from "@/client/src/pages/rulesets/components/forms/levelForm.ts";
import { CLASS_LEVEL_COLUMNS } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";

/** A 3.5 class level's columns past its fields: its saves' bases and its granted feats. */
const COLUMNS: LevelColumns = {
  amounts: CLASS_LEVEL_COLUMNS.find((column) => column.input === "amounts"),
  grants: CLASS_LEVEL_COLUMNS.find((column) => column.input === "grants"),
} as LevelColumns;

/** A save's base bonus, as a level's form holds it and its save sends it: its `baseBonus` link's. */
const FORTITUDE = { toId: "fortitude", amount: 2 };

/** A class level as its route reads it, its saves' bases among it, by their links' role. */
function level(number: number, baseBonus: { amount: number; toId: string }[]) {
  return readLevel({ id: `l${number}`, position: number, updatedAt: "", baseBonus }, COLUMNS);
}

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its saves (its fields: `withEntityFields`)", () => {
    const levels = [level(2, [{ ...FORTITUDE, amount: 3 }]), level(1, [FORTITUDE])];
    expect(nextLevel(levels, COLUMNS)).toEqual({
      position: 3,
      links: { baseBonus: [{ ...FORTITUDE, amount: 3 }], grants: [] },
    });
  });

  test("starts from the first level's empty form for a class without one, or while its levels load", () => {
    expect([nextLevel([], COLUMNS), nextLevel(undefined, COLUMNS)]).toEqual([emptyLevel(COLUMNS), emptyLevel(COLUMNS)]);
    expect(emptyLevel(COLUMNS)).toEqual({ position: 1, links: { baseBonus: [], grants: [] } });
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
      COLUMNS,
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
